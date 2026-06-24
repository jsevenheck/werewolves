/**
 * Unit tests for admin token verification.
 *
 * These tests do NOT touch any manager or socket layer — they only exercise
 * the pure functions exported from `server/src/utils/adminAuth.ts`. The env
 * var is set per-test via mutation.
 */
import {
  verifyAdminToken,
  attachAdminToSocket,
  isAdminSocket,
  _resetAdminAuthWarningForTests,
} from '../server/src/utils/adminAuth';

describe('verifyAdminToken', () => {
  const ORIGINAL_ENV = process.env.WEREWOLVES_ADMIN_TOKEN;
  const TEST_TOKEN = 'super-secret-token-123';

  beforeEach(() => {
    process.env.WEREWOLVES_ADMIN_TOKEN = TEST_TOKEN;
    _resetAdminAuthWarningForTests();
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.WEREWOLVES_ADMIN_TOKEN;
    } else {
      process.env.WEREWOLVES_ADMIN_TOKEN = ORIGINAL_ENV;
    }
  });

  test('returns true for an exact-match token', () => {
    expect(verifyAdminToken(TEST_TOKEN)).toBe(true);
  });

  test('returns false for a wrong-but-same-length token', () => {
    const wrong = 'X'.repeat(TEST_TOKEN.length);
    expect(verifyAdminToken(wrong)).toBe(false);
  });

  test('returns false for a wrong-length token', () => {
    expect(verifyAdminToken('short')).toBe(false);
  });

  test('returns false for an empty string', () => {
    expect(verifyAdminToken('')).toBe(false);
  });

  test('returns false for undefined input', () => {
    expect(verifyAdminToken(undefined)).toBe(false);
  });

  test('returns false when env var is not configured', () => {
    delete process.env.WEREWOLVES_ADMIN_TOKEN;
    expect(verifyAdminToken(TEST_TOKEN)).toBe(false);
    expect(verifyAdminToken('anything')).toBe(false);
  });
});

describe('attachAdminToSocket / isAdminSocket', () => {
  function makeSocket() {
    return { data: {} as { adminToken?: boolean } };
  }

  test('attachAdminToSocket sets the flag and isAdminSocket returns true', () => {
    const socket = makeSocket();
    expect(isAdminSocket(socket)).toBe(false);
    attachAdminToSocket(socket);
    expect(isAdminSocket(socket)).toBe(true);
  });

  test('isAdminSocket returns false for a regular socket', () => {
    const socket = makeSocket();
    expect(isAdminSocket(socket)).toBe(false);
  });

  test('isAdminSocket returns false when flag is something else', () => {
    const socket = makeSocket();
    socket.data.adminToken = false;
    expect(isAdminSocket(socket)).toBe(false);
  });
});
