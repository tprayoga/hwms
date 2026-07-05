import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { TeamResolverService } from './team-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { TaskStatus, BlockerStatus, NotificationKind } from '@prisma/client';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Blocker Lifecycle Integration & Authorization', () => {
  let controller: FeedController;
  let prisma: PrismaService;
  
  let tenantId: string;
  let testUserId: string;
  let managerUserId: string;
  let randomUserId: string;

  let testProjectId: string;
  let testSprintId: string;
  let testTaskId: string;
  let testBlockerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const teamResolver = new TeamResolverService(prisma);
    const feedService = new FeedService(prisma, teamResolver);
    controller = new FeedController(feedService, prisma);

    // Retrieve default seed tenant
    const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
    tenantId = tenant!.id;

    // Get seed users
    const superAdmin = await prisma.user.findFirst({
      where: { email: 'superadmin@indotek.com' }
    });
    superAdmin ? (managerUserId = superAdmin.id) : null;

    // Create a temporary reporter user
    const reporter = await tenantLocalStorage.run({ tenantId }, () => {
      return prisma.user.create({
        data: {
          tenant_id: tenantId,
          email: 'reporter-blocker@indotek.com',
          full_name: 'Reporter Blocker',
          nik: 'NIK-BL-REP',
          password_hash: 'hash',
          system_roles: ['EMPLOYEE'],
          manager_id: managerUserId,
          joined_at: new Date()
        }
      });
    });
    testUserId = reporter.id;

    // Create a random unauthorized user
    const unauthorized = await tenantLocalStorage.run({ tenantId }, () => {
      return prisma.user.create({
        data: {
          tenant_id: tenantId,
          email: 'random-unauthorized@indotek.com',
          full_name: 'Random Unauthorized',
          nik: 'NIK-BL-UNAUTH',
          password_hash: 'hash',
          system_roles: ['EMPLOYEE'],
          joined_at: new Date()
        }
      });
    });
    randomUserId = unauthorized.id;

    // Create temporary project, sprint, task, blocker
    await tenantLocalStorage.run({ tenantId }, async () => {
      const project = await prisma.project.create({
        data: {
          tenant_id: tenantId,
          name: 'Blocker Project',
          code_prefix: 'BPRJ'
        }
      });
      testProjectId = project.id;

      const sprint = await prisma.sprint.create({
        data: {
          tenant_id: tenantId,
          project_id: project.id,
          number: 1,
          start_date: new Date('2026-07-01'),
          end_date: new Date('2026-07-14')
        }
      });
      testSprintId = sprint.id;

      const task = await prisma.task.create({
        data: {
          tenant_id: tenantId,
          project_id: project.id,
          sprint_id: sprint.id,
          title: 'Blocked Task',
          code: 'BPRJ-01-0001',
          status: TaskStatus.BLOCKED,
          planned_start: new Date('2026-07-01'),
          planned_end: new Date('2026-07-14'),
          workstream: 'General'
        }
      });
      testTaskId = task.id;

      const blocker = await prisma.blocker.create({
        data: {
          tenant_id: tenantId,
          task_id: task.id,
          reported_by: testUserId,
          description: 'Technical debt blocker'
        }
      });
      testBlockerId = blocker.id;
    });
  });

  afterAll(async () => {
    // Teardown temporary resources
    await tenantLocalStorage.run({ tenantId }, async () => {
      if (testUserId) {
        await prisma.notification.deleteMany({ where: { user_id: testUserId } });
      }
      if (testTaskId) {
        await prisma.blocker.deleteMany({ where: { task_id: testTaskId } });
        await prisma.task.deleteMany({ where: { id: testTaskId } });
      }
      if (testSprintId) {
        await prisma.sprint.deleteMany({ where: { id: testSprintId } });
      }
      if (testProjectId) {
        await prisma.project.deleteMany({ where: { id: testProjectId } });
      }
      if (testUserId) {
        await prisma.user.deleteMany({ where: { id: testUserId } });
      }
      if (randomUserId) {
        await prisma.user.deleteMany({ where: { id: randomUserId } });
      }
    });
  });

  it('should deny blocker resolution to unauthorized users', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const mockReq = {
        user: {
          id: randomUserId,
          email: 'random-unauthorized@indotek.com',
          roles: ['EMPLOYEE']
        }
      };

      await expect(
        controller.resolveBlocker(testBlockerId, mockReq)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it('should allow manager to resolve blocker, update task status, and notify reporter', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const mockReq = {
        user: {
          id: managerUserId,
          email: 'superadmin@indotek.com',
          fullName: 'Super Admin',
          roles: ['SUPER_ADMIN']
        }
      };

      const response = await controller.resolveBlocker(testBlockerId, mockReq);
      
      expect(response.message).toBe('Blocker berhasil diselesaikan');
      expect(response.blocker.status).toBe(BlockerStatus.RESOLVED);

      // Verify task status was updated back to IN_PROGRESS
      const task = await prisma.task.findUnique({ where: { id: testTaskId } });
      expect(task?.status).toBe(TaskStatus.IN_PROGRESS);

      // Verify in-app notification was sent to reporter
      const notifications = await prisma.notification.findMany({
        where: { user_id: testUserId, kind: NotificationKind.ESCALATION }
      });
      expect(notifications.length).toBeGreaterThan(0);
      expect((notifications[0].payload_json as any).title).toBe('Blocker Terselesaikan');
    });
  });
});
