"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const task_service_1 = require("./task.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const common_1 = require("@nestjs/common");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Sprint Overlap Check', () => {
    let service;
    let prisma;
    (0, vitest_1.beforeAll)(() => {
        prisma = {
            sprint: {
                findFirst: vitest_1.vi.fn(),
                create: vitest_1.vi.fn(),
            },
        };
        service = new task_service_1.TaskService(prisma, null, { triggerRefresh: vitest_1.vi.fn() });
    });
    (0, vitest_1.it)('should block sprint creation if dates overlap with another sprint in same project', async () => {
        vitest_1.vi.spyOn(prisma.sprint, 'findFirst').mockResolvedValue({
            id: 'existing-sprint-id',
            number: 1,
        });
        const body = {
            projectId: 'proj-id',
            number: 2,
            startDate: '2026-07-01T00:00:00Z',
            endDate: '2026-07-14T00:00:00Z',
        };
        await (0, vitest_1.expect)(tenant_storage_1.tenantLocalStorage.run({ tenantId: 'tenant-id' }, () => {
            return service.createSprint(body);
        })).rejects.toThrow(new common_1.BadRequestException('SPRINT_OVERLAP'));
    });
    (0, vitest_1.it)('should allow sprint creation if no overlapping dates are found', async () => {
        vitest_1.vi.spyOn(prisma.sprint, 'findFirst').mockResolvedValue(null);
        const createSpy = vitest_1.vi.spyOn(prisma.sprint, 'create').mockResolvedValue({
            id: 'new-sprint-id',
            number: 2,
        });
        const body = {
            projectId: 'proj-id',
            number: 2,
            startDate: '2026-07-15T00:00:00Z',
            endDate: '2026-07-28T00:00:00Z',
        };
        const result = await tenant_storage_1.tenantLocalStorage.run({ tenantId: 'tenant-id' }, () => {
            return service.createSprint(body);
        });
        (0, vitest_1.expect)(result.id).toBe('new-sprint-id');
        (0, vitest_1.expect)(createSpy).toHaveBeenCalled();
    });
});
//# sourceMappingURL=sprint-overlap.spec.js.map