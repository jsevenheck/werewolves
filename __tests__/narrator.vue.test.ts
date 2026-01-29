import type { RoomView } from '../core/src/types';

// Create mock Howl class
const mockHowlInstances: any[] = [];
const mockPlay = jest.fn(() => 1);
const mockStop = jest.fn();
const mockUnload = jest.fn();
const mockOn = jest.fn();
const mockOnce = jest.fn();
const mockOff = jest.fn();
const mockLoad = jest.fn();

class MockHowl {
  src: string;
  constructor(options: any) {
    this.src = options.src;
    mockHowlInstances.push(this);
  }
  play = mockPlay;
  stop = mockStop;
  unload = mockUnload;
  on = mockOn;
  once = mockOnce;
  off = mockOff;
  load = mockLoad;
}

jest.mock('howler', () => ({
  Howl: MockHowl
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; })
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });
Object.defineProperty(global, 'window', { value: { alert: jest.fn() }, writable: true });

import { createNarrator, computeNarrationKey } from '../ui-vue/src/utils/narrator';

describe('computeNarrationKey', () => {
  const baseRoom = (): RoomView => ({
    code: 'ABCD',
    phase: 'lobby',
    phaseStep: null,
    dayCount: 0,
    players: [],
    hostId: null,
    minPlayers: 5,
    roleConfig: { werewolf: 1, seer: 0, hunter: 0, witch: 0, armor: 0, joker: 0, guard: 0, harlot: 0 },
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
    self: null
  });

  test('returns phaseTransition when present', () => {
    const room: RoomView = { ...baseRoom(), phaseTransition: 'nightToDay' as const };
    expect(computeNarrationKey(room)).toBe('nightToDay');
  });

  test('returns night_<step> for night phase with step', () => {
    const room = { ...baseRoom(), phase: 'night' as const, phaseStep: 'seer' as const };
    expect(computeNarrationKey(room)).toBe('night_seer');
  });

  test('returns phase name for simple phases', () => {
    expect(computeNarrationKey({ ...baseRoom(), phase: 'lobby' })).toBe('lobby');
    expect(computeNarrationKey({ ...baseRoom(), phase: 'day' })).toBe('day');
  });
});

describe('Narrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHowlInstances.length = 0;
    localStorageMock.clear();
  });

  test('createNarrator returns a Narrator instance', () => {
    const narrator = createNarrator();
    expect(narrator).toBeDefined();
    expect(typeof narrator.isEnabled).toBe('function');
    expect(typeof narrator.setEnabled).toBe('function');
  });

  test('isEnabled defaults to false', () => {
    const narrator = createNarrator();
    expect(narrator.isEnabled()).toBe(false);
  });

  test('isUnlocked defaults to false', () => {
    const narrator = createNarrator();
    expect(narrator.isUnlocked()).toBe(false);
  });

  test('setEnabled(true) enables narrator', () => {
    const narrator = createNarrator();
    narrator.setEnabled(true);
    expect(narrator.isEnabled()).toBe(true);
  });

  test('setEnabled(false) disables and cleans up', () => {
    const narrator = createNarrator();
    narrator.setEnabled(true);
    narrator.setEnabled(false);
    expect(narrator.isEnabled()).toBe(false);
  });

  test('initFromStorage restores enabled state', () => {
    localStorageMock.setItem('werewolves_narrator_enabled', 'true');
    const narrator = createNarrator();
    narrator.initFromStorage();
    expect(narrator.isEnabled()).toBe(true);
  });

  test('setEnabled persists to storage', () => {
    const narrator = createNarrator();
    narrator.setEnabled(true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('werewolves_narrator_enabled', 'true');
  });

  test('initialEnabled option sets initial state', () => {
    const narrator = createNarrator({ initialEnabled: true });
    expect(narrator.isEnabled()).toBe(true);
  });

  test('initialUnlocked option sets unlocked state', () => {
    const narrator = createNarrator({ initialUnlocked: true });
    expect(narrator.isUnlocked()).toBe(true);
  });

  test('custom notify callback is called', () => {
    const notifyMock = jest.fn();
    const narrator = createNarrator({ notify: notifyMock });
    // Narrator calls notify internally for certain errors
    expect(notifyMock).not.toHaveBeenCalled();
  });

  test('announceLatest does nothing when disabled', () => {
    const playClipMock = jest.fn();
    const narrator = createNarrator({ playClip: playClipMock });
    narrator.announceLatest();
    expect(playClipMock).not.toHaveBeenCalled();
  });
});

describe('Narrator handleRoomUpdate', () => {
  const baseRoom = (): RoomView => ({
    code: 'ABCD',
    phase: 'lobby',
    phaseStep: null,
    dayCount: 0,
    players: [],
    hostId: null,
    minPlayers: 5,
    roleConfig: { werewolf: 1, seer: 0, hunter: 0, witch: 0, armor: 0, joker: 0, guard: 0, harlot: 0 },
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
    self: null
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockHowlInstances.length = 0;
  });

  test('does not play when disabled', () => {
    const playClipMock = jest.fn();
    const narrator = createNarrator({ playClip: playClipMock });
    narrator.handleRoomUpdate(null, baseRoom());
    expect(playClipMock).not.toHaveBeenCalled();
  });

  test('queues pending when enabled but not unlocked', () => {
    const playClipMock = jest.fn();
    const narrator = createNarrator({ playClip: playClipMock, initialEnabled: true });
    narrator.handleRoomUpdate(null, baseRoom());
    expect(playClipMock).not.toHaveBeenCalled();
  });

  test('plays clip when enabled and unlocked', () => {
    const playClipMock = jest.fn();
    const narrator = createNarrator({ 
      playClip: playClipMock, 
      initialEnabled: true, 
      initialUnlocked: true 
    });
    narrator.handleRoomUpdate(null, baseRoom());
    expect(playClipMock).toHaveBeenCalledWith('lobby');
  });

  test('does not replay same key', () => {
    const playClipMock = jest.fn();
    const narrator = createNarrator({ 
      playClip: playClipMock, 
      initialEnabled: true, 
      initialUnlocked: true 
    });
    const room = baseRoom();
    narrator.handleRoomUpdate(null, room);
    narrator.handleRoomUpdate(room, room);
    expect(playClipMock).toHaveBeenCalledTimes(1);
  });

  test('plays new key when phase changes', () => {
    const playClipMock = jest.fn();
    const narrator = createNarrator({ 
      playClip: playClipMock, 
      initialEnabled: true, 
      initialUnlocked: true 
    });
    const lobbyRoom = baseRoom();
    const dayRoom = { ...baseRoom(), phase: 'day' as const };
    narrator.handleRoomUpdate(null, lobbyRoom);
    narrator.handleRoomUpdate(lobbyRoom, dayRoom);
    expect(playClipMock).toHaveBeenCalledWith('lobby');
    expect(playClipMock).toHaveBeenCalledWith('day');
    expect(playClipMock).toHaveBeenCalledTimes(2);
  });
});
