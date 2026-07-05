"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedLeave = seedLeave;
const client_1 = require("@prisma/client");
const upsert_1 = require("../lib/upsert");
const REASONS = {
    WFH_EXTRA: 'Bekerja dari rumah (terjadwal)',
    CUTI: 'Cuti tahunan',
    IZIN: 'Izin keperluan pribadi',
    SAKIT: 'Sakit',
};
const NUM_PENDING = 3;
const NUM_REJECTED = 1;
async function seedLeave(prisma, ctx) {
    const log = (0, upsert_1.createLogger)('12-leave');
    const rng = ctx.rng;
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
    if (!tenant) {
        log.step('tenant indotek not found — run core first; skipping.');
        log.finish();
        return;
    }
    const plan = ctx.refs.attendance;
    if (!plan) {
        log.step('no attendance plan in ctx.refs — run 11-attendance first; skipping.');
        log.finish();
        return;
    }
    const entries = [
        ...plan.wfh.map((w) => ({ userId: w.userId, date: w.date, type: client_1.LeaveType.WFH_EXTRA, managerId: w.managerId })),
        ...plan.leave.map((l) => ({ userId: l.userId, date: l.date, type: l.type, managerId: l.managerId })),
    ];
    const statusByIndex = new Map();
    const chosen = new Set();
    const pickDistinct = (status, n) => {
        let guard = 0;
        while ([...statusByIndex.values()].filter((s) => s === status).length < n && chosen.size < entries.length && guard < 10000) {
            guard++;
            const idx = rng.int(0, entries.length - 1);
            if (chosen.has(idx))
                continue;
            chosen.add(idx);
            statusByIndex.set(idx, status);
        }
    };
    if (entries.length > 0) {
        pickDistinct(client_1.LeaveStatus.PENDING, NUM_PENDING);
        pickDistinct(client_1.LeaveStatus.REJECTED, NUM_REJECTED);
    }
    const counts = { approved: 0, pending: 0, rejected: 0 };
    const approvedWfhByUser = {};
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const status = statusByIndex.get(i) ?? client_1.LeaveStatus.APPROVED;
        const decided = status === client_1.LeaveStatus.PENDING
            ? null
            : new Date(e.date.getTime() - 12 * 3600 * 1000);
        await (0, upsert_1.findOrCreate)(prisma.leaveRequest, { tenant_id: tenant.id, user_id: e.userId, type: e.type, date_from: e.date }, {
            tenant_id: tenant.id,
            user_id: e.userId,
            approver_id: e.managerId,
            type: e.type,
            date_from: e.date,
            date_to: e.date,
            reason: REASONS[e.type] ?? 'Pengajuan',
            status,
            decided_at: decided,
            decision_note: status === client_1.LeaveStatus.REJECTED ? 'Ditolak: kebutuhan tim pada tanggal tersebut.' : null,
        });
        if (status === client_1.LeaveStatus.APPROVED)
            counts.approved++;
        else if (status === client_1.LeaveStatus.PENDING)
            counts.pending++;
        else if (status === client_1.LeaveStatus.REJECTED)
            counts.rejected++;
        if (e.type === client_1.LeaveType.WFH_EXTRA && status === client_1.LeaveStatus.APPROVED) {
            approvedWfhByUser[e.userId] = (approvedWfhByUser[e.userId] ?? 0) + 1;
        }
    }
    const monthStart = new Date(Date.UTC(ctx.anchor.getUTCFullYear(), ctx.anchor.getUTCMonth(), 1));
    const users = await prisma.user.findMany({
        where: { tenant_id: tenant.id, employment_status: 'AKTIF' },
        select: { id: true },
    });
    for (const u of users) {
        const used = approvedWfhByUser[u.id] ?? 0;
        await (0, upsert_1.upsertBy)(prisma.wfhQuota, { user_id_week_start: { user_id: u.id, week_start: monthStart } }, { tenant_id: tenant.id, user_id: u.id, week_start: monthStart, used_days: used }, { used_days: used });
    }
    log.step(`leave: approved=${counts.approved} pending=${counts.pending} rejected=${counts.rejected} | wfh_quota rows=${users.length}`);
    log.count('leave_requests', entries.length);
    log.count('wfh_quotas', users.length);
    log.finish();
}
//# sourceMappingURL=12-leave.js.map