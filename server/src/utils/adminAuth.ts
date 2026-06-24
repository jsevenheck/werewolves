/**
 * Admin authentication helpers.
 *
 * The server-side admin tooling is gated by a single shared secret read from
 * `process.env.WEREWOLVES_ADMIN_TOKEN`. Clients present the token in the
 * Socket.IO handshake as `socket.handshake.auth.adminToken`. The middleware
 * in `index.ts` validates the token with a constant-time comparison and, on
 * success, stamps `socket.data.adminToken = true`.
 *
 * SECURITY NOTES
 *  - The env var is OPTIONAL. If it is not set, admin endpoints are disabled
 *    and a single startup warning is logged. We never log the token itself.
 *  - We use `crypto.timingSafeEqual` to prevent trivial timing attacks.
 *  - We only stamp the socket when the token MATCHES. An absent or wrong
 *    token leaves the socket as a regular (non-admin) client.
 */
import crypto from 'crypto';

const ENV_VAR = 'WEREWOLVES_ADMIN_TOKEN';

let warnedMissing = false;

/**
 * Read the admin token from the environment.
 *
 * Returns `null` when the env var is missing or empty. The result is cached
 * implicitly: callers (middleware) only invoke this once per process.
 */
function getAdminTokenFromEnv(): string | null {
  const value = process.env[ENV_VAR];
  if (!value || value.length === 0) return null;
  return value;
}

/**
 * Emit a one-shot warning when the server starts without an admin token.
 * Suppressed in test environments where the absence is intentional.
 */
function warnIfMissingOnce(): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn('[werewolves] WEREWOLVES_ADMIN_TOKEN is not set; admin endpoints are disabled');
}

/**
 * Reset the "warned once" flag. Only intended for tests.
 */
function _resetAdminAuthWarningForTests(): void {
  warnedMissing = false;
}

/**
 * Verify a provided admin token against the configured env token.
 *
 * Uses `crypto.timingSafeEqual` to prevent timing attacks. Both buffers are
 * compared at the same length — if the configured token is missing, or the
 * provided token is undefined or a different length, the function returns
 * false WITHOUT calling `timingSafeEqual` (so we never dereference a
 * mismatched buffer).
 *
 * Always returns `false` when the server has no admin token configured; the
 * warning is emitted the first time this branch is hit on a non-test process.
 */
function verifyAdminToken(provided: string | undefined): boolean {
  const expected = getAdminTokenFromEnv();
  if (!expected) {
    if (process.env.NODE_ENV !== 'test') {
      warnIfMissingOnce();
    }
    return false;
  }
  if (typeof provided !== 'string' || provided.length === 0) return false;
  // Both strings must have identical length for `timingSafeEqual`.
  // We compare against the configured token's length on purpose: a wrong-
  // length input is rejected up-front (this is a property of timingSafeEqual
  // anyway — it throws on length mismatch).
  if (provided.length !== expected.length) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return crypto.timingSafeEqual(a, b);
}

/**
 * Mark a socket as an admin socket. Called from the namespace middleware
 * after a successful token check.
 */
function attachAdminToSocket(socket: { data: { adminToken?: boolean } }): void {
  socket.data.adminToken = true;
}

/**
 * Type-guard / predicate for "this socket has admin privileges".
 */
function isAdminSocket(socket: { data: { adminToken?: boolean } }): boolean {
  return socket.data.adminToken === true;
}

export {
  getAdminTokenFromEnv,
  verifyAdminToken,
  attachAdminToSocket,
  isAdminSocket,
  _resetAdminAuthWarningForTests,
};
