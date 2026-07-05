"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const path = require("path");
const vitest_1 = require("vitest");
const DELEGATES = [
    'tenant', 'user', 'department', 'functionalRole', 'team', 'teamMember', 'project',
    'sprint', 'task', 'taskAssignment', 'taskDependency', 'taskEvidence', 'checkin',
    'standupItem', 'blocker', 'leaveRequest', 'policy', 'wfhQuota', 'location', 'holiday',
    'setting', 'kPI', 'kpiActual', 'oKR', 'keyResult', 'risk', 'gate', 'gateDecision',
    'scorecard', 'reviewNote', 'notification', 'pushSubscription', 'auditLog',
];
const RELATIONS = [
    ['User', 'tenant_id', 'Tenant'],
    ['Task', 'project_id', 'Project'],
    ['Task', 'sprint_id', 'Sprint'],
    ['TaskAssignment', 'task_id', 'Task'],
    ['TaskAssignment', 'user_id', 'User'],
    ['TaskEvidence', 'task_id', 'Task'],
    ['Checkin', 'user_id', 'User'],
    ['Blocker', 'task_id', 'Task'],
    ['LeaveRequest', 'user_id', 'User'],
    ['WfhQuota', 'user_id', 'User'],
    ['Scorecard', 'user_id', 'User'],
    ['ReviewNote', 'author_id', 'User'],
    ['Policy', 'tenant_id', 'Tenant'],
    ['OKR', 'project_id', 'Project'],
    ['KeyResult', 'okr_id', 'OKR'],
    ['KPI', 'functional_role_id', 'FunctionalRole'],
    ['KpiActual', 'kpi_id', 'KPI'],
    ['Risk', 'project_id', 'Project'],
    ['Gate', 'project_id', 'Project'],
    ['GateDecision', 'gate_id', 'Gate'],
    ['Notification', 'user_id', 'User'],
];
(0, vitest_1.describe)('Umbrella seed gate (full profile)', () => {
    const prisma = new client_1.PrismaClient();
    const seedEntry = path.join(__dirname, 'index.ts');
    const reconSpec = path.join(__dirname, '..', '..', 'src', 'dashboard', 'reconciliation.spec.ts');
    const apiRoot = path.join(__dirname, '..', '..');
    function runSeedFull() {
        (0, child_process_1.execFileSync)('npx', ['ts-node', seedEntry], {
            cwd: apiRoot,
            env: { ...process.env, SEED_PROFILE: 'full' },
            stdio: 'pipe',
        });
    }
    async function emptyDatabase() {
        const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
        const list = rows.map((r) => `"${r.tablename}"`).join(', ');
        if (list)
            await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
    async function snapshotAll() {
        const out = {};
        for (const d of DELEGATES)
            out[d] = await prisma[d].count();
        return out;
    }
    let firstSnapshot;
    (0, vitest_1.beforeAll)(async () => {
        await prisma.$connect();
        await emptyDatabase();
        runSeedFull();
        firstSnapshot = await snapshotAll();
    }, 240000);
    (0, vitest_1.afterAll)(async () => {
        await prisma.$disconnect();
    });
    (0, vitest_1.it)('a. full seed on an empty DB produced the expected dataset', () => {
        (0, vitest_1.expect)(firstSnapshot.tenant).toBe(1);
        (0, vitest_1.expect)(firstSnapshot.user).toBe(24);
        (0, vitest_1.expect)(firstSnapshot.task).toBe(516);
        (0, vitest_1.expect)(firstSnapshot.project).toBeGreaterThanOrEqual(2);
        (0, vitest_1.expect)(firstSnapshot.checkin).toBeGreaterThan(0);
        (0, vitest_1.expect)(firstSnapshot.scorecard).toBe(96);
        (0, vitest_1.expect)(firstSnapshot.oKR).toBe(3);
        (0, vitest_1.expect)(firstSnapshot.notification).toBe(120);
    });
    (0, vitest_1.it)('b. reconciliation.spec.ts is green after the full seed', () => {
        (0, vitest_1.expect)(() => (0, child_process_1.execFileSync)('npx', ['vitest', 'run', reconSpec], { cwd: apiRoot, env: process.env, stdio: 'pipe' })).not.toThrow();
    }, 120000);
    (0, vitest_1.it)('c. a second full run yields identical counts for every table (idempotent)', async () => {
        runSeedFull();
        const second = await snapshotAll();
        (0, vitest_1.expect)(second).toEqual(firstSnapshot);
    }, 180000);
    (0, vitest_1.it)('d. Saft VE POC guard: 456 tasks and unchanged aggregate', async () => {
        const saft = await prisma.project.findFirstOrThrow({ where: { name: 'Saft VE POC' } });
        const agg = await prisma.task.aggregate({
            where: { project_id: saft.id },
            _count: { _all: true },
            _sum: { percent_complete: true },
        });
        (0, vitest_1.expect)(agg._count._all).toBe(456);
        (0, vitest_1.expect)(agg._sum.percent_complete ?? 0).toBe(0);
    });
    (0, vitest_1.it)('e. no attendance record falls on a holiday date', async () => {
        const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: 'indotek' } });
        const holidays = await prisma.holiday.findMany({ where: { tenant_id: tenant.id }, select: { date: true } });
        const holidaySet = new Set(holidays.map((h) => new Date(h.date).toISOString().slice(0, 10)));
        const checkins = await prisma.checkin.findMany({ select: { date: true } });
        const onHoliday = checkins.filter((c) => holidaySet.has(new Date(c.date).toISOString().slice(0, 10)));
        (0, vitest_1.expect)(onHoliday.length).toBe(0);
    });
    (0, vitest_1.it)('f. no orphaned rows across the main relations (FK integrity)', async () => {
        for (const [child, fk, parent] of RELATIONS) {
            const res = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS count FROM "${child}" c
         LEFT JOIN "${parent}" p ON c."${fk}" = p."id"
         WHERE c."${fk}" IS NOT NULL AND p."id" IS NULL`);
            (0, vitest_1.expect)(Number(res[0].count), `orphaned ${child}.${fk} -> ${parent}`).toBe(0);
        }
    });
});
//# sourceMappingURL=seed.spec.js.map