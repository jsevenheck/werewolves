import type { RoomView } from '../core/src/types';

// Mock the window.alert for notify function
const alertMock = vi.fn();
Object.defineProperty(global, 'window', {
  value: { alert: alertMock },
  writable: true,
});

// Import after mocking
import {
  escapeHtml,
  getPlayerName,
  formatPhase,
  capitalize,
  notify,
} from '../ui-vue/src/utils/helpers';

describe('escapeHtml', () => {
  test('escapes < and > characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes & character', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  test('escapes quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("'hello'")).toBe('&#39;hello&#39;');
  });

  test('handles XSS attack vectors', () => {
    const xss = '<img src=x onerror=alert(1)>';
    expect(escapeHtml(xss)).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml(xss)).not.toContain('<img');
  });

  test('escapes script tags', () => {
    const script = '<script>alert("x")</script>';
    expect(escapeHtml(script)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(escapeHtml(script)).not.toContain('<script>');
  });
});

describe('getPlayerName', () => {
  const baseRoom = (): RoomView => ({
    code: 'ABCD',
    phase: 'lobby',
    phaseStep: null,
    dayCount: 0,
    players: [
      { id: 'p1', name: 'Alice', alive: true, connected: true, isHost: false, role: null },
      {
        id: 'p2',
        name: '<script>Bob</script>',
        alive: true,
        connected: true,
        isHost: false,
        role: null,
      },
    ],
    hostId: 'p1',
    minPlayers: 5,
    roleConfig: {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0,
      harlot: 0,
    },
    passiveRoleConfig: { mayor: true },
    mayorId: null,
    awaitingMayorSelection: false,
    mayorSelectionPending: false,
    loversKnown: false,
    loversAssigned: false,
    loverName: null,
    witchState: { healAvailable: null, poisonAvailable: null },
    wolfVotes: null,
    wolfVoteState: null,
    wolfTarget: null,
    wolfPeers: [],
    wolfIds: [],
    guardedTarget: null,
    lastGuardedTarget: null,
    harlotVisitedTarget: null,
    nextNightStep: null,
    phaseTransition: null,
    seerResult: null,
    voteState: { yourVote: undefined, submitted: 0, required: 0, revoteFromTie: null },
    lastNightDeaths: [],
    lastDayDeaths: [],
    lastDayMessage: null,
    awaitingHunterShot: false,
    hunterShotPending: false,
    hunterShotEndsAt: null,
    dayVoteResolved: false,
    winner: null,
    logs: [],
    self: null,
  });

  test('returns escaped player name', () => {
    const room = baseRoom();
    expect(getPlayerName(room, 'p1', 'Unknown')).toBe('Alice');
  });

  test('returns raw player name (Vue handles escaping)', () => {
    const room = baseRoom();
    expect(getPlayerName(room, 'p2', 'Unknown')).toBe('<script>Bob</script>');
  });

  test('returns Unknown for non-existent player', () => {
    const room = baseRoom();
    expect(getPlayerName(room, 'nonexistent', 'Unknown')).toBe('Unknown');
  });
});

describe('formatPhase', () => {
  const baseRoom = (): RoomView => ({
    code: 'ABCD',
    phase: 'lobby',
    phaseStep: null,
    dayCount: 0,
    players: [],
    hostId: null,
    minPlayers: 5,
    roleConfig: {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0,
      harlot: 0,
    },
    passiveRoleConfig: { mayor: true },
    mayorId: null,
    awaitingMayorSelection: false,
    mayorSelectionPending: false,
    loversKnown: false,
    loversAssigned: false,
    loverName: null,
    witchState: { healAvailable: null, poisonAvailable: null },
    wolfVotes: null,
    wolfVoteState: null,
    wolfTarget: null,
    wolfPeers: [],
    wolfIds: [],
    guardedTarget: null,
    lastGuardedTarget: null,
    harlotVisitedTarget: null,
    nextNightStep: null,
    phaseTransition: null,
    seerResult: null,
    voteState: { yourVote: undefined, submitted: 0, required: 0, revoteFromTie: null },
    lastNightDeaths: [],
    lastDayDeaths: [],
    lastDayMessage: null,
    awaitingHunterShot: false,
    hunterShotPending: false,
    hunterShotEndsAt: null,
    dayVoteResolved: false,
    winner: null,
    logs: [],
    self: null,
  });

  test('returns Ended when winner exists', () => {
    const room: RoomView = {
      ...baseRoom(),
      winner: { team: 'village', reason: 'All wolves eliminated' },
    };
    expect(formatPhase(room)).toBe('Ended');
  });

  test('capitalizes simple phase names', () => {
    expect(formatPhase({ ...baseRoom(), phase: 'lobby' })).toBe('Lobby');
    expect(formatPhase({ ...baseRoom(), phase: 'day' })).toBe('Day');
    expect(formatPhase({ ...baseRoom(), phase: 'night' })).toBe('Night');
  });

  test('shows night phase step when present', () => {
    const room = { ...baseRoom(), phase: 'night' as const, phaseStep: 'wolves' as const };
    expect(formatPhase(room)).toBe('Night (Wolves)');
  });
});

describe('capitalize', () => {
  test('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  test('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });

  test('handles undefined', () => {
    expect(capitalize(undefined)).toBe('');
  });
});

describe('notify', () => {
  beforeEach(() => {
    alertMock.mockClear();
  });

  test('calls window.alert with message', () => {
    notify('Test message');
    expect(alertMock).toHaveBeenCalledWith('Test message');
  });

  test('does not call alert for empty string', () => {
    notify('');
    expect(alertMock).not.toHaveBeenCalled();
  });
});
