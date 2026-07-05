"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const path = require("path");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Seed core profile is idempotent by table count', () => {
    const prisma = new client_1.PrismaClient();
    const MODELS = [
        'tenant', 'department', 'functionalRole', 'user', 'holiday', 'project',
        'sprint', 'location', 'task', 'taskAssignment', 'standupItem', 'blocker',
        'taskDependency', 'taskEvidence', 'teamMember', 'team', 'leaveRequest',
        'checkin', 'notification', 'pushSubscription', 'auditLog',
    ];
    const seedEntry = path.join(__dirname, 'index.ts');
    async function snapshot() {
        const counts = {};
        for (const model of MODELS) {
            counts[model] = await prisma[model].count();
        }
        return counts;
    }
    function runSeedCore() {
        (0, child_process_1.execFileSync)('npx', ['ts-node', seedEntry], {
            cwd: path.join(__dirname, '..', '..'),
            env: { ...process.env, SEED_PROFILE: 'core' },
            stdio: 'pipe',
        });
    }
    let first;
    let second;
    (0, vitest_1.beforeAll)(async () => {
        await prisma.$connect();
        runSeedCore();
        first = await snapshot();
        runSeedCore();
        second = await snapshot();
    }, 180000);
    (0, vitest_1.afterAll)(async () => {
        await prisma.$disconnect();
    });
    (0, vitest_1.it)('produces a non-empty, well-known first snapshot', () => {
        (0, vitest_1.expect)(first.task).toBe(456);
        (0, vitest_1.expect)(first.user).toBe(24);
        (0, vitest_1.expect)(first.sprint).toBe(12);
        (0, vitest_1.expect)(first.tenant).toBe(1);
    });
    (0, vitest_1.it)('produces identical table counts on the second run', () => {
        (0, vitest_1.expect)(second).toEqual(first);
    });
});
//# sourceMappingURL=idempotency.spec.js.map