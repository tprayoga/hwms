import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

/**
 * Umbrella seed gate (Fase S6). Proves the whole `full` seed is healthy end to
 * end on an EMPTY database:
 *   a. full seed on an empty DB succeeds;
 *   b. the reconciliation gate stays green afterwards;
 *   c. a second full run yields identical counts for EVERY table (idempotent);
 *   d. Saft VE POC guard: 456 tasks, aggregate unchanged (sum % = 0);
 *   e. no attendance record lands on a holiday;
 *   f. no orphaned rows across the main relations (FK integrity).
 */

const DELEGATES = [
  'tenant', 'user', 'department', 'functionalRole', 'team', 'teamMember', 'project',
  'sprint', 'task', 'taskAssignment', 'taskDependency', 'taskEvidence', 'checkin',
  'standupItem', 'blocker', 'leaveRequest', 'policy', 'wfhQuota', 'location', 'holiday',
  'setting', 'kPI', 'kpiActual', 'oKR', 'keyResult', 'risk', 'gate', 'gateDecision',
  'scorecard', 'reviewNote', 'notification', 'pushSubscription', 'auditLog',
] as const;

// child table, FK column, parent table — main relations to verify for orphans.
const RELATIONS: [string, string, string][] = [
  ['User', 'tenant_id', 'Tenant'],
  ['Task', 'project_id', 'Project'],
  ['Task', 'sprint_id', 'Sprint'],
  ['TaskAssignment', 'task_id', 'Task'],
  ['TaskAssignment', 'user_id', 'User'],
  ['TaskEvidence', 'task_id', 'Task'],
  ['Checkin', 'user_id', 'User'],
  ['Blocker', 'task_id', 'Task'],
  ['LeaveRequest', 'user_id', 'User'],
  ['WfhQuota', 'user_id', 'User'],
  ['Scorecard', 'user_id', 'User'],
  ['ReviewNote', 'author_id', 'User'],
  ['Policy', 'tenant_id', 'Tenant'],
  ['OKR', 'project_id', 'Project'],
  ['KeyResult', 'okr_id', 'OKR'],
  ['KPI', 'functional_role_id', 'FunctionalRole'],
  ['KpiActual', 'kpi_id', 'KPI'],
  ['Risk', 'project_id', 'Project'],
  ['Gate', 'project_id', 'Project'],
  ['GateDecision', 'gate_id', 'Gate'],
  ['Notification', 'user_id', 'User'],
];

describe('Umbrella seed gate (full profile)', () => {
  const prisma = new PrismaClient();
  const seedEntry = path.join(__dirname, 'index.ts');
  const reconSpec = path.join(__dirname, '..', '..', 'src', 'dashboard', 'reconciliation.spec.ts');
  const apiRoot = path.join(__dirname, '..', '..');

  function runSeedFull() {
    execFileSync('npx', ['ts-node', seedEntry], {
      cwd: apiRoot,
      env: { ...process.env, SEED_PROFILE: 'full' },
      stdio: 'pipe',
    });
  }

  async function emptyDatabase() {
    const rows: { tablename: string }[] = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
    );
    const list = rows.map((r) => `"${r.tablename}"`).join(', ');
    if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  async function snapshotAll(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const d of DELEGATES) out[d] = await (prisma as any)[d].count();
    return out;
  }

  let firstSnapshot: Record<string, number>;

  beforeAll(async () => {
    await prisma.$connect();
    await emptyDatabase(); // (a) start from a genuinely empty DB
    runSeedFull();
    firstSnapshot = await snapshotAll();
  }, 240000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('a. full seed on an empty DB produced the expected dataset', () => {
    expect(firstSnapshot.tenant).toBe(1);
    expect(firstSnapshot.user).toBe(24);
    expect(firstSnapshot.task).toBe(516); // 456 Saft + 60 demo
    expect(firstSnapshot.project).toBeGreaterThanOrEqual(2);
    expect(firstSnapshot.checkin).toBeGreaterThan(0);
    expect(firstSnapshot.scorecard).toBe(96);
    expect(firstSnapshot.oKR).toBe(3);
    expect(firstSnapshot.notification).toBe(120);
  });

  it('b. reconciliation.spec.ts is green after the full seed', () => {
    expect(() =>
      execFileSync('npx', ['vitest', 'run', reconSpec], { cwd: apiRoot, env: process.env, stdio: 'pipe' }),
    ).not.toThrow();
  }, 120000);

  it('c. a second full run yields identical counts for every table (idempotent)', async () => {
    runSeedFull();
    const second = await snapshotAll();
    expect(second).toEqual(firstSnapshot);
  }, 180000);

  it('d. Saft VE POC guard: 456 tasks and unchanged aggregate', async () => {
    const saft = await prisma.project.findFirstOrThrow({ where: { name: 'Saft VE POC' } });
    const agg = await prisma.task.aggregate({
      where: { project_id: saft.id },
      _count: { _all: true },
      _sum: { percent_complete: true },
    });
    expect(agg._count._all).toBe(456);
    expect(agg._sum.percent_complete ?? 0).toBe(0);
  });

  it('e. no attendance record falls on a holiday date', async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: 'indotek' } });
    const holidays = await prisma.holiday.findMany({ where: { tenant_id: tenant.id }, select: { date: true } });
    const holidaySet = new Set(holidays.map((h) => new Date(h.date).toISOString().slice(0, 10)));
    const checkins = await prisma.checkin.findMany({ select: { date: true } });
    const onHoliday = checkins.filter((c) => holidaySet.has(new Date(c.date).toISOString().slice(0, 10)));
    expect(onHoliday.length).toBe(0);
  });

  it('f. no orphaned rows across the main relations (FK integrity)', async () => {
    for (const [child, fk, parent] of RELATIONS) {
      const res: { count: bigint }[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS count FROM "${child}" c
         LEFT JOIN "${parent}" p ON c."${fk}" = p."id"
         WHERE c."${fk}" IS NOT NULL AND p."id" IS NULL`,
      );
      expect(Number(res[0].count), `orphaned ${child}.${fk} -> ${parent}`).toBe(0);
    }
  });
});
