"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("./prisma.service");
const tenant_storage_1 = require("./tenant-storage");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Multi-Tenant Isolation Integration Gate', () => {
    let prisma;
    let tenantAId;
    let tenantBId;
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        await prisma.task.deleteMany({
            where: { code: { in: ['TNA-00-0001', 'TNB-00-0001'] } }
        });
        await prisma.sprint.deleteMany({
            where: { goal: { in: ['Goal A', 'Goal B'] } }
        });
        await prisma.project.deleteMany({
            where: { name: { in: ['Project Tenant A', 'Project Tenant B'] } }
        });
        await prisma.tenant.deleteMany({
            where: { slug: { in: ['tenant-test-a', 'tenant-test-b'] } }
        });
        const tenantA = await prisma.tenant.create({
            data: {
                name: 'Tenant Test A',
                slug: 'tenant-test-a',
                is_active: true
            }
        });
        tenantAId = tenantA.id;
        const tenantB = await prisma.tenant.create({
            data: {
                name: 'Tenant Test B',
                slug: 'tenant-test-b',
                is_active: true
            }
        });
        tenantBId = tenantB.id;
        await tenant_storage_1.tenantLocalStorage.run({ tenantId: tenantAId }, async () => {
            const projA = await prisma.project.create({
                data: {
                    tenant_id: tenantAId,
                    name: 'Project Tenant A',
                    code_prefix: 'TNA'
                }
            });
            const sprintA = await prisma.sprint.create({
                data: {
                    tenant_id: tenantAId,
                    project_id: projA.id,
                    number: 1,
                    start_date: new Date(),
                    end_date: new Date(),
                    goal: 'Goal A'
                }
            });
            await prisma.task.create({
                data: {
                    tenant_id: tenantAId,
                    project_id: projA.id,
                    sprint_id: sprintA.id,
                    code: 'TNA-00-0001',
                    workstream: 'Scope',
                    title: 'Task Tenant A',
                    deliverable: 'Scope Doc',
                    priority: 'MEDIUM',
                    status: 'NOT_STARTED',
                    percent_complete: 0,
                    weight: 1,
                    planned_start: new Date(),
                    planned_end: new Date()
                }
            });
        });
        await tenant_storage_1.tenantLocalStorage.run({ tenantId: tenantBId }, async () => {
            const projB = await prisma.project.create({
                data: {
                    tenant_id: tenantBId,
                    name: 'Project Tenant B',
                    code_prefix: 'TNB'
                }
            });
            const sprintB = await prisma.sprint.create({
                data: {
                    tenant_id: tenantBId,
                    project_id: projB.id,
                    number: 1,
                    start_date: new Date(),
                    end_date: new Date(),
                    goal: 'Goal B'
                }
            });
            await prisma.task.create({
                data: {
                    tenant_id: tenantBId,
                    project_id: projB.id,
                    sprint_id: sprintB.id,
                    code: 'TNB-00-0001',
                    workstream: 'Scope',
                    title: 'Task Tenant B',
                    deliverable: 'Scope Doc',
                    priority: 'MEDIUM',
                    status: 'NOT_STARTED',
                    percent_complete: 0,
                    weight: 1,
                    planned_start: new Date(),
                    planned_end: new Date()
                }
            });
        });
    });
    (0, vitest_1.it)('should isolate queries on Project and Task between Tenant A and Tenant B', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId: tenantAId }, async () => {
            const projects = await prisma.project.findMany({});
            const tasks = await prisma.task.findMany({});
            (0, vitest_1.expect)(projects.length).toBe(1);
            (0, vitest_1.expect)(projects[0].name).toBe('Project Tenant A');
            (0, vitest_1.expect)(projects[0].tenant_id).toBe(tenantAId);
            (0, vitest_1.expect)(tasks.length).toBe(1);
            (0, vitest_1.expect)(tasks[0].title).toBe('Task Tenant A');
            (0, vitest_1.expect)(tasks[0].tenant_id).toBe(tenantAId);
        });
        await tenant_storage_1.tenantLocalStorage.run({ tenantId: tenantBId }, async () => {
            const projects = await prisma.project.findMany({});
            const tasks = await prisma.task.findMany({});
            (0, vitest_1.expect)(projects.length).toBe(1);
            (0, vitest_1.expect)(projects[0].name).toBe('Project Tenant B');
            (0, vitest_1.expect)(projects[0].tenant_id).toBe(tenantBId);
            (0, vitest_1.expect)(tasks.length).toBe(1);
            (0, vitest_1.expect)(tasks[0].title).toBe('Task Tenant B');
            (0, vitest_1.expect)(tasks[0].tenant_id).toBe(tenantBId);
        });
    });
});
//# sourceMappingURL=tenant-isolation.spec.js.map