import { defineConfig } from 'vitest/config';

// Many specs are INTEGRATION tests that share a single Postgres/Redis instance
// (reconciliation, tenant isolation, attendance transactions, dashboard). They
// mutate and clean up global rows, so running test files in parallel lets one
// file's cleanup race another's assertions. Vitest 3 parallelizes files by
// default — pin to sequential, single-fork execution (mirrors the Playwright
// `workers: 1` choice) so the shared DB stays consistent.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
