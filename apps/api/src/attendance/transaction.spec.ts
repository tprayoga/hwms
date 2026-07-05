import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { TaskStatus, CheckinType, WorkStatus, BlockerStatus } from '@prisma/client';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

describe('Attendance Checkin/Checkout Transaction Integration', () => {
  let service: AttendanceService;
  let prisma: PrismaService;
  let redis: RedisService;
  
  let tenantId: string;
  let testUserId: string;
  let testProjectId: string;
  let testSprintId: string;
  let testTaskId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    redis = new RedisService();

    service = new AttendanceService(prisma, redis);

    // Retrieve default seeded tenant and user
    const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
    tenantId = tenant!.id;

    const superadmin = await prisma.user.findUnique({ where: { email: 'superadmin@indotek.com' } });
    testUserId = superadmin!.id;

    // Preemptively clean up check-ins and notifications for test user
    await tenantLocalStorage.run({ tenantId }, async () => {
      await prisma.notification.deleteMany({ where: { user_id: testUserId } });
      await prisma.standupItem.deleteMany({ where: { checkin: { user_id: testUserId } } });
      await prisma.blocker.deleteMany({ where: { reported_by: testUserId } });
      await prisma.checkin.deleteMany({ where: { user_id: testUserId } });
      
      // Clean up previous tasks, sprints, projects if they exist from previous crashed runs
      await prisma.taskEvidence.deleteMany({ where: { task: { code: 'TXTEST-01-0001' } } });
      await prisma.taskAssignment.deleteMany({ where: { task: { code: 'TXTEST-01-0001' } } });
      await prisma.task.deleteMany({ where: { code: 'TXTEST-01-0001' } });
      await prisma.sprint.deleteMany({ where: { project: { code_prefix: 'TXTEST' } } });
      await prisma.project.deleteMany({ where: { code_prefix: 'TXTEST' } });
    });

    // Create temporary project, sprint, and task for atomic testing
    const project = await tenantLocalStorage.run({ tenantId }, () => {
      return prisma.project.create({
        data: {
          name: 'Transaction Test Project',
          code_prefix: 'TXTEST',
          tenant_id: tenantId,
        }
      });
    });
    testProjectId = project.id;

    const sprint = await tenantLocalStorage.run({ tenantId }, () => {
      return prisma.sprint.create({
        data: {
          project_id: testProjectId,
          number: 1,
          start_date: new Date('2026-07-01T00:00:00Z'),
          end_date: new Date('2026-07-14T00:00:00Z'),
          tenant_id: tenantId,
        }
      });
    });
    testSprintId = sprint.id;

    const task = await tenantLocalStorage.run({ tenantId }, () => {
      return prisma.task.create({
        data: {
          project_id: testProjectId,
          sprint_id: testSprintId,
          code: 'TXTEST-01-0001',
          workstream: 'Testing',
          title: 'Transaction Integration Test Task',
          planned_start: new Date('2026-07-06T00:00:00Z'),
          planned_end: new Date('2026-07-08T00:00:00Z'),
          status: TaskStatus.NOT_STARTED,
          percent_complete: 0,
          tenant_id: tenantId,
        }
      });
    });
    testTaskId = task.id;

    // Assign task to test user
    await tenantLocalStorage.run({ tenantId }, () => {
      return prisma.taskAssignment.create({
        data: {
          task_id: testTaskId,
          user_id: testUserId,
          tenant_id: tenantId,
        }
      });
    });
  });

  afterAll(async () => {
    // Cleanup temporary test data in reverse order of dependencies
    await tenantLocalStorage.run({ tenantId }, async () => {
      if (testUserId) {
        await prisma.notification.deleteMany({ where: { user_id: testUserId } });
        await prisma.standupItem.deleteMany({ where: { checkin: { user_id: testUserId } } });
        await prisma.blocker.deleteMany({ where: { reported_by: testUserId } });
        await prisma.checkin.deleteMany({ where: { user_id: testUserId } });
      }
      if (testTaskId) {
        await prisma.standupItem.deleteMany({ where: { task_id: testTaskId } });
        await prisma.blocker.deleteMany({ where: { task_id: testTaskId } });
        await prisma.taskEvidence.deleteMany({ where: { task_id: testTaskId } });
        await prisma.taskAssignment.deleteMany({ where: { task_id: testTaskId } });
        await prisma.task.delete({ where: { id: testTaskId } });
      }
      if (testSprintId) {
        await prisma.sprint.delete({ where: { id: testSprintId } });
      }
      if (testProjectId) {
        await prisma.project.delete({ where: { id: testProjectId } });
      }
    });

    await prisma.onModuleDestroy();
    await redis.onModuleDestroy();
  });

  it('should process checkin, create standup item and blocker, and block the task atomically', async () => {
    const checkinBody = {
      workStatus: WorkStatus.WFO,
      lat: '-6.917464',
      lng: '107.619122',
      accuracy: '15',
      items: JSON.stringify([{ taskId: testTaskId, note: 'Need to write integration tests' }]),
      blocker: JSON.stringify({
        taskId: testTaskId,
        description: 'Test Blocker: Waiting for Redis mock confirmation',
        mentionedUserIds: [testUserId],
      }),
      deviceTimestamp: new Date().toISOString()
    };

    // Run check-in operation
    const checkin = await tenantLocalStorage.run({ tenantId }, () => {
      return service.checkin(testUserId, 'selfie_key_in.jpg', checkinBody, true);
    });

    expect(checkin.id).toBeDefined();
    expect(checkin.geofence_ok).toBe(true);

    // Verify standup item exists
    const standupItems = await prisma.standupItem.findMany({
      where: { checkin_id: checkin.id }
    });
    expect(standupItems).toHaveLength(1);
    expect(standupItems[0].task_id).toBe(testTaskId);
    expect(standupItems[0].planned).toBe(true);

    // Verify blocker was created
    const blockers = await prisma.blocker.findMany({
      where: { task_id: testTaskId }
    });
    expect(blockers).toHaveLength(1);
    expect(blockers[0].status).toBe(BlockerStatus.OPEN);
    expect(blockers[0].reported_by).toBe(testUserId);

    // Verify task status was updated to BLOCKED
    const task = await prisma.task.findUnique({ where: { id: testTaskId } });
    expect(task!.status).toBe(TaskStatus.BLOCKED);

    // Verify in-app mention notification was created
    const notifications = await prisma.notification.findMany({
      where: { user_id: testUserId }
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    // ==========================================
    // CHECKOUT TESTING
    // ==========================================
    const checkoutBody = {
      lat: '-6.917464',
      lng: '107.619122',
      updates: JSON.stringify([
        {
          taskId: testTaskId,
          percent: '85',
          status: TaskStatus.IN_PROGRESS,
          evidence: 'https://github.com/indotek/hwms/pull/123'
        }
      ]),
      dailyNote: 'Did progress, not done yet, so carried over',
      deviceTimestamp: new Date().toISOString()
    };

    const checkout = await tenantLocalStorage.run({ tenantId }, () => {
      return service.checkout(testUserId, checkin.id, 'selfie_key_out.jpg', checkoutBody);
    });

    expect(checkout.id).toBeDefined();
    expect(checkout.type).toBe(CheckinType.OUT);

    // Verify standup item was updated with checkout percent & status, and marked carried_over
    const updatedStandup = await prisma.standupItem.findFirst({
      where: { checkin_id: checkin.id, task_id: testTaskId }
    });
    expect(updatedStandup!.percent_after).toBe(85);
    expect(updatedStandup!.status_after).toBe(TaskStatus.IN_PROGRESS);
    expect(updatedStandup!.is_carried_over).toBe(true); // Since it was not DONE

    // Verify task progress and status were copied directly
    const updatedTask = await prisma.task.findUnique({ where: { id: testTaskId } });
    expect(updatedTask!.percent_complete).toBe(85);
    expect(updatedTask!.status).toBe(TaskStatus.IN_PROGRESS);

    // Verify task evidence was recorded
    const evidences = await prisma.taskEvidence.findMany({
      where: { task_id: testTaskId }
    });
    expect(evidences).toHaveLength(1);
    expect(evidences[0].url_or_key).toBe('https://github.com/indotek/hwms/pull/123');
  });
});
