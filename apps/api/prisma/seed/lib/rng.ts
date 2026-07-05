/**
 * Seeded PRNG for deterministic seeding (GAP rule §2).
 *
 * NEVER use Math.random() or Date.now() as a source of variation anywhere in the
 * seed. All "randomness" flows from a single constant seed through mulberry32 so
 * that two runs produce byte-identical data. Feature modules should draw from the
 * shared Rng instance passed via SeedContext.
 */

/** mulberry32: tiny, fast, deterministic 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Default constant seed ("HWMS" as hex). Override via env SEED_RNG_SEED. */
export const DEFAULT_SEED = 0x48574d53;

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform pick from a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** True with probability p (0..1). */
  chance(p: number): boolean;
}

/** Resolve the seed once: env override (SEED_RNG_SEED) or the constant default. */
export function resolveSeed(): number {
  const raw = process.env.SEED_RNG_SEED;
  if (raw === undefined || raw.trim() === '') return DEFAULT_SEED;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid SEED_RNG_SEED: ${raw} (must be a number)`);
  }
  return n >>> 0;
}

export function createRng(seed: number = resolveSeed()): Rng {
  const rand = mulberry32(seed);
  return {
    next: rand,
    int: (min, max) => min + Math.floor(rand() * (max - min + 1)),
    pick: (arr) => {
      if (arr.length === 0) throw new Error('Rng.pick called on empty array');
      return arr[Math.floor(rand() * arr.length)];
    },
    chance: (p) => rand() < p,
  };
}
