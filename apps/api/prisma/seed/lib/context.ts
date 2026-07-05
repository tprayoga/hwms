import type { PrismaClient } from '@prisma/client';
import type { Rng } from './rng';

/**
 * Shared context threaded through every seed module. Modules read deterministic
 * primitives (rng, anchor) from here and stash entity references in `refs` so
 * later modules can build on earlier ones without re-querying.
 */
export interface SeedContext {
  rng: Rng;
  anchor: Date;
  /** Cross-module entity references, e.g. refs.tenant, refs.users, refs.project. */
  refs: Record<string, any>;
}

export type SeedProfile = 'core' | 'full';

export interface SeedModule {
  /** Natural key used by SEED_MODULES and `seed:module` selection. */
  name: string;
  /** Profiles this module participates in. */
  profiles: SeedProfile[];
  run: (prisma: PrismaClient, ctx: SeedContext) => Promise<void>;
}
