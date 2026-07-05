"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const path = require("path");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Seed full profile: attendance / leave / holidays', () => {
    const prisma = new client_1.PrismaClient();
    const ONCE_EMAILS = ['eng2.fe@indotek.com', 'sales3@indotek.com'];
    const seedEntry = path.join(__dirname, 'index.ts');
    const apiRoot = path.join(__dirname, '..', '..');
    function runSeedFull() {
        (0, child_process_1.execFileSync)('npx', ['ts-node', seedEntry], {
            cwd: apiRoot,
            env: { ...process.env, SEED_PROFILE: 'full' },
            stdio: 'pipe',
        });
    }
    async function featureCounts() {
        return {
            checkin: await prisma.checkin.count(),
            leaveRequest: await prisma.leaveRequest.count(),
            wfhQuota: await prisma.wfhQuota.count(),
            holiday: await prisma.holiday.count(),
        };
    }
    let firstCounts;
    (0, vitest_1.beforeAll)(async () => {
        await prisma.$connect();
        runSeedFull();
        firstCounts = await featureCounts();
    }, 240000);
    (0, vitest_1.afterAll)(async () => {
        await prisma.$disconnect();
    });
    (0, vitest_1.it)('produces a plausible attendance dataset', () => {
        (0, vitest_1.expect)(firstCounts.checkin).toBeGreaterThan(0);
        (0, vitest_1.expect)(firstCounts.leaveRequest).toBeGreaterThan(0);
        (0, vitest_1.expect)(firstCounts.wfhQuota).toBe(24);
    });
    (0, vitest_1.it)('LATE flag share of IN records is within 6–12%', async () => {
        const totalIn = await prisma.checkin.count({ where: { type: 'IN' } });
        const lateIn = await prisma.checkin.count({ where: { type: 'IN', is_late: true } });
        const share = lateIn / totalIn;
        (0, vitest_1.expect)(totalIn).toBeGreaterThan(0);
        (0, vitest_1.expect)(share, `LATE share ${(share * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.06);
        (0, vitest_1.expect)(share, `LATE share ${(share * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.12);
    });
    (0, vitest_1.it)('ONCE users have no OUT record and no AUTO_CHECKOUT flag', async () => {
        const onceUsers = await prisma.user.findMany({
            where: { email: { in: ONCE_EMAILS } },
            select: { id: true, checkin_mode: true },
        });
        (0, vitest_1.expect)(onceUsers.length).toBe(2);
        for (const u of onceUsers) {
            (0, vitest_1.expect)(u.checkin_mode).toBe('ONCE');
        }
        const ids = onceUsers.map((u) => u.id);
        const outCount = await prisma.checkin.count({ where: { user_id: { in: ids }, type: 'OUT' } });
        const autoCount = await prisma.checkin.count({ where: { user_id: { in: ids }, is_auto: true } });
        (0, vitest_1.expect)(outCount).toBe(0);
        (0, vitest_1.expect)(autoCount).toBe(0);
    });
    (0, vitest_1.it)('has no attendance record on any holiday date', async () => {
        const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: 'indotek' } });
        const holidays = await prisma.holiday.findMany({
            where: { tenant_id: tenant.id },
            select: { date: true },
        });
        const holidaySet = new Set(holidays.map((h) => new Date(h.date).toISOString().slice(0, 10)));
        const checkins = await prisma.checkin.findMany({ select: { date: true } });
        const onHoliday = checkins.filter((c) => holidaySet.has(new Date(c.date).toISOString().slice(0, 10)));
        (0, vitest_1.expect)(onHoliday.length, 'checkins landing on a holiday').toBe(0);
    });
    (0, vitest_1.it)('wfh_quota.used_days equals approved WFH days per user that month', async () => {
        const quotas = await prisma.wfhQuota.findMany();
        (0, vitest_1.expect)(quotas.length).toBeGreaterThan(0);
        for (const q of quotas) {
            const monthStart = new Date(q.week_start);
            const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
            const approvedWfh = await prisma.leaveRequest.count({
                where: {
                    user_id: q.user_id,
                    type: 'WFH_EXTRA',
                    status: 'APPROVED',
                    date_from: { gte: monthStart, lt: monthEnd },
                },
            });
            (0, vitest_1.expect)(q.used_days, `user ${q.user_id} used_days`).toBe(approvedWfh);
        }
    });
    (0, vitest_1.it)('exactly 3 PENDING and 1 REJECTED leave requests (demo queue)', async () => {
        const pending = await prisma.leaveRequest.count({ where: { status: 'PENDING' } });
        const rejected = await prisma.leaveRequest.count({ where: { status: 'REJECTED' } });
        (0, vitest_1.expect)(pending).toBe(3);
        (0, vitest_1.expect)(rejected).toBe(1);
    });
    (0, vitest_1.it)('is idempotent: a second full run yields identical feature counts', async () => {
        runSeedFull();
        const secondCounts = await featureCounts();
        (0, vitest_1.expect)(secondCounts).toEqual(firstCounts);
    }, 180000);
});
//# sourceMappingURL=attendance.spec.js.map