import {
  PrismaClient,
  KPIPeriod,
  RiskProbability,
  RiskImpact,
  RiskStatus,
  GateDecisionStatus,
} from '@prisma/client';
import type { SeedContext } from '../lib/context';
import { createLogger, findOrCreate } from '../lib/upsert';
import { TaskAggregationService } from '../../../src/task/task-aggregation.service';

/**
 * Governance module (profile: full) — F3 tables (OKR/KR, KPI/actuals, Risk,
 * Gate/decision) so the schema audit isn't looking at empty tables and F3 devs
 * have data. Where possible, "current" numbers are computed from real seeded
 * data (attendance %, demo completion), not hand-written. Idempotent via
 * find-or-create on natural-ish keys.
 */

function isoMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function seedGovernance(prisma: PrismaClient, ctx: SeedContext): Promise<void> {
  const log = createLogger('40-governance');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
  if (!tenant) {
    log.step('tenant indotek not found — run core first; skipping.');
    log.finish();
    return;
  }
  const tenantId = tenant.id;

  const project = await prisma.project.findFirst({ where: { tenant_id: tenantId, name: 'HWMS Internal Rollout' } });
  const roles = await prisma.functionalRole.findMany({ where: { tenant_id: tenantId }, orderBy: { code: 'asc' } });
  const pmAdmin = await prisma.user.findFirst({ where: { tenant_id: tenantId, email: 'pm.admin@indotek.com' } });
  const superAdmin = await prisma.user.findFirst({ where: { tenant_id: tenantId, email: 'superadmin@indotek.com' } });
  if (!project || roles.length === 0 || !pmAdmin || !superAdmin) {
    log.step('missing prerequisites (project/roles/users) — run core+demo first; skipping.');
    log.finish();
    return;
  }
  const ownerId = pmAdmin.id;

  const q = Math.floor(ctx.anchor.getUTCMonth() / 3) + 1;
  const quarter = `${ctx.anchor.getUTCFullYear()}-Q${q}`;
  const monthNow = isoMonth(ctx.anchor);
  const monthPrev = new Date(Date.UTC(ctx.anchor.getUTCFullYear(), ctx.anchor.getUTCMonth() - 1, 1));
  const monthPrev2 = new Date(Date.UTC(ctx.anchor.getUTCFullYear(), ctx.anchor.getUTCMonth() - 2, 1));

  // ---- OKRs (3 objectives × 3–4 KRs) ----
  const okrDefs = [
    {
      objective: 'Rollout HWMS internal berjalan mulus di seluruh tim',
      krs: [
        ['Adopsi harian standup mencapai 90% karyawan aktif', 90, '%'],
        ['Waktu onboarding user baru < 2 hari kerja', 2, 'hari'],
        ['Tingkat kehadiran tercatat via HWMS ≥ 95%', 95, '%'],
      ],
    },
    {
      objective: 'Kualitas data kehadiran & task terjaga untuk payroll dan PM',
      krs: [
        ['Selisih rekonsiliasi agregat vs sumber ≤ 0,5%', 0.5, '%'],
        ['Cakupan evidence pada task DONE ≥ 80%', 80, '%'],
        ['Blocker kritis terselesaikan < 3 hari', 3, 'hari'],
        ['Kepatuhan check-in tim ≥ 90%', 90, '%'],
      ],
    },
    {
      objective: 'Kesiapan produk untuk dijual ke klien B2G/enterprise',
      krs: [
        ['Multi-tenant isolation lulus 100% test', 100, '%'],
        ['Dokumentasi API tercakup ≥ 95% endpoint', 95, '%'],
        ['Uptime lingkungan demo ≥ 99%', 99, '%'],
      ],
    },
  ];
  let okrCount = 0;
  let krCount = 0;
  for (const def of okrDefs) {
    const okr = await findOrCreate(
      prisma.oKR,
      { tenant_id: tenantId, project_id: project.id, objective: def.objective },
      { tenant_id: tenantId, project_id: project.id, objective: def.objective, quarter, owner_id: ownerId },
    );
    okrCount++;
    for (const [description, target, unit] of def.krs) {
      const actual = Math.round(Number(target) * 0.6 * 100) / 100; // deterministic mid-progress
      await findOrCreate(
        prisma.keyResult,
        { tenant_id: tenantId, okr_id: okr.id, description },
        { tenant_id: tenantId, okr_id: okr.id, description, target: Number(target), actual, unit: String(unit) },
      );
      krCount++;
    }
  }

  // ---- KPIs (6) with 3 monthly actuals; some current values from real data ----
  const aggregation = new TaskAggregationService({} as any, {} as any);

  // Real attendance rate for the current month.
  const monthEnd = new Date(Date.UTC(monthNow.getUTCFullYear(), monthNow.getUTCMonth() + 1, 1));
  const inRecs = await prisma.checkin.findMany({
    where: { tenant_id: tenantId, type: 'IN', date: { gte: monthNow, lt: monthEnd } },
    select: { date: true },
  });
  const distinctDays = new Set(inRecs.map((r) => new Date(r.date).toISOString().slice(0, 10))).size;
  const usersCount = await prisma.user.count({ where: { tenant_id: tenantId, employment_status: 'AKTIF' } });
  const attendanceRate = distinctDays > 0 ? Math.round((inRecs.length / (usersCount * distinctDays)) * 1000) / 10 : 0;

  // Real demo-project completion for the current month.
  const demoTasks = await prisma.task.findMany({ where: { project_id: project.id }, include: { blockers: true } });
  const demoCompletion = (await aggregation.calculateProgress(demoTasks)).progressPct;

  const roleByCode = (code: string) => roles.find((r) => r.code === code) ?? roles[0];
  const kpiDefs: {
    name: string; roleCode: string; target: number; unit: string; actuals: [number, number, number];
  }[] = [
    { name: 'Tingkat Kehadiran', roleCode: 'QA', target: 95, unit: '%', actuals: [90, 92, attendanceRate] },
    { name: 'Penyelesaian Task Sprint', roleCode: 'BE', target: 80, unit: '%', actuals: [40, 60, demoCompletion] },
    { name: 'Kepatuhan Check-in', roleCode: 'FE', target: 90, unit: '%', actuals: [85, 88, 91] },
    { name: 'Waktu Resolusi Blocker', roleCode: 'Infra', target: 3, unit: 'hari', actuals: [4, 3.5, 3] },
    { name: 'Cakupan Evidence Task DONE', roleCode: 'TW', target: 80, unit: '%', actuals: [60, 70, 78] },
    { name: 'Kualitas Rilis (defect escaped)', roleCode: 'QA', target: 2, unit: 'defect', actuals: [5, 3, 2] },
  ];
  let kpiCount = 0;
  let actualCount = 0;
  for (const def of kpiDefs) {
    const kpi = await findOrCreate(
      prisma.kPI,
      { tenant_id: tenantId, functional_role_id: roleByCode(def.roleCode).id, name: def.name },
      {
        tenant_id: tenantId,
        functional_role_id: roleByCode(def.roleCode).id,
        name: def.name,
        target: def.target,
        unit: def.unit,
        period: KPIPeriod.MONTHLY,
      },
    );
    kpiCount++;
    const months = [monthPrev2, monthPrev, monthNow];
    for (let i = 0; i < months.length; i++) {
      await findOrCreate(
        prisma.kpiActual,
        { tenant_id: tenantId, kpi_id: kpi.id, period_start: months[i] },
        { tenant_id: tenantId, kpi_id: kpi.id, period_start: months[i], actual: def.actuals[i] },
      );
      actualCount++;
    }
  }

  // ---- Risks (2 HIGH, 2 MEDIUM, 1 LOW) ----
  const riskDefs: { description: string; category: string; sev: 'HIGH' | 'MEDIUM' | 'LOW'; mitigation: string }[] = [
    { description: 'Migrasi data kehadiran lama tidak lengkap', category: 'Data', sev: 'HIGH', mitigation: 'Validasi rekonsiliasi otomatis + rollback plan sebelum cutover.' },
    { description: 'Ketergantungan tunggal pada engineer infrastruktur', category: 'SDM', sev: 'HIGH', mitigation: 'Dokumentasi runbook + pairing lintas anggota untuk bus factor.' },
    { description: 'Adopsi standup rendah di tim lapangan', category: 'Adopsi', sev: 'MEDIUM', mitigation: 'Sosialisasi bertahap + reminder push dan dukungan manajer.' },
    { description: 'Kuota WFH memicu sengketa persetujuan', category: 'Kebijakan', sev: 'MEDIUM', mitigation: 'Kebijakan kuota transparan + jalur eskalasi jelas.' },
    { description: 'Retensi selfie melewati 90 hari karena job gagal', category: 'Privasi', sev: 'LOW', mitigation: 'Monitoring job lifecycle + alert bila gagal berjalan.' },
  ];
  const sevMap = {
    HIGH: { probability: RiskProbability.HIGH, impact: RiskImpact.HIGH },
    MEDIUM: { probability: RiskProbability.MEDIUM, impact: RiskImpact.MEDIUM },
    LOW: { probability: RiskProbability.LOW, impact: RiskImpact.LOW },
  };
  let riskCount = 0;
  for (const r of riskDefs) {
    await findOrCreate(
      prisma.risk,
      { tenant_id: tenantId, project_id: project.id, description: r.description },
      {
        tenant_id: tenantId,
        project_id: project.id,
        description: r.description,
        category: r.category,
        probability: sevMap[r.sev].probability,
        impact: sevMap[r.sev].impact,
        mitigation: r.mitigation,
        owner_id: ownerId,
        status: RiskStatus.OPEN,
      },
    );
    riskCount++;
  }

  // ---- Gates: 1 PASSED (with decision), 1 UPCOMING (no decision) ----
  const gatePassedMonth = monthPrev; // last month → decided
  const gateUpcomingMonth = new Date(Date.UTC(ctx.anchor.getUTCFullYear(), ctx.anchor.getUTCMonth() + 1, 1));

  const passedGate = await findOrCreate(
    prisma.gate,
    { tenant_id: tenantId, project_id: project.id, month: gatePassedMonth },
    {
      tenant_id: tenantId,
      project_id: project.id,
      month: gatePassedMonth,
      criteria_json: { criteria: ['Rekonsiliasi ≤0,5%', 'Tidak ada blocker kritis terbuka', 'Uptime demo ≥99%'], label: 'M1 Readiness' },
    },
  );
  await findOrCreate(
    prisma.gateDecision,
    { tenant_id: tenantId, gate_id: passedGate.id },
    {
      tenant_id: tenantId,
      gate_id: passedGate.id,
      decision: GateDecisionStatus.GO,
      decided_by: superAdmin.id,
      notes: 'Kriteria terpenuhi; lanjut ke fase berikutnya.',
    },
  );

  await findOrCreate(
    prisma.gate,
    { tenant_id: tenantId, project_id: project.id, month: gateUpcomingMonth },
    {
      tenant_id: tenantId,
      project_id: project.id,
      month: gateUpcomingMonth,
      criteria_json: { criteria: ['Cakupan evidence ≥80%', 'KPI kehadiran ≥95%', 'Dokumentasi API ≥95%'], label: 'M2 Readiness' },
    },
  );

  log.step(
    `OKR=${okrCount} KR=${krCount} KPI=${kpiCount} actuals=${actualCount} risks=${riskCount} ` +
      `gates=2 (1 PASSED, 1 UPCOMING) | attendance%=${attendanceRate} demo%=${demoCompletion}`,
  );
  log.count('okrs', okrCount);
  log.count('kpis', kpiCount);
  log.count('risks', riskCount);
  log.finish();
}
