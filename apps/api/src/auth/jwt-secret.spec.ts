import { describe, it, expect, afterEach } from 'vitest';
import { getAccessSecret, getRefreshSecret } from './jwt-secret';

/**
 * Phase 8 (GAP §4.1.3): the weak in-code JWT fallbacks are gone. These helpers
 * must throw when the secret is unset or too short, so an instance can never
 * boot on a guessable key.
 */
describe('JWT secret resolution (no fallback)', () => {
  const savedAccess = process.env.JWT_ACCESS_SECRET;
  const savedRefresh = process.env.JWT_REFRESH_SECRET;

  afterEach(() => {
    // Restore the test-suite defaults (setup-env.ts) so other specs are unaffected.
    process.env.JWT_ACCESS_SECRET = savedAccess;
    process.env.JWT_REFRESH_SECRET = savedRefresh;
  });

  it('returns the configured access secret', () => {
    process.env.JWT_ACCESS_SECRET = 'a-sufficiently-long-secret-value';
    expect(getAccessSecret()).toBe('a-sufficiently-long-secret-value');
  });

  it('returns the configured refresh secret', () => {
    process.env.JWT_REFRESH_SECRET = 'another-sufficiently-long-secret';
    expect(getRefreshSecret()).toBe('another-sufficiently-long-secret');
  });

  it('throws when the access secret is unset', () => {
    delete process.env.JWT_ACCESS_SECRET;
    expect(() => getAccessSecret()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when the refresh secret is unset', () => {
    delete process.env.JWT_REFRESH_SECRET;
    expect(() => getRefreshSecret()).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('throws when the secret is too short (weak)', () => {
    process.env.JWT_ACCESS_SECRET = 'short';
    expect(() => getAccessSecret()).toThrow(/insecure/i);
  });
});
