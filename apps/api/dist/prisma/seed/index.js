"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const rng_1 = require("./lib/rng");
const dates_1 = require("./lib/dates");
const _00_core_1 = require("./modules/00-core");
const _10_holidays_1 = require("./modules/10-holidays");
const _11_attendance_1 = require("./modules/11-attendance");
const _12_leave_1 = require("./modules/12-leave");
const _20_demo_project_1 = require("./modules/20-demo-project");
const _30_policies_1 = require("./modules/30-policies");
const _31_scorecards_1 = require("./modules/31-scorecards");
const _32_review_notes_1 = require("./modules/32-review-notes");
const _33_escalation_1 = require("./modules/33-escalation");
const _40_governance_1 = require("./modules/40-governance");
const _41_audit_notifications_1 = require("./modules/41-audit-notifications");
const prisma = new client_1.PrismaClient();
const MODULES = [
    { name: 'core', profiles: ['core', 'full'], run: _00_core_1.seedCore },
    { name: 'holidays', profiles: ['full'], run: _10_holidays_1.seedHolidays },
    { name: 'attendance', profiles: ['full'], run: _11_attendance_1.seedAttendance },
    { name: 'leave', profiles: ['full'], run: _12_leave_1.seedLeave },
    { name: 'demo', profiles: ['full'], run: _20_demo_project_1.seedDemoProject },
    { name: 'policies', profiles: ['full'], run: _30_policies_1.seedPolicies },
    { name: 'scorecards', profiles: ['full'], run: _31_scorecards_1.seedScorecards },
    { name: 'review-notes', profiles: ['full'], run: _32_review_notes_1.seedReviewNotes },
    { name: 'escalation', profiles: ['full'], run: _33_escalation_1.seedEscalation },
    { name: 'governance', profiles: ['full'], run: _40_governance_1.seedGovernance },
    { name: 'audit', profiles: ['full'], run: _41_audit_notifications_1.seedAuditNotifications },
];
function parseModuleList() {
    const fromEnv = process.env.SEED_MODULES ?? '';
    const fromArgv = process.argv.slice(2).join(',');
    const raw = [fromEnv, fromArgv].filter((s) => s.trim() !== '').join(',');
    return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s !== '' && s !== '--');
}
function resolveProfile() {
    const raw = (process.env.SEED_PROFILE ?? 'core').trim().toLowerCase();
    if (raw !== 'core' && raw !== 'full') {
        throw new Error(`Invalid SEED_PROFILE: ${raw} (expected 'core' or 'full')`);
    }
    return raw;
}
function selectModules() {
    const explicit = parseModuleList();
    if (explicit.length > 0) {
        const unknown = explicit.filter((n) => !MODULES.some((m) => m.name === n));
        if (unknown.length > 0) {
            throw new Error(`Unknown seed module(s): ${unknown.join(', ')}. ` +
                `Available: ${MODULES.map((m) => m.name).join(', ')}`);
        }
        const modules = MODULES.filter((m) => explicit.includes(m.name));
        return { modules, mode: `modules=[${explicit.join(',')}]` };
    }
    const profile = resolveProfile();
    const modules = MODULES.filter((m) => m.profiles.includes(profile));
    return { modules, mode: `profile=${profile}` };
}
async function preCleanFeatureTables() {
    await prisma.keyResult.deleteMany({});
    await prisma.oKR.deleteMany({});
    await prisma.kpiActual.deleteMany({});
    await prisma.kPI.deleteMany({});
    await prisma.gateDecision.deleteMany({});
    await prisma.gate.deleteMany({});
    await prisma.risk.deleteMany({});
    await prisma.scorecard.deleteMany({});
    await prisma.reviewNote.deleteMany({});
    await prisma.policy.deleteMany({});
    await prisma.wfhQuota.deleteMany({});
}
async function main() {
    const { modules, mode } = selectModules();
    const seed = (0, rng_1.resolveSeed)();
    const ctx = {
        rng: (0, rng_1.createRng)(seed),
        anchor: dates_1.ANCHOR_DATE,
        refs: {},
    };
    console.log(`HWMS seed — ${mode} | anchor=${dates_1.ANCHOR_DATE.toISOString().slice(0, 10)} | ` +
        `seed=0x${(seed >>> 0).toString(16)} | modules: ${modules.map((m) => m.name).join(', ') || '(none)'}`);
    if (modules.length === 0) {
        console.warn('No modules matched the selection — nothing to seed.');
        return;
    }
    if (modules.some((m) => m.name === 'core')) {
        await preCleanFeatureTables();
    }
    for (const mod of modules) {
        console.log(`\n=== module: ${mod.name} ===`);
        await mod.run(prisma, ctx);
    }
    console.log('\nSeed complete.');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=index.js.map