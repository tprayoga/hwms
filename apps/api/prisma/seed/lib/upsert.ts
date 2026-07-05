/**
 * Idempotency helpers for seeding (GAP rule §3).
 *
 * Feature modules MUST key writes on a natural key (email, code, slug, composite
 * unique) — never an auto id — so that running the seed twice yields identical
 * state. Two primitives:
 *   - upsertBy:     when the delegate has a unique index usable in `where`.
 *   - findOrCreate: when there is no single-column unique to upsert against.
 *
 * Plus a compact per-module logger so orchestrator output stays readable.
 */

/** Minimal shape of a Prisma model delegate we rely on. */
interface UpsertDelegate<T> {
  upsert(args: { where: any; create: any; update: any }): Promise<T>;
}
interface FindCreateDelegate<T> {
  findFirst(args: { where: any }): Promise<T | null>;
  create(args: { data: any }): Promise<T>;
}

/**
 * Upsert against a unique `where`. `update` defaults to `{}` (no-op on re-run),
 * which keeps existing rows untouched — the safe default for reference data.
 */
export function upsertBy<T>(
  delegate: UpsertDelegate<T>,
  where: any,
  create: any,
  update: any = {},
): Promise<T> {
  return delegate.upsert({ where, create, update });
}

/** Find by natural-key `where` or create it. For models without a single unique. */
export async function findOrCreate<T>(
  delegate: FindCreateDelegate<T>,
  where: any,
  create: any,
): Promise<T> {
  const existing = await delegate.findFirst({ where });
  if (existing) return existing;
  return delegate.create({ data: create });
}

export interface ModuleLogger {
  /** Progress line within a module. */
  step(msg: string): void;
  /** Bump a named counter (e.g. per created/upserted entity). */
  count(key: string, by?: number): void;
  /** Emit the module summary line with accumulated counts. */
  finish(): void;
}

export function createLogger(moduleName: string): ModuleLogger {
  const counts: Record<string, number> = {};
  const t0 = Date.now();
  return {
    step: (msg) => console.log(`  [${moduleName}] ${msg}`),
    count: (key, by = 1) => {
      counts[key] = (counts[key] ?? 0) + by;
    },
    finish: () => {
      const parts = Object.entries(counts).map(([k, v]) => `${k}=${v}`);
      const summary = parts.length ? parts.join(' ') : 'no counters';
      console.log(`✓ [${moduleName}] ${summary} (${Date.now() - t0}ms)`);
    },
  };
}
