import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

/**
 * Phase S5 gate — governance (OKR/KPI/Risk/Gate) + system trace (audit /
 * notifications).
 */
describe('Seed full profile: governance & system trace', () => {
  const prisma = new PrismaClient();
  const seedEntry = path.join(__dirname, 'index.ts');
  const apiRoot = path.join(__dirname, '..', '..');
  let tenantId: string;
  let projectId: string;

  function runSeedFull() {
    execFileSync('npx', ['ts-node', seedEntry], {
      cwd: apiRoot,
      env: { ...process.env, SEED_PROFILE: 'full' },
      stdio: 'pipe',
    });
  }

  async function counts() {
    return {
      okr: await prisma.oKR.count(),
      keyResult: await prisma.keyResult.count(),
      kpi: await prisma.kPI.count(),
      kpiActual: await prisma.kpiActual.count(),
      risk: await prisma.risk.count(),
      gate: await prisma.gate.count(),
      gateDecision: await prisma.gateDecision.count(),
      auditLog: await prisma.auditLog.count(),
      notification: await prisma.notification.count(),
    };
  }

  let first: Record<string, number>;

  beforeAll(async () => {
    await prisma.$connect();
    runSeedFull();
    tenantId = (await prisma.tenant.findFirstOrThrow({ where: { slug: 'indotek' } })).id;
    projectId = (await prisma.project.findFirstOrThrow({ where: { name: 'HWMS Internal Rollout' } })).id;
    first = await counts();
  }, 240000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeded OKR/KPI/Risk with the expected shape', async () => {
    expect(first.okr).toBe(3);
    expect(first.kpi).toBe(6);
    expect(first.risk).toBe(5);
    const high = await prisma.risk.count({ where: { project_id: projectId, probability: 'HIGH', impact: 'HIGH' } });
    const med = await prisma.risk.count({ where: { project_id: projectId, probability: 'MEDIUM', impact: 'MEDIUM' } });
    const low = await prisma.risk.count({ where: { project_id: projectId, probability: 'LOW', impact: 'LOW' } });
    expect([high, med, low]).toEqual([2, 2, 1]);
  });

  it('one gate is PASSED (has a decision), one is UPCOMING (no decision)', async () => {
    const gates = await prisma.gate.findMany({ where: { project_id: projectId }, include: { decisions: true } });
    expect(gates.length).toBe(2);
    const withDecision = gates.filter((g) => g.decisions.length > 0);
    const withoutDecision = gates.filter((g) => g.decisions.length === 0);
    expect(withDecision.length).toBe(1);
    expect(withoutDecision.length).toBe(1);
    expect(withDecision[0].decisions[0].decision).toBe('GO');
    expect(withDecision[0].decisions[0].decided_by).toBeDefined();
  });

  it('VIEW_SELFIE audit records carry a reason of ≥10 characters', async () => {
    const views = await prisma.auditLog.findMany({
      where: { tenant_id: tenantId, action: 'VIEW_SELFIE' },
    });
    expect(views.length).toBeGreaterThanOrEqual(3);
    for (const v of views) {
      const reason = (v.after_json as any)?.reason ?? '';
      expect(reason.length, `reason: "${reason}"`).toBeGreaterThanOrEqual(10);
    }
  });

  it('seeded 5 mixed notifications per user and left push_subscriptions empty', async () => {
    const users = await prisma.user.count({ where: { tenant_id: tenantId } });
    expect(first.notification).toBe(users * 5);
    const kinds = await prisma.notification.groupBy({ by: ['kind'], where: { tenant_id: tenantId } });
    expect(kinds.length).toBeGreaterThanOrEqual(4); // mixed kinds
    expect(await prisma.pushSubscription.count({ where: { tenant_id: tenantId } })).toBe(0);
  });

  it('is idempotent: a second full run yields identical counts', async () => {
    runSeedFull();
    const second = await counts();
    expect(second).toEqual(first);
  }, 180000);
});
