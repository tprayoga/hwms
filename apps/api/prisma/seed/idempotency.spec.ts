import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

/**
 * Idempotency gate (GAP rule §3). Running the core seed profile twice in a row
 * must leave the database in an identical shape — same row count for every
 * business table. The core module uses a full clean+recreate, so counts are
 * deterministic across runs even though row ids differ.
 */
describe('Seed core profile is idempotent by table count', () => {
  const prisma = new PrismaClient();

  // Business tables managed by the core seed cleanup sequence.
  const MODELS = [
    'tenant', 'department', 'functionalRole', 'user', 'holiday', 'project',
    'sprint', 'location', 'task', 'taskAssignment', 'standupItem', 'blocker',
    'taskDependency', 'taskEvidence', 'teamMember', 'team', 'leaveRequest',
    'checkin', 'notification', 'pushSubscription', 'auditLog',
  ] as const;

  const seedEntry = path.join(__dirname, 'index.ts');

  async function snapshot(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const model of MODELS) {
      counts[model] = await (prisma as any)[model].count();
    }
    return counts;
  }

  function runSeedCore() {
    execFileSync('npx', ['ts-node', seedEntry], {
      cwd: path.join(__dirname, '..', '..'), // apps/api
      env: { ...process.env, SEED_PROFILE: 'core' },
      stdio: 'pipe',
    });
  }

  let first: Record<string, number>;
  let second: Record<string, number>;

  beforeAll(async () => {
    await prisma.$connect();
    runSeedCore();
    first = await snapshot();
    runSeedCore();
    second = await snapshot();
  }, 180000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces a non-empty, well-known first snapshot', () => {
    expect(first.task).toBe(456);
    expect(first.user).toBe(24);
    expect(first.sprint).toBe(12);
    expect(first.tenant).toBe(1);
  });

  it('produces identical table counts on the second run', () => {
    expect(second).toEqual(first);
  });
});
