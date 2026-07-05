import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { TaskAggregationService } from '../../src/task/task-aggregation.service';

/**
 * Phase S3 gate — demo project with non-zero progress. Verifies the demo
 * aggregates come from the PRODUCTION formula (not hand-written), the blocker
 * split, and that Saft VE POC is untouched (the guard's effect).
 */
describe('Seed full profile: HWMS Internal Rollout demo project', () => {
  const prisma = new PrismaClient();
  const aggregation = new TaskAggregationService({} as any, {} as any);
  const seedEntry = path.join(__dirname, 'index.ts');
  const apiRoot = path.join(__dirname, '..', '..');

  let projectId: string;
  const sprintIds: Record<number, string> = {};

  beforeAll(async () => {
    execFileSync('npx', ['ts-node', seedEntry], {
      cwd: apiRoot,
      env: { ...process.env, SEED_PROFILE: 'full' },
      stdio: 'pipe',
    });
    await prisma.$connect();
    const project = await prisma.project.findFirstOrThrow({ where: { name: 'HWMS Internal Rollout' } });
    projectId = project.id;
    const sprints = await prisma.sprint.findMany({ where: { project_id: projectId }, orderBy: { number: 'asc' } });
    for (const s of sprints) sprintIds[s.number] = s.id;
  }, 240000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has 4 sprints and ~60 tasks', async () => {
    expect(Object.keys(sprintIds).length).toBe(4);
    const count = await prisma.task.count({ where: { project_id: projectId } });
    expect(count).toBe(60);
  });

  it('per-sprint aggregate equals the production calculateProgress (not hand-written)', async () => {
    const expectedRange: Record<number, [number, number]> = {
      1: [100, 100],
      2: [60, 80],
      3: [20, 40],
      4: [0, 0],
    };
    for (let n = 1; n <= 4; n++) {
      const tasks = await prisma.task.findMany({
        where: { project_id: projectId, sprint_id: sprintIds[n] },
        include: { blockers: true },
      });
      const agg = await aggregation.calculateProgress(tasks);

      // Independently recompute the weighted average and require the production
      // service to match it — proving the number is formula-derived.
      const sumW = tasks.reduce((a, t) => a + Number(t.weight), 0);
      const sumWP = tasks.reduce((a, t) => a + Number(t.weight) * t.percent_complete, 0);
      const manual = Math.round((sumWP / sumW) * 100) / 100;
      expect(agg.progressPct, `sprint ${n} formula parity`).toBe(manual);

      const [lo, hi] = expectedRange[n];
      expect(agg.progressPct, `sprint ${n} range`).toBeGreaterThanOrEqual(lo);
      expect(agg.progressPct, `sprint ${n} range`).toBeLessThanOrEqual(hi);
    }
  });

  it('has 5 active (OPEN) and 3 resolved blockers in the demo project', async () => {
    const open = await prisma.blocker.count({ where: { task: { project_id: projectId }, status: 'OPEN' } });
    const resolved = await prisma.blocker.count({ where: { task: { project_id: projectId }, status: 'RESOLVED' } });
    expect(open).toBe(5);
    expect(resolved).toBe(3);
  });

  it('attached evidence referencing the two shared placeholders', async () => {
    const evidences = await prisma.taskEvidence.findMany({ where: { task: { project_id: projectId } } });
    expect(evidences.length).toBeGreaterThanOrEqual(10);
    const keys = new Set(evidences.map((e) => e.url_or_key));
    expect(keys.has('seed/evidence/placeholder.pdf')).toBe(true);
    expect(keys.has('seed/evidence/placeholder.png')).toBe(true);
  });

  it('left Saft VE POC untouched (guard effect): 456 tasks, sum(percent_complete)=0', async () => {
    const saft = await prisma.project.findFirstOrThrow({ where: { name: 'Saft VE POC' } });
    const agg = await prisma.task.aggregate({
      where: { project_id: saft.id },
      _count: { _all: true },
      _sum: { percent_complete: true },
    });
    expect(agg._count._all).toBe(456);
    expect(agg._sum.percent_complete ?? 0).toBe(0);
  });
});
