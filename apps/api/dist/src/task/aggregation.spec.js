"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const task_aggregation_service_1 = require("./task-aggregation.service");
const client_1 = require("@prisma/client");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Task Progress Aggregation & RAG Bounds', () => {
    let service;
    (0, vitest_1.beforeAll)(() => {
        service = new task_aggregation_service_1.TaskAggregationService(null, null);
    });
    (0, vitest_1.it)('should return 0% progress and Green RAG when task list is empty', async () => {
        const { progressPct, rag } = await service.calculateProgress([]);
        (0, vitest_1.expect)(progressPct).toBe(0);
        (0, vitest_1.expect)(rag).toBe(client_1.RAGStatus.GREEN);
    });
    (0, vitest_1.it)('should calculate weighted progress correctly for multiple tasks', async () => {
        const tasks = [
            { percent_complete: 50, weight: 1.0, status: client_1.TaskStatus.IN_PROGRESS },
            { percent_complete: 100, weight: 3.0, status: client_1.TaskStatus.DONE },
        ];
        const { progressPct } = await service.calculateProgress(tasks);
        (0, vitest_1.expect)(progressPct).toBe(87.5);
    });
    (0, vitest_1.it)('should handle zero weights correctly defaulting to 0%', async () => {
        const tasks = [
            { percent_complete: 100, weight: 0.0, status: client_1.TaskStatus.DONE },
            { percent_complete: 80, weight: 0.0, status: client_1.TaskStatus.IN_PROGRESS },
        ];
        const { progressPct } = await service.calculateProgress(tasks);
        (0, vitest_1.expect)(progressPct).toBe(0);
    });
    (0, vitest_1.it)('should classify Green RAG for progress >= 85%', async () => {
        const tasks = [{ percent_complete: 85, weight: 1.0, status: client_1.TaskStatus.IN_PROGRESS }];
        const { rag } = await service.calculateProgress(tasks);
        (0, vitest_1.expect)(rag).toBe(client_1.RAGStatus.GREEN);
    });
    (0, vitest_1.it)('should classify Yellow RAG for progress between 60% and 84%', async () => {
        const tasks84 = [{ percent_complete: 84, weight: 1.0, status: client_1.TaskStatus.IN_PROGRESS }];
        const tasks60 = [{ percent_complete: 60, weight: 1.0, status: client_1.TaskStatus.IN_PROGRESS }];
        (0, vitest_1.expect)((await service.calculateProgress(tasks84)).rag).toBe(client_1.RAGStatus.YELLOW);
        (0, vitest_1.expect)((await service.calculateProgress(tasks60)).rag).toBe(client_1.RAGStatus.YELLOW);
    });
    (0, vitest_1.it)('should classify Red RAG for progress < 60% with no blockers or delays', async () => {
        const tasks = [
            {
                percent_complete: 59,
                weight: 1.0,
                status: client_1.TaskStatus.IN_PROGRESS,
                planned_end: new Date(Date.now() + 86400000)
            }
        ];
        const { rag } = await service.calculateProgress(tasks);
        (0, vitest_1.expect)(rag).toBe(client_1.RAGStatus.RED);
    });
    (0, vitest_1.it)('should classify Black RAG for progress < 60% with active blockers', async () => {
        const tasks = [
            {
                percent_complete: 50,
                weight: 1.0,
                status: client_1.TaskStatus.BLOCKED,
                planned_end: new Date(Date.now() + 86400000),
                blockers: [{ status: 'OPEN' }]
            }
        ];
        const { rag } = await service.calculateProgress(tasks);
        (0, vitest_1.expect)(rag).toBe(client_1.RAGStatus.BLACK);
    });
    (0, vitest_1.it)('should classify Black RAG for progress < 60% when delayed past planned end date', async () => {
        const tasks = [
            {
                percent_complete: 40,
                weight: 1.0,
                status: client_1.TaskStatus.IN_PROGRESS,
                planned_end: new Date(Date.now() - 86400000)
            }
        ];
        const { rag } = await service.calculateProgress(tasks);
        (0, vitest_1.expect)(rag).toBe(client_1.RAGStatus.BLACK);
    });
});
//# sourceMappingURL=aggregation.spec.js.map