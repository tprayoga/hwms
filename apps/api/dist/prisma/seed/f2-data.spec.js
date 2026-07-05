"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const path = require("path");
const vitest_1 = require("vitest");
const policy_constants_1 = require("../../src/attendance/policy.constants");
(0, vitest_1.describe)('Seed full profile: F2 data modules', () => {
    const prisma = new client_1.PrismaClient();
    const seedEntry = path.join(__dirname, 'index.ts');
    const apiRoot = path.join(__dirname, '..', '..');
    let tenantId;
    function runSeedFull() {
        (0, child_process_1.execFileSync)('npx', ['ts-node', seedEntry], {
            cwd: apiRoot,
            env: { ...process.env, SEED_PROFILE: 'full' },
            stdio: 'pipe',
        });
    }
    async function f2Counts() {
        return {
            policy: await prisma.policy.count(),
            scorecard: await prisma.scorecard.count(),
            reviewNote: await prisma.reviewNote.count(),
        };
    }
    let firstCounts;
    (0, vitest_1.beforeAll)(async () => {
        await prisma.$connect();
        runSeedFull();
        tenantId = (await prisma.tenant.findFirstOrThrow({ where: { slug: 'indotek' } })).id;
        firstCounts = await f2Counts();
    }, 240000);
    (0, vitest_1.afterAll)(async () => {
        await prisma.$disconnect();
    });
    (0, vitest_1.it)('tenant default Policy exactly mirrors the production constant', async () => {
        const p = await prisma.policy.findFirstOrThrow({
            where: { tenant_id: tenantId, scope_type: 'TENANT', scope_id: tenantId },
        });
        (0, vitest_1.expect)(p.checkin_window_start).toBe(policy_constants_1.DEFAULT_TENANT_POLICY.checkin_window_start);
        (0, vitest_1.expect)(p.checkin_window_end).toBe(policy_constants_1.DEFAULT_TENANT_POLICY.checkin_window_end);
        (0, vitest_1.expect)(p.auto_checkout_at).toBe(policy_constants_1.DEFAULT_TENANT_POLICY.auto_checkout_at);
        (0, vitest_1.expect)(p.default_checkin_mode).toBe(policy_constants_1.DEFAULT_TENANT_POLICY.default_checkin_mode);
        (0, vitest_1.expect)(p.wfh_days_per_week).toBe(policy_constants_1.DEFAULT_TENANT_POLICY.wfh_days_per_week);
        (0, vitest_1.expect)(p.mandatory_wfo_weekdays).toEqual([...policy_constants_1.DEFAULT_TENANT_POLICY.mandatory_wfo_weekdays]);
    });
    (0, vitest_1.it)('seeded a per-department (NOC) override policy', async () => {
        const noc = await prisma.department.findFirstOrThrow({ where: { tenant_id: tenantId, name: 'NOC' } });
        const p = await prisma.policy.findFirstOrThrow({
            where: { tenant_id: tenantId, scope_type: 'DEPARTMENT', scope_id: noc.id },
        });
        (0, vitest_1.expect)(p.checkin_window_start).toBe('06:00');
        (0, vitest_1.expect)(p.checkin_window_end).toBe('22:00');
        (0, vitest_1.expect)(p.mandatory_wfo_weekdays).toEqual([]);
    });
    (0, vitest_1.it)('scorecard: most-LATE user scores below a no-LATE user (discipline sanity)', async () => {
        const users = await prisma.user.findMany({
            where: { tenant_id: tenantId, employment_status: 'AKTIF' },
            select: { id: true },
        });
        const lateGroups = await prisma.checkin.groupBy({
            by: ['user_id'],
            where: { tenant_id: tenantId, type: 'IN', is_late: true },
            _count: { _all: true },
        });
        const lateByUser = new Map();
        for (const u of users)
            lateByUser.set(u.id, 0);
        for (const g of lateGroups)
            lateByUser.set(g.user_id, g._count._all);
        const sorted = [...lateByUser.entries()].sort((a, b) => b[1] - a[1]);
        const [maxUser, maxLate] = sorted[0];
        const zeroEntry = sorted.reverse().find(([, n]) => n === 0);
        (0, vitest_1.expect)(maxLate, 'a user should have LATE flags').toBeGreaterThan(0);
        (0, vitest_1.expect)(zeroEntry, 'a user with zero LATE flags should exist').toBeDefined();
        const zeroUser = zeroEntry[0];
        const avgDiscipline = async (userId) => {
            const cards = await prisma.scorecard.findMany({ where: { user_id: userId }, select: { checkin_discipline: true } });
            const vals = cards.map((c) => Number(c.checkin_discipline));
            return vals.reduce((a, b) => a + b, 0) / vals.length;
        };
        const maxAvg = await avgDiscipline(maxUser);
        const zeroAvg = await avgDiscipline(zeroUser);
        (0, vitest_1.expect)(zeroAvg).toBe(100);
        (0, vitest_1.expect)(maxAvg, `most-late ${maxAvg} vs no-late ${zeroAvg}`).toBeLessThan(zeroAvg);
    });
    (0, vitest_1.it)('made one PENDING leave a ready escalation candidate (>48 working hours old)', async () => {
        const anchorish = new Date();
        const twoDaysAgo = new Date(anchorish.getTime() - 2 * 24 * 3600 * 1000);
        const old = await prisma.leaveRequest.count({
            where: { tenant_id: tenantId, status: 'PENDING', created_at: { lt: twoDaysAgo } },
        });
        (0, vitest_1.expect)(old).toBeGreaterThanOrEqual(1);
    });
    (0, vitest_1.it)('is idempotent: a second full run yields identical F2 counts', async () => {
        runSeedFull();
        const second = await f2Counts();
        (0, vitest_1.expect)(second).toEqual(firstCounts);
    }, 180000);
});
//# sourceMappingURL=f2-data.spec.js.map