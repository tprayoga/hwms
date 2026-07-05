import { PrismaClient, PolicyScopeType } from '@prisma/client';
import type { SeedContext } from '../lib/context';
import { createLogger, findOrCreate } from '../lib/upsert';
import { DEFAULT_TENANT_POLICY } from '../../../src/attendance/policy.constants';

/**
 * Attendance policies module (profile: full). F2 API/UI is not built yet, but the
 * table should not be empty at schema audit and devs should have data ready.
 *
 *  - TENANT default policy: materialized from the production DEFAULT_TENANT_POLICY
 *    constant (single source of truth — no loose numbers here). scope_id = tenant
 *    id, matching the app's resolver (attendance.service getEffectivePolicy).
 *  - DEPARTMENT override for a 24/7 NOC team: window 06:00–22:00, no mandatory
 *    WFO — demonstrates per-scope resolution (ROLE > DEPARTMENT > TENANT).
 *
 * Policy.scope_id is polymorphic (no Department FK since migration
 * 20260705120000). Idempotent via find-or-create on (tenant_id, scope_type,
 * scope_id).
 */

const NOC_DEPT_NAME = 'NOC';

export async function seedPolicies(prisma: PrismaClient, ctx: SeedContext): Promise<void> {
  const log = createLogger('30-policies');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
  if (!tenant) {
    log.step('tenant indotek not found — run core first; skipping.');
    log.finish();
    return;
  }
  const tenantId = tenant.id;

  // TENANT default — mirror the production constant exactly.
  await findOrCreate(
    prisma.policy,
    { tenant_id: tenantId, scope_type: PolicyScopeType.TENANT, scope_id: tenantId },
    {
      tenant_id: tenantId,
      scope_type: PolicyScopeType.TENANT,
      scope_id: tenantId,
      checkin_window_start: DEFAULT_TENANT_POLICY.checkin_window_start,
      checkin_window_end: DEFAULT_TENANT_POLICY.checkin_window_end,
      auto_checkout_at: DEFAULT_TENANT_POLICY.auto_checkout_at,
      default_checkin_mode: DEFAULT_TENANT_POLICY.default_checkin_mode,
      wfh_days_per_week: DEFAULT_TENANT_POLICY.wfh_days_per_week,
      mandatory_wfo_weekdays: [...DEFAULT_TENANT_POLICY.mandatory_wfo_weekdays],
    },
  );
  log.count('tenant_policy');

  // DEPARTMENT override — 24/7 NOC team.
  const noc = await findOrCreate(
    prisma.department,
    { tenant_id: tenantId, name: NOC_DEPT_NAME },
    { tenant_id: tenantId, name: NOC_DEPT_NAME },
  );
  await findOrCreate(
    prisma.policy,
    { tenant_id: tenantId, scope_type: PolicyScopeType.DEPARTMENT, scope_id: noc.id },
    {
      tenant_id: tenantId,
      scope_type: PolicyScopeType.DEPARTMENT,
      scope_id: noc.id,
      checkin_window_start: '06:00',
      checkin_window_end: '22:00',
      auto_checkout_at: '22:00',
      default_checkin_mode: DEFAULT_TENANT_POLICY.default_checkin_mode,
      wfh_days_per_week: 5,
      mandatory_wfo_weekdays: [], // no mandatory WFO for NOC
    },
  );
  log.count('department_policy');

  log.finish();
}
