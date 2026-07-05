"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const path = require("path");
const vitest_1 = require("vitest");
const task_aggregation_service_1 = require("../../src/task/task-aggregation.service");
(0, vitest_1.describe)('Seed full profile: HWMS Internal Rollout demo project', () => {
    const prisma = new client_1.PrismaClient();
    const aggregation = new task_aggregation_service_1.TaskAggregationService({}, {});
    const seedEntry = path.join(__dirname, 'index.ts');
    const apiRoot = path.join(__dirname, '..', '..');
    let projectId;
    const sprintIds = {};
    (0, vitest_1.beforeAll)(async () => {
        (0, child_process_1.execFileSync)('npx', ['ts-node', seedEntry], {
            cwd: apiRoot,
            env: { ...process.env, SEED_PROFILE: 'full' },
            stdio: 'pipe',
        });
        await prisma.$connect();
        const project = await prisma.project.findFirstOrThrow({ where: { name: 'HWMS Internal Rollout' } });
        projectId = project.id;
        const sprints = await prisma.sprint.findMany({ where: { project_id: projectId }, orderBy: { number: 'asc' } });
        for (const s of sprints)
            sprintIds[s.number] = s.id;
    }, 240000);
    (0, vitest_1.afterAll)(async () => {
        await prisma.$disconnect();
    });
    (0, vitest_1.it)('has 4 sprints and ~60 tasks', async () => {
        (0, vitest_1.expect)(Object.keys(sprintIds).length).toBe(4);
        const count = await prisma.task.count({ where: { project_id: projectId } });
        (0, vitest_1.expect)(count).toBe(60);
    });
    (0, vitest_1.it)('per-sprint aggregate equals the production calculateProgress (not hand-written)', async () => {
        const expectedRange = {
            1: [100, 100],
            2: [60, 80],
            3: [20, 40],
            4: [0, 0],
        };
        for (let n = 1; n <= 4; n++) {
            const tasks = await prisma.task.findMany({
                where: { project_id: projectId, sprint_id: sprintIds[n] },
                include: { blockers: true },
            });
            const agg = await aggregation.calculateProgress(tasks);
            const sumW = tasks.reduce((a, t) => a + Number(t.weight), 0);
            const sumWP = tasks.reduce((a, t) => a + Number(t.weight) * t.percent_complete, 0);
            const manual = Math.round((sumWP / sumW) * 100) / 100;
            (0, vitest_1.expect)(agg.progressPct, `sprint ${n} formula parity`).toBe(manual);
            const [lo, hi] = expectedRange[n];
            (0, vitest_1.expect)(agg.progressPct, `sprint ${n} range`).toBeGreaterThanOrEqual(lo);
            (0, vitest_1.expect)(agg.progressPct, `sprint ${n} range`).toBeLessThanOrEqual(hi);
        }
    });
    (0, vitest_1.it)('has 5 active (OPEN) and 3 resolved blockers in the demo project', async () => {
        const open = await prisma.blocker.count({ where: { task: { project_id: projectId }, status: 'OPEN' } });
        const resolved = await prisma.blocker.count({ where: { task: { project_id: projectId }, status: 'RESOLVED' } });
        (0, vitest_1.expect)(open).toBe(5);
        (0, vitest_1.expect)(resolved).toBe(3);
    });
    (0, vitest_1.it)('attached evidence referencing the two shared placeholders', async () => {
        const evidences = await prisma.taskEvidence.findMany({ where: { task: { project_id: projectId } } });
        (0, vitest_1.expect)(evidences.length).toBeGreaterThanOrEqual(10);
        const keys = new Set(evidences.map((e) => e.url_or_key));
        (0, vitest_1.expect)(keys.has('seed/evidence/placeholder.pdf')).toBe(true);
        (0, vitest_1.expect)(keys.has('seed/evidence/placeholder.png')).toBe(true);
    });
    (0, vitest_1.it)('left Saft VE POC untouched (guard effect): 456 tasks, sum(percent_complete)=0', async () => {
        const saft = await prisma.project.findFirstOrThrow({ where: { name: 'Saft VE POC' } });
        const agg = await prisma.task.aggregate({
            where: { project_id: saft.id },
            _count: { _all: true },
            _sum: { percent_complete: true },
        });
        (0, vitest_1.expect)(agg._count._all).toBe(456);
        (0, vitest_1.expect)(agg._sum.percent_complete ?? 0).toBe(0);
    });
});
//# sourceMappingURL=demo-project.spec.js.map