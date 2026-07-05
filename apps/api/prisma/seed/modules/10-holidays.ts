import { PrismaClient } from '@prisma/client';
import type { SeedContext } from '../lib/context';
import { upsertBy, createLogger } from '../lib/upsert';

/**
 * National holidays module (profile: full).
 *
 * Seeds Indonesian national holidays for the ANCHOR_DATE year + 2 cuti bersama,
 * scoped to tenant `indotek`. The list is hardcoded (no API fetch) and keyed by
 * month/day so it tracks the anchor year deterministically. Upserts on the
 * (tenant_id, date) natural key, so it coexists with the holidays that 00-core
 * already seeds — no duplicates, fully idempotent.
 *
 * Note: Indonesian religious holidays are lunar and shift year to year; the
 * month/day tuples mirror 2026 and are demo-grade for other anchor years.
 */

// [month(1-12), day, name, is_cuti_bersama]
const HOLIDAYS: [number, number, string, boolean][] = [
  [1, 1, 'Tahun Baru Masehi', false],
  [2, 17, 'Tahun Baru Imlek', false],
  [3, 18, 'Hari Suci Nyepi', false],
  [3, 20, 'Hari Raya Idul Fitri (Hari Ke-1)', false],
  [3, 21, 'Hari Raya Idul Fitri (Hari Ke-2)', false],
  [3, 23, 'Cuti Bersama Idul Fitri', true], // cuti bersama #1
  [3, 24, 'Cuti Bersama Idul Fitri', true], // cuti bersama #2
  [4, 3, 'Wafat Isa Almasih', false],
  [5, 1, 'Hari Buruh Internasional', false],
  [5, 27, 'Hari Raya Idul Adha', false],
  [6, 1, 'Hari Lahir Pancasila', false],
  [6, 16, 'Tahun Baru Islam', false],
  [8, 17, 'Hari Kemerdekaan RI', false],
  [12, 25, 'Hari Raya Natal', false],
];

export async function seedHolidays(prisma: PrismaClient, ctx: SeedContext): Promise<void> {
  const log = createLogger('10-holidays');
  const year = ctx.anchor.getUTCFullYear();

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
  if (!tenant) {
    log.step('tenant indotek not found — run core first; skipping.');
    log.finish();
    return;
  }

  for (const [month, day, name, cutiBersama] of HOLIDAYS) {
    const date = new Date(Date.UTC(year, month - 1, day));
    await upsertBy(
      prisma.holiday,
      { tenant_id_date: { tenant_id: tenant.id, date } },
      { tenant_id: tenant.id, date, name, is_cuti_bersama: cutiBersama },
      { name, is_cuti_bersama: cutiBersama },
    );
    log.count(cutiBersama ? 'cuti_bersama' : 'nasional');
  }

  log.finish();
}
