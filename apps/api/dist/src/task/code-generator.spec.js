"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const task_service_1 = require("./task.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Task Code Generator & Immutability', () => {
    let service;
    let prisma;
    (0, vitest_1.beforeAll)(() => {
        prisma = {
            project: {
                findUnique: vitest_1.vi.fn(),
            },
            sprint: {
                findUnique: vitest_1.vi.fn(),
            },
            task: {
                count: vitest_1.vi.fn(),
                create: vitest_1.vi.fn(),
                update: vitest_1.vi.fn(),
            },
        };
        const mockAggregation = {
            triggerRefresh: vitest_1.vi.fn(),
        };
        service = new task_service_1.TaskService(prisma, null, mockAggregation);
    });
    (0, vitest_1.it)('should generate code in format PREFIX-SS-NNNN based on project prefix and task sequence', async () => {
        const tenantId = 'tenant-id';
        vitest_1.vi.spyOn(prisma.project, 'findUnique').mockResolvedValue({
            id: 'proj-id',
            code_prefix: 'PROJ',
        });
        vitest_1.vi.spyOn(prisma.sprint, 'findUnique').mockResolvedValue({
            id: 'sprint-id',
            number: 3,
        });
        vitest_1.vi.spyOn(prisma.task, 'count').mockResolvedValue(9);
        const createSpy = vitest_1.vi.spyOn(prisma.task, 'create').mockImplementation((({ data }) => {
            return Promise.resolve({
                id: 'new-task-id',
                code: data.code,
            });
        }));
        const body = {
            projectId: 'proj-id',
            sprintId: 'sprint-id',
            title: 'Test Generator',
            plannedStart: new Date(),
            plannedEnd: new Date(),
        };
        const taskResult = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
            return service.createTask(body);
        });
        (0, vitest_1.expect)(taskResult.code).toBe('PROJ-03-0010');
        (0, vitest_1.expect)(createSpy).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({
                code: 'PROJ-03-0010',
            }),
        }));
    });
    (0, vitest_1.it)('should prevent mutating task code on update (immutability check)', async () => {
        const updateSpy = vitest_1.vi.spyOn(prisma.task, 'update').mockImplementation((({ data }) => {
            (0, vitest_1.expect)(data.code).toBeUndefined();
            return Promise.resolve({
                id: 'task-id',
                code: 'PROJ-03-0010',
                assignments: [],
            });
        }));
        const updateBody = {
            title: 'Updated Title',
            code: 'ATTEMPTED-CHANGE-CODE',
        };
        await service.updateTask('task-id', updateBody);
        (0, vitest_1.expect)(updateSpy).toHaveBeenCalled();
    });
});
//# sourceMappingURL=code-generator.spec.js.map