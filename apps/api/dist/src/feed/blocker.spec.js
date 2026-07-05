"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const feed_controller_1 = require("./feed.controller");
const feed_service_1 = require("./feed.service");
const team_resolver_service_1 = require("./team-resolver.service");
const prisma_service_1 = require("../prisma/prisma.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const client_1 = require("@prisma/client");
const vitest_1 = require("vitest");
const common_1 = require("@nestjs/common");
(0, vitest_1.describe)('Blocker Lifecycle Integration & Authorization', () => {
    let controller;
    let prisma;
    let tenantId;
    let testUserId;
    let managerUserId;
    let randomUserId;
    let testProjectId;
    let testSprintId;
    let testTaskId;
    let testBlockerId;
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        const teamResolver = new team_resolver_service_1.TeamResolverService(prisma);
        const feedService = new feed_service_1.FeedService(prisma, teamResolver);
        controller = new feed_controller_1.FeedController(feedService, prisma);
        const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
        tenantId = tenant.id;
        const superAdmin = await prisma.user.findFirst({
            where: { email: 'superadmin@indotek.com' }
        });
        superAdmin ? (managerUserId = superAdmin.id) : null;
        const reporter = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
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
        const unauthorized = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
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
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
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
                    status: client_1.TaskStatus.BLOCKED,
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
    (0, vitest_1.afterAll)(async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
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
    (0, vitest_1.it)('should deny blocker resolution to unauthorized users', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const mockReq = {
                user: {
                    id: randomUserId,
                    email: 'random-unauthorized@indotek.com',
                    roles: ['EMPLOYEE']
                }
            };
            await (0, vitest_1.expect)(controller.resolveBlocker(testBlockerId, mockReq)).rejects.toThrow(common_1.ForbiddenException);
        });
    });
    (0, vitest_1.it)('should allow manager to resolve blocker, update task status, and notify reporter', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const mockReq = {
                user: {
                    id: managerUserId,
                    email: 'superadmin@indotek.com',
                    fullName: 'Super Admin',
                    roles: ['SUPER_ADMIN']
                }
            };
            const response = await controller.resolveBlocker(testBlockerId, mockReq);
            (0, vitest_1.expect)(response.message).toBe('Blocker berhasil diselesaikan');
            (0, vitest_1.expect)(response.blocker.status).toBe(client_1.BlockerStatus.RESOLVED);
            const task = await prisma.task.findUnique({ where: { id: testTaskId } });
            (0, vitest_1.expect)(task?.status).toBe(client_1.TaskStatus.IN_PROGRESS);
            const notifications = await prisma.notification.findMany({
                where: { user_id: testUserId, kind: client_1.NotificationKind.ESCALATION }
            });
            (0, vitest_1.expect)(notifications.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(notifications[0].payload_json.title).toBe('Blocker Terselesaikan');
        });
    });
});
//# sourceMappingURL=blocker.spec.js.map