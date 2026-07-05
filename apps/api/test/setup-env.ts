/**
 * Global test env bootstrap. Phase 8 removed the hard-coded JWT fallback
 * secrets, so any module that resolves a secret now requires the env to be set.
 * The Prisma client also loads the repo `.env` at import, but this guarantees
 * the JWT secrets exist regardless of load order or CI shell state. `||=` never
 * clobbers a value already provided by the environment.
 */
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-min-16-chars-long';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-min-16-chars-long';
