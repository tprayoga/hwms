import {
  PrismaClient,
  TaskStatus,
  TaskPriority,
  RiskLevel,
  EvidenceKind,
  BlockerStatus,
} from '@prisma/client';
import type { SeedContext } from '../lib/context';
import { createLogger, findOrCreate } from '../lib/upsert';
import { hariKerja } from '../lib/dates';
import { StorageService } from '../../../src/storage/storage.service';
import { TaskAggregationService } from '../../../src/task/task-aggregation.service';

/**
 * Demo project module (profile: full) — a SECOND project with non-zero progress
 * so dashboards show an interesting completion curve. It NEVER touches the
 * reconciliation-gated "Saft VE POC" dataset; a hard guard at the end re-checks
 * Saft's task count and percent_complete sum and throws if either drifted.
 *
 * Progress by sprint: S1=100%, S2≈70%, S3≈30%, S4=0%. ~60 tasks, varied weights,
 * assigned to existing users. ~8 tasks carry blockers (5 OPEN → BLOCKED, 3
 * RESOLVED → back to IN_PROGRESS). ~10 tasks carry evidence referencing two
 * shared placeholder objects (1 PDF, 1 PNG). All variation is RNG-seeded and
 * idempotent (upsert / find-or-create on natural keys).
 */

const PROJECT_NAME = 'HWMS Internal Rollout';
const CODE_PREFIX = 'HIR';
const NUM_SPRINTS = 4;
const TASKS_PER_SPRINT = 15;
const NUM_BLOCKED = 8; // 5 OPEN + 3 RESOLVED
const NUM_OPEN_BLOCKERS = 5;
const NUM_EVIDENCE_TASKS = 10;

// 1x1 transparent PNG.
const PLACEHOLDER_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// Minimal PDF document.
const PLACEHOLDER_PDF =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
  'trailer<</Root 1 0 R/Size 4>>\n%%EOF\n';

const WORKSTREAMS = ['Onboarding', 'Migrasi Data', 'Integrasi SSO', 'Pelatihan', 'Go-Live'];

function pctForSprint(sprintNumber: number, rng: SeedContext['rng']): number {
  switch (sprintNumber) {
    case 1:
      return 100;
    case 2:
      return rng.int(60, 80); // ≈70%
    case 3:
      return rng.int(20, 40); // ≈30%
    default:
      return 0; // sprint 4
  }
}

function statusForPct(pct: number): TaskStatus {
  if (pct >= 100) return TaskStatus.DONE;
  if (pct <= 0) return TaskStatus.NOT_STARTED;
  return TaskStatus.IN_PROGRESS;
}

export async function seedDemoProject(prisma: PrismaClient, ctx: SeedContext): Promise<void> {
  const log = createLogger('20-demo-project');
  const rng = ctx.rng;

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
  if (!tenant) {
    log.step('tenant indotek not found — run core first; skipping.');
    log.finish();
    return;
  }
  const tenantId = tenant.id;

  // --- GUARD baseline: snapshot Saft VE POC BEFORE we write anything ---
  const saft = await prisma.project.findFirst({ where: { tenant_id: tenantId, name: 'Saft VE POC' } });
  const saftBaseline = saft
    ? await prisma.task.aggregate({
        where: { project_id: saft.id },
        _count: { _all: true },
        _sum: { percent_complete: true },
      })
    : null;

  const roles = await prisma.functionalRole.findMany({ where: { tenant_id: tenantId }, orderBy: { code: 'asc' } });
  const users = await prisma.user.findMany({
    where: { tenant_id: tenantId, employment_status: 'AKTIF' },
    orderBy: { nik: 'asc' },
    select: { id: true, manager_id: true, system_roles: true },
  });
  if (roles.length === 0 || users.length === 0) {
    log.step('no roles/users — run core first; skipping.');
    log.finish();
    return;
  }
  // Task ownership goes to individual contributors, not managers/admins — keeps
  // superadmin/managers assignment-free (team resolution relies on that).
  const assignPool = users.filter((u) => u.system_roles.includes('EMPLOYEE'));
  const owners = assignPool.length > 0 ? assignPool : users;

  // --- Project + 4 sprints ---
  const project = await findOrCreate(
    prisma.project,
    { tenant_id: tenantId, name: PROJECT_NAME },
    { tenant_id: tenantId, name: PROJECT_NAME, code_prefix: CODE_PREFIX, status: 'ACTIVE' },
  );

  const sprints: Record<number, any> = {};
  for (let n = 1; n <= NUM_SPRINTS; n++) {
    // Sprints span past → future so S4's planned_end is not yet due.
    const start = hariKerja((n - 3) * 10); // 10 working days apart
    const end = hariKerja((n - 3) * 10 + 9);
    sprints[n] = await findOrCreate(
      prisma.sprint,
      { tenant_id: tenantId, project_id: project.id, number: n },
      {
        tenant_id: tenantId,
        project_id: project.id,
        number: n,
        start_date: start,
        end_date: end,
        goal: `Demo sprint ${n} — HWMS internal rollout`,
      },
    );
  }

  // --- Tasks (upsert by code) ---
  interface DemoTask {
    id: string;
    code: string;
    sprintNumber: number;
    weight: number;
    percent: number;
  }
  const demoTasks: DemoTask[] = [];
  let counter = 0;
  for (let n = 1; n <= NUM_SPRINTS; n++) {
    const sprint = sprints[n];
    for (let j = 0; j < TASKS_PER_SPRINT; j++) {
      counter++;
      const code = `${CODE_PREFIX}-${String(n).padStart(2, '0')}-${String(counter).padStart(4, '0')}`;
      const weight = rng.int(1, 5);
      const percent = pctForSprint(n, rng);
      const status = statusForPct(percent);
      const role = roles[rng.int(0, roles.length - 1)];
      const priority = rng.pick([
        TaskPriority.CRITICAL,
        TaskPriority.HIGH,
        TaskPriority.MEDIUM,
        TaskPriority.LOW,
      ]);
      const risk = rng.pick([RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW]);
      const workstream = rng.pick(WORKSTREAMS);

      const data = {
        sprint_id: sprint.id,
        functional_role_id: role.id,
        workstream,
        title: `${workstream} — item ${counter}`,
        deliverable: `Deliverable untuk ${workstream.toLowerCase()} (${code})`,
        priority,
        status,
        percent_complete: percent,
        weight,
        risk_level: risk,
        planned_start: sprint.start_date,
        planned_end: sprint.end_date,
      };
      const task = await prisma.task.upsert({
        where: { code },
        create: { tenant_id: tenantId, project_id: project.id, code, ...data },
        update: data,
      });

      // Assign an owner (round-robin over individual contributors, deterministic).
      const owner = owners[counter % owners.length];
      await findOrCreate(
        prisma.taskAssignment,
        { tenant_id: tenantId, task_id: task.id, user_id: owner.id, unassigned_at: null },
        { tenant_id: tenantId, task_id: task.id, user_id: owner.id },
      );

      demoTasks.push({ id: task.id, code, sprintNumber: n, weight, percent });
    }
  }

  // --- Blockers: pick 8 tasks from sprints 2..4 (avoid the 100%-done sprint 1) ---
  const blockerCandidates = demoTasks.filter((t) => t.sprintNumber >= 2);
  const chosen = new Set<number>();
  const pickIdx = (pool: DemoTask[]) => {
    let idx = rng.int(0, pool.length - 1);
    let guard = 0;
    while (chosen.has(idx) && guard < 10000) {
      idx = rng.int(0, pool.length - 1);
      guard++;
    }
    chosen.add(idx);
    return pool[idx];
  };
  let openBlockers = 0;
  let resolvedBlockers = 0;
  for (let k = 0; k < NUM_BLOCKED; k++) {
    const t = pickIdx(blockerCandidates);
    const isOpen = k < NUM_OPEN_BLOCKERS;
    const reporter = users[rng.int(0, users.length - 1)];
    const resolver = users[rng.int(0, users.length - 1)];
    const openedAt = new Date(ctx.anchor.getTime() - rng.int(3, 10) * 24 * 3600 * 1000);

    await findOrCreate(
      prisma.blocker,
      { tenant_id: tenantId, task_id: t.id },
      {
        tenant_id: tenantId,
        task_id: t.id,
        reported_by: reporter.id,
        description: `Blocker demo pada ${t.code}: menunggu dependensi eksternal.`,
        mentioned_user_ids: reporter.manager_id ? [reporter.manager_id] : [],
        status: isOpen ? BlockerStatus.OPEN : BlockerStatus.RESOLVED,
        opened_at: openedAt,
        resolved_at: isOpen ? null : new Date(openedAt.getTime() + 2 * 24 * 3600 * 1000),
        resolved_by: isOpen ? null : resolver.id,
      },
    );

    // OPEN blocker -> task BLOCKED; RESOLVED -> back to IN_PROGRESS (business rule).
    await prisma.task.update({
      where: { id: t.id },
      data: { status: isOpen ? TaskStatus.BLOCKED : TaskStatus.IN_PROGRESS },
    });
    if (isOpen) openBlockers++;
    else resolvedBlockers++;
  }

  // --- Evidence: upload two shared placeholders, reference from ~10 tasks ---
  const storage = new StorageService();
  const evidenceBucket = process.env.S3_BUCKET_EVIDENCES || 'evidences';
  const pdfKey = 'seed/evidence/placeholder.pdf';
  const pngKey = 'seed/evidence/placeholder.png';
  try {
    await storage.uploadFile(evidenceBucket, pdfKey, Buffer.from(PLACEHOLDER_PDF, 'utf-8'), 'application/pdf');
    await storage.uploadFile(evidenceBucket, pngKey, Buffer.from(PLACEHOLDER_PNG_B64, 'base64'), 'image/png');
  } catch (e: any) {
    log.step(`evidence placeholder upload skipped: ${e?.message ?? e}`);
  }

  // Evidence goes on completed/in-progress tasks (sprints 1..3), deterministic.
  const evidencePool = demoTasks.filter((t) => t.sprintNumber <= 3);
  for (let k = 0; k < Math.min(NUM_EVIDENCE_TASKS, evidencePool.length); k++) {
    const t = evidencePool[k * 3 % evidencePool.length];
    const key = k % 2 === 0 ? pdfKey : pngKey;
    const uploader = users[rng.int(0, users.length - 1)];
    await findOrCreate(
      prisma.taskEvidence,
      { tenant_id: tenantId, task_id: t.id, url_or_key: key },
      { tenant_id: tenantId, task_id: t.id, kind: EvidenceKind.FILE, url_or_key: key, uploaded_by: uploader.id },
    );
  }

  // --- Aggregates via PRODUCTION code (not hand-computed) ---
  const aggregation = new TaskAggregationService({} as any, {} as any);
  const perSprint: Record<number, { progressPct: number; rag: string }> = {};
  for (let n = 1; n <= NUM_SPRINTS; n++) {
    const tasks = await prisma.task.findMany({
      where: { project_id: project.id, sprint_id: sprints[n].id },
      include: { blockers: true },
    });
    const agg = await aggregation.calculateProgress(tasks);
    perSprint[n] = agg;
    log.step(`sprint ${n}: progress=${agg.progressPct}% rag=${agg.rag} (${tasks.length} tasks)`);
  }
  ctx.refs.demoProject = { projectId: project.id, perSprint };

  // --- HARD GUARD: Saft VE POC must be untouched ---
  if (saft && saftBaseline) {
    const after = await prisma.task.aggregate({
      where: { project_id: saft.id },
      _count: { _all: true },
      _sum: { percent_complete: true },
    });
    const beforeCount = saftBaseline._count._all;
    const afterCount = after._count._all;
    const beforeSum = saftBaseline._sum.percent_complete ?? 0;
    const afterSum = after._sum.percent_complete ?? 0;
    if (afterCount !== beforeCount || afterSum !== beforeSum) {
      throw new Error(
        `GUARD FAILED: Saft VE POC drifted — count ${beforeCount}->${afterCount}, ` +
          `sum(percent_complete) ${beforeSum}->${afterSum}. Demo module must never touch Saft.`,
      );
    }
    log.step(`guard OK: Saft VE POC intact (count=${afterCount}, sum%=${afterSum}).`);
  }

  log.count('tasks', demoTasks.length);
  log.count('blockers_open', openBlockers);
  log.count('blockers_resolved', resolvedBlockers);
  log.finish();
}
