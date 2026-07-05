"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const jwt_secret_1 = require("./jwt-secret");
(0, vitest_1.describe)('JWT secret resolution (no fallback)', () => {
    const savedAccess = process.env.JWT_ACCESS_SECRET;
    const savedRefresh = process.env.JWT_REFRESH_SECRET;
    (0, vitest_1.afterEach)(() => {
        process.env.JWT_ACCESS_SECRET = savedAccess;
        process.env.JWT_REFRESH_SECRET = savedRefresh;
    });
    (0, vitest_1.it)('returns the configured access secret', () => {
        process.env.JWT_ACCESS_SECRET = 'a-sufficiently-long-secret-value';
        (0, vitest_1.expect)((0, jwt_secret_1.getAccessSecret)()).toBe('a-sufficiently-long-secret-value');
    });
    (0, vitest_1.it)('returns the configured refresh secret', () => {
        process.env.JWT_REFRESH_SECRET = 'another-sufficiently-long-secret';
        (0, vitest_1.expect)((0, jwt_secret_1.getRefreshSecret)()).toBe('another-sufficiently-long-secret');
    });
    (0, vitest_1.it)('throws when the access secret is unset', () => {
        delete process.env.JWT_ACCESS_SECRET;
        (0, vitest_1.expect)(() => (0, jwt_secret_1.getAccessSecret)()).toThrow(/JWT_ACCESS_SECRET/);
    });
    (0, vitest_1.it)('throws when the refresh secret is unset', () => {
        delete process.env.JWT_REFRESH_SECRET;
        (0, vitest_1.expect)(() => (0, jwt_secret_1.getRefreshSecret)()).toThrow(/JWT_REFRESH_SECRET/);
    });
    (0, vitest_1.it)('throws when the secret is too short (weak)', () => {
        process.env.JWT_ACCESS_SECRET = 'short';
        (0, vitest_1.expect)(() => (0, jwt_secret_1.getAccessSecret)()).toThrow(/insecure/i);
    });
});
//# sourceMappingURL=jwt-secret.spec.js.map