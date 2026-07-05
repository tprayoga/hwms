import { PrismaClient, CheckinType, WorkStatus, CheckinMode, LeaveType } from '@prisma/client';
import type { SeedContext } from '../lib/context';
import { hariKerja, jamLokal } from '../lib/dates';
import { createLogger } from '../lib/upsert';
import { StorageService } from '../../../src/storage/storage.service';

/**
 * Attendance history module (profile: full).
 *
 * Seeds ~20 working days of check-in history ending at ANCHOR_DATE for all 24
 * users, with a realistic distribution driven entirely by the seeded RNG (no
 * Math.random / Date.now). All flags are informative, never blocking (GAP §6):
 *   LATE          -> is_late = true          (check-in after 10:00 local)
 *   OUT_OF_RANGE  -> geofence_ok = false     (WFO check-in outside office radius)
 *   AUTO_CHECKOUT -> is_auto = true on OUT   (forgot to check out, closed 18:00)
 *
 * Timezone-aware: check-in windows are LOCAL wall-clock in the user's TZ, then
 * converted to a UTC server `submitted_at` (the timestamp of record, GAP §6).
 * `device_timestamp` carries a small ±3 min skew for offline forensics only.
 *
 * WFH and leave days are recorded here and handed to 12-leave via ctx.refs so
 * the leave requests / quotas line up. Holidays carry NO attendance record.
 *
 * Selfies: one small placeholder JPEG per user is uploaded to the `selfies`
 * bucket (24 objects total); every record for that user references that key —
 * we never upload one object per record. No record is created older than 90
 * days (the selfie-lifecycle job would otherwise prune it and confuse the demo).
 */

// The two users switched to single check-in mode (ONCE): only IN, never auto-out.
const ONCE_USER_EMAILS = ['eng2.fe@indotek.com', 'sales3@indotek.com'];

// Number of working days (weekdays) of history to walk back from the anchor.
const HISTORY_WORKING_DAYS = 20;

// Standard blank placeholder JPEG (valid SOI..EOI), kept tiny on purpose.
const PLACEHOLDER_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
  'CAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA' +
  'AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK' +
  'FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG' +
  'h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl' +
  '5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA' +
  'AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYk' +
  'NOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOE' +
  'hYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk' +
  '5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

type Category = 'normal' | 'late' | 'out_of_range' | 'forgot_checkout' | 'wfh' | 'leave' | 'alpa';

// Cumulative distribution (draw one uniform in [0,1)):
// normal 70% | late 8% | oor 5% | forgot 4% | wfh 5% | leave 5% | alpa 3%.
function categoryFor(r: number): Category {
  if (r < 0.7) return 'normal';
  if (r < 0.78) return 'late';
  if (r < 0.83) return 'out_of_range';
  if (r < 0.87) return 'forgot_checkout';
  if (r < 0.92) return 'wfh';
  if (r < 0.97) return 'leave';
  return 'alpa';
}

const LEAVE_TYPES: LeaveType[] = [LeaveType.CUTI, LeaveType.IZIN, LeaveType.SAKIT];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function seedAttendance(prisma: PrismaClient, ctx: SeedContext): Promise<void> {
  const log = createLogger('11-attendance');
  const rng = ctx.rng;

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
  if (!tenant) {
    log.step('tenant indotek not found — run core first; skipping.');
    log.finish();
    return;
  }
  const tenantId = tenant.id;

  // Deterministic user order (by nik) so the RNG stream is stable run-to-run.
  const users = await prisma.user.findMany({
    where: { tenant_id: tenant.id, employment_status: 'AKTIF' },
    orderBy: { nik: 'asc' },
    select: { id: true, email: true, nik: true, timezone: true, manager_id: true },
  });

  // Flip the two designated users to ONCE mode.
  const onceIds = new Set<string>();
  for (const email of ONCE_USER_EMAILS) {
    const u = users.find((x) => x.email === email);
    if (u) {
      await prisma.user.update({ where: { id: u.id }, data: { checkin_mode: CheckinMode.ONCE } });
      onceIds.add(u.id);
    }
  }

  // Office location for geofence math.
  const office = await prisma.location.findFirst({
    where: { tenant_id: tenant.id, type: 'OFFICE' },
  });
  const officeLat = office?.lat ? Number(office.lat) : -6.917464;
  const officeLng = office?.lng ? Number(office.lng) : 107.619122;

  // Placeholder selfie per user (24 objects), referenced by every record.
  const storage = new StorageService();
  const selfieBucket = process.env.S3_BUCKET_SELFIES || 'selfies';
  const jpeg = Buffer.from(PLACEHOLDER_JPEG_B64, 'base64');
  const selfieKeyByUser: Record<string, string> = {};
  for (const u of users) {
    const key = `seed/placeholder/${u.nik}.jpg`;
    selfieKeyByUser[u.id] = key;
    try {
      await storage.uploadFile(selfieBucket, key, jpeg, 'image/jpeg');
    } catch (e: any) {
      log.step(`selfie upload skipped for ${u.nik}: ${e?.message ?? e}`);
    }
  }
  log.count('selfie_objects', users.length);

  // Working-day window: the last N weekdays strictly before the anchor, minus
  // holidays (which must carry no attendance).
  const holidayRows = await prisma.holiday.findMany({
    where: { tenant_id: tenant.id },
    select: { date: true },
  });
  const holidaySet = new Set(holidayRows.map((h) => isoDay(new Date(h.date))));

  const cutoff = new Date(ctx.anchor.getTime() - 90 * 24 * 3600 * 1000); // 90-day floor
  const days: Date[] = [];
  for (let offset = 1; offset <= HISTORY_WORKING_DAYS; offset++) {
    const d = hariKerja(-offset);
    if (d < cutoff) continue; // never older than 90 days
    if (holidaySet.has(isoDay(d))) continue; // no attendance on holidays
    days.push(d);
  }

  // Shared plan for 12-leave.
  const attendancePlan = {
    wfh: [] as { userId: string; date: Date; timezone: string; managerId: string | null }[],
    leave: [] as {
      userId: string;
      date: Date;
      type: LeaveType;
      timezone: string;
      managerId: string | null;
    }[],
  };

  // Counters for the report / tests.
  const counts = {
    in: 0,
    out: 0,
    late: 0,
    out_of_range: 0,
    auto_checkout: 0,
    wfh: 0,
    leave: 0,
    alpa: 0,
    normal: 0,
    forgot_checkout: 0,
  };

  const jitter = (base: number, spread: number) => base + (rng.next() * 2 - 1) * spread;

  // Upsert a single checkin on its natural key (user_id, date, type).
  async function putCheckin(rec: {
    userId: string;
    date: Date;
    type: CheckinType;
    workStatus: WorkStatus;
    lat: number;
    lng: number;
    selfieKey: string;
    isLate: boolean;
    isAuto: boolean;
    geofenceOk: boolean;
    submittedAt: Date;
  }) {
    const skewMs = rng.int(-180, 180) * 1000; // ±3 min forensic skew
    const deviceTs = new Date(rec.submittedAt.getTime() + skewMs);
    const data = {
      work_status: rec.workStatus,
      lat: rec.lat,
      lng: rec.lng,
      gps_accuracy_m: rng.int(5, 30),
      selfie_key: rec.selfieKey,
      is_auto: rec.isAuto,
      is_late: rec.isLate,
      geofence_ok: rec.geofenceOk,
      device_timestamp: deviceTs,
      submitted_at: rec.submittedAt,
    };
    await prisma.checkin.upsert({
      where: {
        user_id_date_type: { user_id: rec.userId, date: rec.date, type: rec.type },
      },
      create: { tenant_id: tenantId, user_id: rec.userId, date: rec.date, type: rec.type, ...data },
      update: data,
    });
  }

  for (const u of users) {
    const once = onceIds.has(u.id);
    for (const day of days) {
      const cat = categoryFor(rng.next());

      if (cat === 'alpa') {
        counts.alpa++;
        continue;
      }
      if (cat === 'leave') {
        const type = LEAVE_TYPES[rng.int(0, LEAVE_TYPES.length - 1)];
        attendancePlan.leave.push({ userId: u.id, date: day, type, timezone: u.timezone, managerId: u.manager_id });
        counts.leave++;
        continue;
      }

      // --- Present day: build the IN record ---
      const isWfh = cat === 'wfh';
      const workStatus = isWfh ? WorkStatus.WFH : WorkStatus.WFO;
      const isLate = cat === 'late';
      const isOor = cat === 'out_of_range';

      // Local check-in wall-clock time.
      let inH: number;
      let inM: number;
      if (isLate) {
        const t = rng.int(601, 719); // 10:01–11:59
        inH = Math.floor(t / 60);
        inM = t % 60;
      } else {
        inH = rng.int(7, 9); // 07:00–09:59
        inM = rng.int(0, 59);
      }
      const inAt = jamLokal(u.timezone, inH, inM, day);

      // Coordinates.
      let lat: number;
      let lng: number;
      let geofenceOk: boolean;
      if (isOor) {
        lat = officeLat + 0.05; // ~5.5 km away
        lng = officeLng + 0.05;
        geofenceOk = false;
      } else if (isWfh) {
        lat = jitter(officeLat, 0.03); // home; WFH location recorded, not validated
        lng = jitter(officeLng, 0.03);
        geofenceOk = true;
      } else {
        lat = jitter(officeLat, 0.0005); // ~50 m inside radius
        lng = jitter(officeLng, 0.0005);
        geofenceOk = true;
      }

      await putCheckin({
        userId: u.id,
        date: day,
        type: CheckinType.IN,
        workStatus,
        lat,
        lng,
        selfieKey: selfieKeyByUser[u.id],
        isLate,
        isAuto: false,
        geofenceOk,
        submittedAt: inAt,
      });
      counts.in++;
      if (isLate) counts.late++;
      if (isOor) counts.out_of_range++;
      if (cat === 'normal') counts.normal++;
      if (cat === 'forgot_checkout') counts.forgot_checkout++;

      if (isWfh) {
        counts.wfh++;
        attendancePlan.wfh.push({ userId: u.id, date: day, timezone: u.timezone, managerId: u.manager_id });
      }

      // --- OUT record (TWICE users only) ---
      if (once) continue; // ONCE: never an OUT, never auto-checkout

      if (cat === 'forgot_checkout') {
        // Auto-checkout at 18:00 local.
        const outAt = jamLokal(u.timezone, 18, 0, day);
        await putCheckin({
          userId: u.id,
          date: day,
          type: CheckinType.OUT,
          workStatus,
          lat,
          lng,
          selfieKey: selfieKeyByUser[u.id],
          isLate: false,
          isAuto: true,
          geofenceOk,
          submittedAt: outAt,
        });
        counts.out++;
        counts.auto_checkout++;
      } else {
        const t = rng.int(990, 1140); // 16:30–19:00
        const outAt = jamLokal(u.timezone, Math.floor(t / 60), t % 60, day);
        await putCheckin({
          userId: u.id,
          date: day,
          type: CheckinType.OUT,
          workStatus,
          lat: isWfh ? lat : jitter(officeLat, 0.0005),
          lng: isWfh ? lng : jitter(officeLng, 0.0005),
          selfieKey: selfieKeyByUser[u.id],
          isLate: false,
          isAuto: false,
          geofenceOk: true,
          submittedAt: outAt,
        });
        counts.out++;
      }
    }
  }

  ctx.refs.attendance = attendancePlan;
  ctx.refs.onceUserIds = [...onceIds];

  log.step(
    `days=${days.length} users=${users.length} | IN=${counts.in} OUT=${counts.out} ` +
      `late=${counts.late} oor=${counts.out_of_range} auto=${counts.auto_checkout} ` +
      `wfh=${counts.wfh} leave=${counts.leave} alpa=${counts.alpa}`,
  );
  log.count('checkins', counts.in + counts.out);
  log.finish();
}
