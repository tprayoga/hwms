"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedScorecards = seedScorecards;
const client_1 = require("@prisma/client");
const upsert_1 = require("../lib/upsert");
const task_aggregation_service_1 = require("../../../src/task/task-aggregation.service");
const WEEKS = 4;
const LATE_PENALTY = 20;
function weekStartsAsc(anchor) {
    const out = [];
    for (let i = WEEKS; i >= 1; i--) {
        out.push(new Date(anchor.getTime() - i * 7 * 24 * 3600 * 1000));
    }
    return out;
}
async function seedScorecards(prisma, ctx) {
    const log = (0, upsert_1.createLogger)('31-scorecards');
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
    if (!tenant) {
        log.step('tenant indotek not found — run core first; skipping.');
        log.finish();
        return;
    }
    const tenantId = tenant.id;
    const aggregation = new task_aggregation_service_1.TaskAggregationService({}, {});
    const weeks = weekStartsAsc(ctx.anchor);
    const windowStart = weeks[0];
    const windowEnd = new Date(weeks[weeks.length - 1].getTime() + 7 * 24 * 3600 * 1000);
    const users = await prisma.user.findMany({
        where: { tenant_id: tenantId, employment_status: 'AKTIF' },
        orderBy: { nik: 'asc' },
        select: { id: true },
    });
    const ins = await prisma.checkin.findMany({
        where: { tenant_id: tenantId, type: 'IN', is_late: true, date: { gte: windowStart, lt: windowEnd } },
        select: { user_id: true, date: true },
    });
    const lateByUserWeek = new Map();
    for (const c of ins) {
        const idx = Math.floor((new Date(c.date).getTime() - windowStart.getTime()) / (7 * 24 * 3600 * 1000));
        if (idx < 0 || idx >= WEEKS)
            continue;
        if (!lateByUserWeek.has(c.user_id))
            lateByUserWeek.set(c.user_id, new Array(WEEKS).fill(0));
        lateByUserWeek.get(c.user_id)[idx]++;
    }
    let rows = 0;
    for (const u of users) {
        const assignments = await prisma.taskAssignment.findMany({
            where: { tenant_id: tenantId, user_id: u.id, unassigned_at: null },
            include: { task: { include: { blockers: true } } },
        });
        const tasks = assignments.map((a) => a.task);
        const tasksTotal = tasks.length;
        const tasksDone = tasks.filter((t) => t.status === 'DONE').length;
        const agg = await aggregation.calculateProgress(tasks);
        const blockersReported = await prisma.blocker.count({ where: { tenant_id: tenantId, reported_by: u.id } });
        const blockersResolved = await prisma.blocker.count({ where: { tenant_id: tenantId, resolved_by: u.id } });
        const lateWeeks = lateByUserWeek.get(u.id) ?? new Array(WEEKS).fill(0);
        for (let w = 0; w < WEEKS; w++) {
            const discipline = Math.max(0, Math.min(100, 100 - LATE_PENALTY * lateWeeks[w]));
            await (0, upsert_1.findOrCreate)(prisma.scorecard, { tenant_id: tenantId, user_id: u.id, period_type: client_1.ScorecardPeriodType.SPRINT, period_start: weeks[w] }, {
                tenant_id: tenantId,
                user_id: u.id,
                period_type: client_1.ScorecardPeriodType.SPRINT,
                period_start: weeks[w],
                weighted_completion: agg.progressPct,
                tasks_done: tasksDone,
                tasks_total: tasksTotal,
                blockers_reported: blockersReported,
                blockers_resolved: blockersResolved,
                checkin_discipline: discipline,
                rag: agg.rag,
            });
            rows++;
        }
    }
    log.step(`users=${users.length} weeks=${WEEKS} scorecards=${rows}`);
    log.count('scorecards', rows);
    log.finish();
}
//# sourceMappingURL=31-scorecards.js.map