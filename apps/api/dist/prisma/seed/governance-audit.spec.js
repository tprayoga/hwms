"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const path = require("path");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Seed full profile: governance & system trace', () => {
    const prisma = new client_1.PrismaClient();
    const seedEntry = path.join(__dirname, 'index.ts');
    const apiRoot = path.join(__dirname, '..', '..');
    let tenantId;
    let projectId;
    function runSeedFull() {
        (0, child_process_1.execFileSync)('npx', ['ts-node', seedEntry], {
            cwd: apiRoot,
            env: { ...process.env, SEED_PROFILE: 'full' },
            stdio: 'pipe',
        });
    }
    async function counts() {
        return {
            okr: await prisma.oKR.count(),
            keyResult: await prisma.keyResult.count(),
            kpi: await prisma.kPI.count(),
            kpiActual: await prisma.kpiActual.count(),
            risk: await prisma.risk.count(),
            gate: await prisma.gate.count(),
            gateDecision: await prisma.gateDecision.count(),
            auditLog: await prisma.auditLog.count(),
            notification: await prisma.notification.count(),
        };
    }
    let first;
    (0, vitest_1.beforeAll)(async () => {
        await prisma.$connect();
        runSeedFull();
        tenantId = (await prisma.tenant.findFirstOrThrow({ where: { slug: 'indotek' } })).id;
        projectId = (await prisma.project.findFirstOrThrow({ where: { name: 'HWMS Internal Rollout' } })).id;
        first = await counts();
    }, 240000);
    (0, vitest_1.afterAll)(async () => {
        await prisma.$disconnect();
    });
    (0, vitest_1.it)('seeded OKR/KPI/Risk with the expected shape', async () => {
        (0, vitest_1.expect)(first.okr).toBe(3);
        (0, vitest_1.expect)(first.kpi).toBe(6);
        (0, vitest_1.expect)(first.risk).toBe(5);
        const high = await prisma.risk.count({ where: { project_id: projectId, probability: 'HIGH', impact: 'HIGH' } });
        const med = await prisma.risk.count({ where: { project_id: projectId, probability: 'MEDIUM', impact: 'MEDIUM' } });
        const low = await prisma.risk.count({ where: { project_id: projectId, probability: 'LOW', impact: 'LOW' } });
        (0, vitest_1.expect)([high, med, low]).toEqual([2, 2, 1]);
    });
    (0, vitest_1.it)('one gate is PASSED (has a decision), one is UPCOMING (no decision)', async () => {
        const gates = await prisma.gate.findMany({ where: { project_id: projectId }, include: { decisions: true } });
        (0, vitest_1.expect)(gates.length).toBe(2);
        const withDecision = gates.filter((g) => g.decisions.length > 0);
        const withoutDecision = gates.filter((g) => g.decisions.length === 0);
        (0, vitest_1.expect)(withDecision.length).toBe(1);
        (0, vitest_1.expect)(withoutDecision.length).toBe(1);
        (0, vitest_1.expect)(withDecision[0].decisions[0].decision).toBe('GO');
        (0, vitest_1.expect)(withDecision[0].decisions[0].decided_by).toBeDefined();
    });
    (0, vitest_1.it)('VIEW_SELFIE audit records carry a reason of ≥10 characters', async () => {
        const views = await prisma.auditLog.findMany({
            where: { tenant_id: tenantId, action: 'VIEW_SELFIE' },
        });
        (0, vitest_1.expect)(views.length).toBeGreaterThanOrEqual(3);
        for (const v of views) {
            const reason = v.after_json?.reason ?? '';
            (0, vitest_1.expect)(reason.length, `reason: "${reason}"`).toBeGreaterThanOrEqual(10);
        }
    });
    (0, vitest_1.it)('seeded 5 mixed notifications per user and left push_subscriptions empty', async () => {
        const users = await prisma.user.count({ where: { tenant_id: tenantId } });
        (0, vitest_1.expect)(first.notification).toBe(users * 5);
        const kinds = await prisma.notification.groupBy({ by: ['kind'], where: { tenant_id: tenantId } });
        (0, vitest_1.expect)(kinds.length).toBeGreaterThanOrEqual(4);
        (0, vitest_1.expect)(await prisma.pushSubscription.count({ where: { tenant_id: tenantId } })).toBe(0);
    });
    (0, vitest_1.it)('is idempotent: a second full run yields identical counts', async () => {
        runSeedFull();
        const second = await counts();
        (0, vitest_1.expect)(second).toEqual(first);
    }, 180000);
});
//# sourceMappingURL=governance-audit.spec.js.map