"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessSecret = getAccessSecret;
exports.getRefreshSecret = getRefreshSecret;
const MIN_SECRET_LENGTH = 16;
function requireSecret(envKey) {
    const value = process.env[envKey];
    if (!value || value.trim().length < MIN_SECRET_LENGTH) {
        throw new Error(`${envKey} is not set (or shorter than ${MIN_SECRET_LENGTH} chars). ` +
            `Refusing to start with an insecure JWT secret — set ${envKey} in the environment.`);
    }
    return value;
}
function getAccessSecret() {
    return requireSecret('JWT_ACCESS_SECRET');
}
function getRefreshSecret() {
    return requireSecret('JWT_REFRESH_SECRET');
}
//# sourceMappingURL=jwt-secret.js.map