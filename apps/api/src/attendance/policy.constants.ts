import { CheckinMode } from '@prisma/client';

/**
 * Single source of truth for the tenant-wide default attendance policy.
 *
 * The attendance service falls back to these values when no Policy row resolves,
 * and the seed (30-policies) materializes a TENANT-scoped Policy row from the
 * exact same object — so DB and code never drift. Do not duplicate these numbers
 * elsewhere; import this constant.
 *
 * `mandatory_wfo_weekdays` uses JS getDay() numbering (0=Sun … 6=Sat), so
 * [2, 4] = Selasa & Kamis.
 */
export const DEFAULT_TENANT_POLICY = {
  checkin_window_start: '08:00',
  checkin_window_end: '10:00',
  auto_checkout_at: '18:00',
  default_checkin_mode: CheckinMode.TWICE,
  wfh_days_per_week: 2,
  mandatory_wfo_weekdays: [2, 4],
} as const;
