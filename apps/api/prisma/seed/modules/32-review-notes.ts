import { PrismaClient } from '@prisma/client';
import type { SeedContext } from '../lib/context';
import { createLogger, findOrCreate } from '../lib/upsert';

/**
 * Weekly review notes module (profile: full). Each MANAGER writes one note per
 * week (last 4 weeks) covering up to 2 direct reports — short Indonesian
 * template text varied by the seeded RNG. Idempotent via find-or-create on
 * (author_id, week_start).
 */

const WEEKS = 4;

const HIGHLIGHT_TEMPLATES = [
  (a: string, b: string) => `${a} dan ${b} menuntaskan mayoritas task sprint tepat waktu.`,
  (a: string, b: string) => `Progres solid dari ${a}; ${b} perlu dukungan pada item ber-risiko.`,
  (a: string, b: string) => `${a} disiplin check-in; ${b} menutup satu blocker penting.`,
  (a: string, b: string) => `Kolaborasi ${a} & ${b} membaik minggu ini, throughput naik.`,
];
const DECISION_TEMPLATES = [
  'Lanjutkan ritme standup harian; fokus turunkan carry-over.',
  'Prioritaskan penyelesaian blocker sebelum mengambil task baru.',
  'Pindahkan satu task ber-risiko ke sprint berikutnya.',
  'Tambah sesi pairing untuk mempercepat item kritis.',
];
const ACTION_TEMPLATES = [
  'Review ulang estimasi task ber-bobot tinggi',
  'Follow-up approval cuti yang tertunda',
  'Pastikan evidence terlampir pada task DONE',
  'Jadwalkan 1:1 dengan anggota yang telat check-in',
];

export async function seedReviewNotes(prisma: PrismaClient, ctx: SeedContext): Promise<void> {
  const log = createLogger('32-review-notes');
  const rng = ctx.rng;

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
  if (!tenant) {
    log.step('tenant indotek not found — run core first; skipping.');
    log.finish();
    return;
  }
  const tenantId = tenant.id;

  const weeks: Date[] = [];
  for (let i = WEEKS; i >= 1; i--) weeks.push(new Date(ctx.anchor.getTime() - i * 7 * 24 * 3600 * 1000));

  const managers = await prisma.user.findMany({
    where: { tenant_id: tenantId, system_roles: { has: 'MANAGER' } },
    orderBy: { nik: 'asc' },
    select: { id: true, full_name: true },
  });

  let notes = 0;
  for (const mgr of managers) {
    const reports = await prisma.user.findMany({
      where: { tenant_id: tenantId, manager_id: mgr.id },
      orderBy: { nik: 'asc' },
      select: { full_name: true },
      take: 2,
    });
    const a = reports[0]?.full_name ?? 'anggota tim';
    const b = reports[1]?.full_name ?? 'anggota lain';

    for (const week of weeks) {
      const highlights = rng.pick(HIGHLIGHT_TEMPLATES)(a, b);
      const decisions = rng.pick(DECISION_TEMPLATES);
      const actions = [rng.pick(ACTION_TEMPLATES), rng.pick(ACTION_TEMPLATES)];
      await findOrCreate(
        prisma.reviewNote,
        { tenant_id: tenantId, author_id: mgr.id, week_start: week },
        {
          tenant_id: tenantId,
          author_id: mgr.id,
          week_start: week,
          highlights,
          decisions,
          actions_json: { items: actions, subjects: [a, b] },
        },
      );
      notes++;
    }
  }

  log.step(`managers=${managers.length} weeks=${WEEKS} review_notes=${notes}`);
  log.count('review_notes', notes);
  log.finish();
}
