"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const attendance_service_1 = require("./attendance.service");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const client_1 = require("@prisma/client");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Attendance Checkin/Checkout Transaction Integration', () => {
    let service;
    let prisma;
    let redis;
    let tenantId;
    let testUserId;
    let testProjectId;
    let testSprintId;
    let testTaskId;
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        redis = new redis_service_1.RedisService();
        service = new attendance_service_1.AttendanceService(prisma, redis);
        const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
        tenantId = tenant.id;
        const superadmin = await prisma.user.findUnique({ where: { email: 'superadmin@indotek.com' } });
        testUserId = superadmin.id;
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            await prisma.notification.deleteMany({ where: { user_id: testUserId } });
            await prisma.standupItem.deleteMany({ where: { checkin: { user_id: testUserId } } });
            await prisma.blocker.deleteMany({ where: { reported_by: testUserId } });
            await prisma.checkin.deleteMany({ where: { user_id: testUserId } });
            await prisma.taskEvidence.deleteMany({ where: { task: { code: 'TXTEST-01-0001' } } });
            await prisma.taskAssignment.deleteMany({ where: { task: { code: 'TXTEST-01-0001' } } });
            await prisma.task.deleteMany({ where: { code: 'TXTEST-01-0001' } });
            await prisma.sprint.deleteMany({ where: { project: { code_prefix: 'TXTEST' } } });
            await prisma.project.deleteMany({ where: { code_prefix: 'TXTEST' } });
        });
        const project = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
            return prisma.project.create({
                data: {
                    name: 'Transaction Test Project',
                    code_prefix: 'TXTEST',
                    tenant_id: tenantId,
                }
            });
        });
        testProjectId = project.id;
        const sprint = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
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
        const task = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
            return prisma.task.create({
                data: {
                    project_id: testProjectId,
                    sprint_id: testSprintId,
                    code: 'TXTEST-01-0001',
                    workstream: 'Testing',
                    title: 'Transaction Integration Test Task',
                    planned_start: new Date('2026-07-06T00:00:00Z'),
                    planned_end: new Date('2026-07-08T00:00:00Z'),
                    status: client_1.TaskStatus.NOT_STARTED,
                    percent_complete: 0,
                    tenant_id: tenantId,
                }
            });
        });
        testTaskId = task.id;
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
            return prisma.taskAssignment.create({
                data: {
                    task_id: testTaskId,
                    user_id: testUserId,
                    tenant_id: tenantId,
                }
            });
        });
    });
    (0, vitest_1.afterAll)(async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
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
    (0, vitest_1.it)('should process checkin, create standup item and blocker, and block the task atomically', async () => {
        const checkinBody = {
            workStatus: client_1.WorkStatus.WFO,
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
        const checkin = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
            return service.checkin(testUserId, 'selfie_key_in.jpg', checkinBody, true);
        });
        (0, vitest_1.expect)(checkin.id).toBeDefined();
        (0, vitest_1.expect)(checkin.geofence_ok).toBe(true);
        const standupItems = await prisma.standupItem.findMany({
            where: { checkin_id: checkin.id }
        });
        (0, vitest_1.expect)(standupItems).toHaveLength(1);
        (0, vitest_1.expect)(standupItems[0].task_id).toBe(testTaskId);
        (0, vitest_1.expect)(standupItems[0].planned).toBe(true);
        const blockers = await prisma.blocker.findMany({
            where: { task_id: testTaskId }
        });
        (0, vitest_1.expect)(blockers).toHaveLength(1);
        (0, vitest_1.expect)(blockers[0].status).toBe(client_1.BlockerStatus.OPEN);
        (0, vitest_1.expect)(blockers[0].reported_by).toBe(testUserId);
        const task = await prisma.task.findUnique({ where: { id: testTaskId } });
        (0, vitest_1.expect)(task.status).toBe(client_1.TaskStatus.BLOCKED);
        const notifications = await prisma.notification.findMany({
            where: { user_id: testUserId }
        });
        (0, vitest_1.expect)(notifications.length).toBeGreaterThanOrEqual(1);
        const checkoutBody = {
            lat: '-6.917464',
            lng: '107.619122',
            updates: JSON.stringify([
                {
                    taskId: testTaskId,
                    percent: '85',
                    status: client_1.TaskStatus.IN_PROGRESS,
                    evidence: 'https://github.com/indotek/hwms/pull/123'
                }
            ]),
            dailyNote: 'Did progress, not done yet, so carried over',
            deviceTimestamp: new Date().toISOString()
        };
        const checkout = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
            return service.checkout(testUserId, checkin.id, 'selfie_key_out.jpg', checkoutBody);
        });
        (0, vitest_1.expect)(checkout.id).toBeDefined();
        (0, vitest_1.expect)(checkout.type).toBe(client_1.CheckinType.OUT);
        const updatedStandup = await prisma.standupItem.findFirst({
            where: { checkin_id: checkin.id, task_id: testTaskId }
        });
        (0, vitest_1.expect)(updatedStandup.percent_after).toBe(85);
        (0, vitest_1.expect)(updatedStandup.status_after).toBe(client_1.TaskStatus.IN_PROGRESS);
        (0, vitest_1.expect)(updatedStandup.is_carried_over).toBe(true);
        const updatedTask = await prisma.task.findUnique({ where: { id: testTaskId } });
        (0, vitest_1.expect)(updatedTask.percent_complete).toBe(85);
        (0, vitest_1.expect)(updatedTask.status).toBe(client_1.TaskStatus.IN_PROGRESS);
        const evidences = await prisma.taskEvidence.findMany({
            where: { task_id: testTaskId }
        });
        (0, vitest_1.expect)(evidences).toHaveLength(1);
        (0, vitest_1.expect)(evidences[0].url_or_key).toBe('https://github.com/indotek/hwms/pull/123');
    });
});
//# sourceMappingURL=transaction.spec.js.map