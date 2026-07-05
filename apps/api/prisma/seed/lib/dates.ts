/**
 * Deterministic date helpers for seeding (GAP rule §2).
 *
 * All relative dates are computed from a single ANCHOR_DATE, resolved ONCE at
 * module load. Default anchor is the last Monday strictly before "today", so the
 * data feels fresh across days while staying deterministic within a single run.
 * Override with env SEED_ANCHOR_DATE (ISO date, e.g. 2026-06-29) to pin CI runs.
 *
 * Indonesia has no DST, so the three business timezones map to fixed offsets.
 */

const TZ_OFFSET_HOURS: Record<string, number> = {
  'Asia/Jakarta': 7, // WIB
  'Asia/Makassar': 8, // WITA
  'Asia/Jayapura': 9, // WIT
};

/** Midnight (UTC) of the last Monday strictly before `ref`. */
function lastMondayBefore(ref: Date): Date {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  let diff = (dow + 6) % 7; // days since this week's Monday (0 if today is Monday)
  if (diff === 0) diff = 7; // strictly before today -> previous Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function resolveAnchor(): Date {
  const raw = process.env.SEED_ANCHOR_DATE;
  if (raw && raw.trim() !== '') {
    const d = new Date(raw.trim());
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid SEED_ANCHOR_DATE: ${raw} (expected ISO date)`);
    }
    // Normalize to UTC midnight so downstream offsets are stable.
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return lastMondayBefore(new Date());
}

/** Resolved once at module load — the single source of truth for relative dates. */
export const ANCHOR_DATE: Date = resolveAnchor();

/**
 * Date `offset` working days from `from` (weekends skipped, holidays ignored).
 * offset 0 = the anchor itself; positive = forward, negative = backward.
 */
export function hariKerja(offset: number, from: Date = ANCHOR_DATE): Date {
  const d = new Date(from.getTime());
  const step = offset >= 0 ? 1 : -1;
  let remaining = Math.abs(offset);
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

/**
 * The UTC instant for local wall-clock time h:m in timezone `tz` on `date`
 * (defaults to the anchor). Uses fixed Indonesia offsets (no DST).
 */
export function jamLokal(tz: string, h: number, m: number, date: Date = ANCHOR_DATE): Date {
  const offset = TZ_OFFSET_HOURS[tz];
  if (offset === undefined) {
    throw new Error(`Unknown timezone for jamLokal: ${tz}`);
  }
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h - offset, m, 0, 0),
  );
}
