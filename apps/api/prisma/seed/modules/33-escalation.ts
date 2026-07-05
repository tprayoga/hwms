import { PrismaClient } from '@prisma/client';
import type { SeedContext } from '../lib/context';
import { createLogger } from '../lib/upsert';
import { hariKerja, jamLokal } from '../lib/dates';

/**
 * Escalation-candidate module (profile: full). The approval-escalation job (>24h
 * → remind approver, >48h → approver's manager) isn't built yet, but we make one
 * ready-to-escalate case: take one of the 3 PENDING leave requests (from
 * 12-leave) and backdate its created_at to well beyond 48 WORKING hours before
 * the anchor (7 working days). Deterministic pick (stable ordering) and
 * idempotent (fixed backdated value; no row count change).
 */

export async function seedEscalation(prisma: PrismaClient, ctx: SeedContext): Promise<void> {
  const log = createLogger('33-escalation');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
  if (!tenant) {
    log.step('tenant indotek not found — run core first; skipping.');
    log.finish();
    return;
  }
  const tenantId = tenant.id;

  // Deterministic pick among the PENDING leaves.
  const pending = await prisma.leaveRequest.findMany({
    where: { tenant_id: tenantId, status: 'PENDING' },
    orderBy: [{ user_id: 'asc' }, { date_from: 'asc' }, { type: 'asc' }],
  });
  if (pending.length === 0) {
    log.step('no PENDING leaves found — run 12-leave first; skipping.');
    log.finish();
    return;
  }

  const target = pending[0];
  // 7 working days back at 09:00 WIB — comfortably > 48 working hours.
  const backdated = jamLokal('Asia/Jakarta', 9, 0, hariKerja(-7));
  await prisma.leaveRequest.update({
    where: { id: target.id },
    data: { created_at: backdated, escalated_at: null },
  });

  log.step(
    `backdated PENDING leave ${target.id} (user ${target.user_id}) created_at -> ${backdated.toISOString()} ` +
      `(${pending.length} pending total)`,
  );
  log.count('escalation_candidates', 1);
  log.finish();
}
