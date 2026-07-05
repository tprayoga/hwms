/**
 * JWT secret resolution (§9 — secrets via env, never hard-coded).
 *
 * Phase 8 (Pilot Gate) removed the weak in-code fallback secrets. Before real
 * employee data enters, the service MUST refuse to sign or verify tokens with a
 * default key. These helpers read the secret from the environment and throw a
 * clear boot-time error if it is missing, so an operator can never accidentally
 * ship an instance running on a guessable secret.
 */

const MIN_SECRET_LENGTH = 16;

function requireSecret(envKey: string): string {
  const value = process.env[envKey];
  if (!value || value.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${envKey} is not set (or shorter than ${MIN_SECRET_LENGTH} chars). ` +
        `Refusing to start with an insecure JWT secret — set ${envKey} in the environment.`,
    );
  }
  return value;
}

export function getAccessSecret(): string {
  return requireSecret('JWT_ACCESS_SECRET');
}

export function getRefreshSecret(): string {
  return requireSecret('JWT_REFRESH_SECRET');
}
