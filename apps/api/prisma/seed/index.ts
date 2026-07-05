import { PrismaClient } from '@prisma/client';
import { createRng, resolveSeed } from './lib/rng';
import { ANCHOR_DATE } from './lib/dates';
import type { SeedContext, SeedModule, SeedProfile } from './lib/context';
import { seedCore } from './modules/00-core';
import { seedHolidays } from './modules/10-holidays';
import { seedAttendance } from './modules/11-attendance';
import { seedLeave } from './modules/12-leave';
import { seedDemoProject } from './modules/20-demo-project';
import { seedPolicies } from './modules/30-policies';
import { seedScorecards } from './modules/31-scorecards';
import { seedReviewNotes } from './modules/32-review-notes';
import { seedEscalation } from './modules/33-escalation';
import { seedGovernance } from './modules/40-governance';
import { seedAuditNotifications } from './modules/41-audit-notifications';

/**
 * Seed orchestrator.
 *
 * Selection precedence:
 *   1. SEED_MODULES env or CLI positional args (comma/space list of module
 *      names) → run exactly those, in registry order. Used by `seed:module`.
 *   2. Otherwise SEED_PROFILE (default 'core') → run every module whose
 *      `profiles` includes it.
 *
 * Profiles:
 *   - core: only 00-core (the reconciliation-gated dataset; CI uses this).
 *   - full: core + all feature modules (added in later phases).
 */

const prisma = new PrismaClient();

// Module registry. Order here IS the execution order. Feature modules
// (profiles: ['full']) are appended in subsequent phases.
const MODULES: SeedModule[] = [
  { name: 'core', profiles: ['core', 'full'], run: seedCore },
  { name: 'holidays', profiles: ['full'], run: seedHolidays },
  { name: 'attendance', profiles: ['full'], run: seedAttendance },
  { name: 'leave', profiles: ['full'], run: seedLeave },
  { name: 'demo', profiles: ['full'], run: seedDemoProject },
  { name: 'policies', profiles: ['full'], run: seedPolicies },
  { name: 'scorecards', profiles: ['full'], run: seedScorecards },
  { name: 'review-notes', profiles: ['full'], run: seedReviewNotes },
  { name: 'escalation', profiles: ['full'], run: seedEscalation },
  { name: 'governance', profiles: ['full'], run: seedGovernance },
  { name: 'audit', profiles: ['full'], run: seedAuditNotifications },
];

function parseModuleList(): string[] {
  const fromEnv = process.env.SEED_MODULES ?? '';
  const fromArgv = process.argv.slice(2).join(',');
  const raw = [fromEnv, fromArgv].filter((s) => s.trim() !== '').join(',');
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    // Drop empties and the `--` arg separator that pnpm forwards literally.
    .filter((s) => s !== '' && s !== '--');
}

function resolveProfile(): SeedProfile {
  const raw = (process.env.SEED_PROFILE ?? 'core').trim().toLowerCase();
  if (raw !== 'core' && raw !== 'full') {
    throw new Error(`Invalid SEED_PROFILE: ${raw} (expected 'core' or 'full')`);
  }
  return raw;
}

function selectModules(): { modules: SeedModule[]; mode: string } {
  const explicit = parseModuleList();
  if (explicit.length > 0) {
    const unknown = explicit.filter((n) => !MODULES.some((m) => m.name === n));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown seed module(s): ${unknown.join(', ')}. ` +
          `Available: ${MODULES.map((m) => m.name).join(', ')}`,
      );
    }
    // Preserve registry order, restricted to the requested set.
    const modules = MODULES.filter((m) => explicit.includes(m.name));
    return { modules, mode: `modules=[${explicit.join(',')}]` };
  }

  const profile = resolveProfile();
  const modules = MODULES.filter((m) => m.profiles.includes(profile));
  return { modules, mode: `profile=${profile}` };
}

/**
 * 00-core's cleanup only wipes the legacy table set. Feature modules write to
 * tables core does NOT clear (wfh_quotas now; policies/scorecards/kpis later),
 * and those rows hold FKs onto core rows (user, department, tenant). On a repeat
 * `full` run, core's user/department/tenant deletes would then hit FK errors.
 * So when a run includes core, clear feature-owned tables FIRST (children before
 * parents). This keeps 00-core byte-for-byte untouched.
 */
async function preCleanFeatureTables() {
  // Children first: these hold FKs onto core rows (user / department / tenant /
  // project / functional_role) that 00-core's cleanup deletes.
  await prisma.keyResult.deleteMany({});
  await prisma.oKR.deleteMany({});
  await prisma.kpiActual.deleteMany({});
  await prisma.kPI.deleteMany({});
  await prisma.gateDecision.deleteMany({});
  await prisma.gate.deleteMany({});
  await prisma.risk.deleteMany({});
  await prisma.scorecard.deleteMany({});
  await prisma.reviewNote.deleteMany({});
  await prisma.policy.deleteMany({});
  await prisma.wfhQuota.deleteMany({});
}

async function main() {
  const { modules, mode } = selectModules();
  const seed = resolveSeed();
  const ctx: SeedContext = {
    rng: createRng(seed),
    anchor: ANCHOR_DATE,
    refs: {},
  };

  console.log(
    `HWMS seed — ${mode} | anchor=${ANCHOR_DATE.toISOString().slice(0, 10)} | ` +
      `seed=0x${(seed >>> 0).toString(16)} | modules: ${modules.map((m) => m.name).join(', ') || '(none)'}`,
  );

  if (modules.length === 0) {
    console.warn('No modules matched the selection — nothing to seed.');
    return;
  }

  if (modules.some((m) => m.name === 'core')) {
    await preCleanFeatureTables();
  }

  for (const mod of modules) {
    console.log(`\n=== module: ${mod.name} ===`);
    await mod.run(prisma, ctx);
  }

  console.log('\nSeed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
