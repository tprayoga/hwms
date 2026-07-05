import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { DEFAULT_TENANT_POLICY } from '../../src/attendance/policy.constants';

/**
 * Phase S4 gate — F2 data (policies / scorecards / review notes / escalation).
 */
describe('Seed full profile: F2 data modules', () => {
  const prisma = new PrismaClient();
  const seedEntry = path.join(__dirname, 'index.ts');
  const apiRoot = path.join(__dirname, '..', '..');
  let tenantId: string;

  function runSeedFull() {
    execFileSync('npx', ['ts-node', seedEntry], {
      cwd: apiRoot,
      env: { ...process.env, SEED_PROFILE: 'full' },
      stdio: 'pipe',
    });
  }

  async function f2Counts() {
    return {
      policy: await prisma.policy.count(),
      scorecard: await prisma.scorecard.count(),
      reviewNote: await prisma.reviewNote.count(),
    };
  }

  let firstCounts: Record<string, number>;

  beforeAll(async () => {
    await prisma.$connect();
    runSeedFull();
    tenantId = (await prisma.tenant.findFirstOrThrow({ where: { slug: 'indotek' } })).id;
    firstCounts = await f2Counts();
  }, 240000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('tenant default Policy exactly mirrors the production constant', async () => {
    const p = await prisma.policy.findFirstOrThrow({
      where: { tenant_id: tenantId, scope_type: 'TENANT', scope_id: tenantId },
    });
    expect(p.checkin_window_start).toBe(DEFAULT_TENANT_POLICY.checkin_window_start);
    expect(p.checkin_window_end).toBe(DEFAULT_TENANT_POLICY.checkin_window_end);
    expect(p.auto_checkout_at).toBe(DEFAULT_TENANT_POLICY.auto_checkout_at);
    expect(p.default_checkin_mode).toBe(DEFAULT_TENANT_POLICY.default_checkin_mode);
    expect(p.wfh_days_per_week).toBe(DEFAULT_TENANT_POLICY.wfh_days_per_week);
    expect(p.mandatory_wfo_weekdays).toEqual([...DEFAULT_TENANT_POLICY.mandatory_wfo_weekdays]);
  });

  it('seeded a per-department (NOC) override policy', async () => {
    const noc = await prisma.department.findFirstOrThrow({ where: { tenant_id: tenantId, name: 'NOC' } });
    const p = await prisma.policy.findFirstOrThrow({
      where: { tenant_id: tenantId, scope_type: 'DEPARTMENT', scope_id: noc.id },
    });
    expect(p.checkin_window_start).toBe('06:00');
    expect(p.checkin_window_end).toBe('22:00');
    expect(p.mandatory_wfo_weekdays).toEqual([]);
  });

  it('scorecard: most-LATE user scores below a no-LATE user (discipline sanity)', async () => {
    const users = await prisma.user.findMany({
      where: { tenant_id: tenantId, employment_status: 'AKTIF' },
      select: { id: true },
    });
    const lateGroups = await prisma.checkin.groupBy({
      by: ['user_id'],
      where: { tenant_id: tenantId, type: 'IN', is_late: true },
      _count: { _all: true },
    });
    const lateByUser = new Map<string, number>();
    for (const u of users) lateByUser.set(u.id, 0);
    for (const g of lateGroups) lateByUser.set(g.user_id, g._count._all);

    const sorted = [...lateByUser.entries()].sort((a, b) => b[1] - a[1]);
    const [maxUser, maxLate] = sorted[0];
    const zeroEntry = sorted.reverse().find(([, n]) => n === 0);
    expect(maxLate, 'a user should have LATE flags').toBeGreaterThan(0);
    expect(zeroEntry, 'a user with zero LATE flags should exist').toBeDefined();
    const zeroUser = zeroEntry![0];

    const avgDiscipline = async (userId: string) => {
      const cards = await prisma.scorecard.findMany({ where: { user_id: userId }, select: { checkin_discipline: true } });
      const vals = cards.map((c) => Number(c.checkin_discipline));
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    const maxAvg = await avgDiscipline(maxUser);
    const zeroAvg = await avgDiscipline(zeroUser);
    expect(zeroAvg).toBe(100); // no lateness penalty
    expect(maxAvg, `most-late ${maxAvg} vs no-late ${zeroAvg}`).toBeLessThan(zeroAvg);
  });

  it('made one PENDING leave a ready escalation candidate (>48 working hours old)', async () => {
    const anchorish = new Date();
    const twoDaysAgo = new Date(anchorish.getTime() - 2 * 24 * 3600 * 1000);
    const old = await prisma.leaveRequest.count({
      where: { tenant_id: tenantId, status: 'PENDING', created_at: { lt: twoDaysAgo } },
    });
    expect(old).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent: a second full run yields identical F2 counts', async () => {
    runSeedFull();
    const second = await f2Counts();
    expect(second).toEqual(firstCounts);
  }, 180000);
});
