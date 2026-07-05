import { PrismaClient, LeaveType, LeaveStatus } from '@prisma/client';
import type { SeedContext } from '../lib/context';
import { createLogger, findOrCreate, upsertBy } from '../lib/upsert';

/**
 * Leave + WFH-quota module (profile: full). Consumes the WFH / leave days that
 * 11-attendance recorded (via ctx.refs.attendance) and materializes:
 *   - leave_requests: one per WFH/leave day, approver = the user's manager from
 *     the hierarchy. Status is mostly APPROVED, with exactly 3 PENDING (demo
 *     approval queue) and 1 REJECTED (with a reason).
 *   - wfh_quotas: one row per user for the anchor month (conceptual quota 8),
 *     used_days = number of that user's APPROVED WFH days that month.
 *
 * Leave balance deduction is business logic (fires on approval) — not seeded
 * here. LeaveRequest has no natural unique, so we findOrCreate on
 * (tenant_id, user_id, type, date_from) to stay idempotent even for partial runs.
 */

const REASONS: Record<string, string> = {
  WFH_EXTRA: 'Bekerja dari rumah (terjadwal)',
  CUTI: 'Cuti tahunan',
  IZIN: 'Izin keperluan pribadi',
  SAKIT: 'Sakit',
};

const NUM_PENDING = 3;
const NUM_REJECTED = 1;

interface LeaveEntry {
  userId: string;
  date: Date;
  type: LeaveType;
  managerId: string | null;
}

export async function seedLeave(prisma: PrismaClient, ctx: SeedContext): Promise<void> {
  const log = createLogger('12-leave');
  const rng = ctx.rng;

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
  if (!tenant) {
    log.step('tenant indotek not found — run core first; skipping.');
    log.finish();
    return;
  }

  const plan = ctx.refs.attendance as
    | { wfh: any[]; leave: any[] }
    | undefined;
  if (!plan) {
    log.step('no attendance plan in ctx.refs — run 11-attendance first; skipping.');
    log.finish();
    return;
  }

  // Unified, deterministically-ordered entry list (WFH first, then other leave).
  const entries: LeaveEntry[] = [
    ...plan.wfh.map((w) => ({ userId: w.userId, date: w.date, type: LeaveType.WFH_EXTRA, managerId: w.managerId })),
    ...plan.leave.map((l) => ({ userId: l.userId, date: l.date, type: l.type as LeaveType, managerId: l.managerId })),
  ];

  // Pick distinct indices for the 3 PENDING + 1 REJECTED; the rest are APPROVED.
  const statusByIndex = new Map<number, LeaveStatus>();
  const chosen = new Set<number>();
  const pickDistinct = (status: LeaveStatus, n: number) => {
    let guard = 0;
    while ([...statusByIndex.values()].filter((s) => s === status).length < n && chosen.size < entries.length && guard < 10000) {
      guard++;
      const idx = rng.int(0, entries.length - 1);
      if (chosen.has(idx)) continue;
      chosen.add(idx);
      statusByIndex.set(idx, status);
    }
  };
  if (entries.length > 0) {
    pickDistinct(LeaveStatus.PENDING, NUM_PENDING);
    pickDistinct(LeaveStatus.REJECTED, NUM_REJECTED);
  }

  const counts = { approved: 0, pending: 0, rejected: 0 };
  // approvedWfhByUser[userId] = count of APPROVED WFH_EXTRA days.
  const approvedWfhByUser: Record<string, number> = {};

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const status = statusByIndex.get(i) ?? LeaveStatus.APPROVED;
    const decided = status === LeaveStatus.PENDING
      ? null
      : new Date(e.date.getTime() - 12 * 3600 * 1000); // ~noon the day before (UTC)

    await findOrCreate(
      prisma.leaveRequest,
      { tenant_id: tenant.id, user_id: e.userId, type: e.type, date_from: e.date },
      {
        tenant_id: tenant.id,
        user_id: e.userId,
        approver_id: e.managerId,
        type: e.type,
        date_from: e.date,
        date_to: e.date,
        reason: REASONS[e.type] ?? 'Pengajuan',
        status,
        decided_at: decided,
        decision_note: status === LeaveStatus.REJECTED ? 'Ditolak: kebutuhan tim pada tanggal tersebut.' : null,
      },
    );

    if (status === LeaveStatus.APPROVED) counts.approved++;
    else if (status === LeaveStatus.PENDING) counts.pending++;
    else if (status === LeaveStatus.REJECTED) counts.rejected++;

    if (e.type === LeaveType.WFH_EXTRA && status === LeaveStatus.APPROVED) {
      approvedWfhByUser[e.userId] = (approvedWfhByUser[e.userId] ?? 0) + 1;
    }
  }

  // WFH quota per user for the anchor month (used_days = approved WFH days).
  const monthStart = new Date(Date.UTC(ctx.anchor.getUTCFullYear(), ctx.anchor.getUTCMonth(), 1));
  const users = await prisma.user.findMany({
    where: { tenant_id: tenant.id, employment_status: 'AKTIF' },
    select: { id: true },
  });
  for (const u of users) {
    const used = approvedWfhByUser[u.id] ?? 0;
    await upsertBy(
      prisma.wfhQuota,
      { user_id_week_start: { user_id: u.id, week_start: monthStart } },
      { tenant_id: tenant.id, user_id: u.id, week_start: monthStart, used_days: used },
      { used_days: used },
    );
  }

  log.step(`leave: approved=${counts.approved} pending=${counts.pending} rejected=${counts.rejected} | wfh_quota rows=${users.length}`);
  log.count('leave_requests', entries.length);
  log.count('wfh_quotas', users.length);
  log.finish();
}
