import { MockHowl } from './mocks/howler';

import { computeNarrationKey, createNarrator } from '../client/src/utils/narrator';
import type { RoomView } from '../src/shared/types';

type RoomOverrides = Partial<RoomView>;

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
    seer: 1,
    hunter: 0,
    witch: 0,
    armor: 0,
    joker: 0,
    guard: 0
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
  wolfTarget: null,
  wolfPeers: [],
  guardedTarget: null,
  lastGuardedTarget: null,
  nextNightStep: null,
  phaseTransition: null,
  seerResult: null,
  voteState: {
    revoteFromTie: null,
    submitted: 0,
    required: 0,
    yourVote: null
  },
  lastNightDeaths: [],
  lastDayDeaths: [],
  lastDayMessage: null,
  awaitingHunterShot: false,
  hunterShotPending: false,
  winner: null,
  logs: [],
  self: null
});

const buildRoom = (overrides: RoomOverrides = {}): RoomView => ({
  ...baseRoom(),
  ...overrides
});

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('computeNarrationKey', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('phaseTransition overrides phase and step', () => {
    const room = buildRoom({
      phase: 'night',
      phaseStep: 'wolves',
      phaseTransition: 'dayToNight'
    });
    expect(computeNarrationKey(room)).toBe('dayToNight');
  });

  test('night phase step yields night_<step>', () => {
    const room = buildRoom({ phase: 'night', phaseStep: 'seer' });
    expect(computeNarrationKey(room)).toBe('night_seer');
  });

  test('default phase yields phase name', () => {
    const room = buildRoom({ phase: 'armor', phaseStep: null });
    expect(computeNarrationKey(room)).toBe('armor');
  });
});

describe('narrator dedupe', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('does not re-announce the same key', () => {
    const playClip = jest.fn();
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playClip
    });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    narrator.handleRoomUpdate(room, room);

    expect(playClip).toHaveBeenCalledTimes(1);
  });

  test('announces when the key changes', () => {
    const playClip = jest.fn();
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playClip
    });
    const roomDay = buildRoom({ phase: 'day' });
    const roomNight = buildRoom({ phase: 'night', phaseStep: 'wolves' });

    narrator.handleRoomUpdate(null, roomDay);
    narrator.handleRoomUpdate(roomDay, roomNight);

    expect(playClip).toHaveBeenCalledTimes(2);
    expect(playClip).toHaveBeenLastCalledWith('night_wolves');
  });
});

describe('narrator playback', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('does not play if disabled while clip is loading', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: true, storage: null });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    const [howl] = MockHowl.instances;

    narrator.setEnabled(false);
    howl.trigger('load');
    await flushPromises();

    expect(howl.play).not.toHaveBeenCalled();
  });

  test('falls back to silence audio on loaderror', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: true, storage: null });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    const initialHowl = MockHowl.instances[0];

    initialHowl.trigger('loaderror');
    const fallbackHowl = MockHowl.instances[1];
    fallbackHowl.trigger('load');
    await flushPromises();

    expect(initialHowl.unload).toHaveBeenCalled();
    expect(fallbackHowl.play).toHaveBeenCalled();
    expect(String(fallbackHowl.options.src)).toBe('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=');
  });

  test('resolves fallback playerror after loaderror', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: true, storage: null });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    const initialHowl = MockHowl.instances[0];

    initialHowl.trigger('loaderror');
    const fallbackHowl = MockHowl.instances[1];

    fallbackHowl.trigger('playerror');
    await flushPromises();

    expect(fallbackHowl.load).toHaveBeenCalled();
    expect(fallbackHowl.play).toHaveBeenCalled();
  });

  test('setEnabled(false) stops playback and unloads cached audio', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: true, storage: null });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    const [howl] = MockHowl.instances;

    howl.trigger('load');
    await flushPromises();
    narrator.setEnabled(false);

    expect(howl.stop).toHaveBeenCalled();
    expect(howl.unload).toHaveBeenCalled();
  });

  test('does not play when locked', () => {
    const playClip = jest.fn();
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: false,
      storage: null,
      playClip
    });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);

    expect(playClip).not.toHaveBeenCalled();
  });

  test('re-announces after disable then enable', () => {
    const playClip = jest.fn();
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playClip
    });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    narrator.setEnabled(false);
    narrator.setEnabled(true);

    expect(playClip).toHaveBeenCalledTimes(2);
  });
});

describe('narrator persistence', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('initFromStorage loads enabled state', () => {
    const storage: Storage = {
      getItem: jest.fn(() => 'true'),
      setItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(() => null),
      removeItem: jest.fn(),
      length: 0
    };
    const narrator = createNarrator({ storage, initialEnabled: false });

    narrator.initFromStorage();

    expect(storage.getItem).toHaveBeenCalledWith('werewolves_narrator_enabled');
    expect(narrator.isEnabled()).toBe(true);
  });

  test('setEnabled updates storage', () => {
    const storage: Storage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(() => null),
      removeItem: jest.fn(),
      length: 0
    };
    const narrator = createNarrator({ storage, initialEnabled: false });

    narrator.setEnabled(true);

    expect(storage.setItem).toHaveBeenCalledWith('werewolves_narrator_enabled', 'true');
  });
});

describe('narrator unlock', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('unlock resolves true on play', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: false });
    const unlockPromise = narrator.unlock();
    const [unlockHowl] = MockHowl.instances;

    unlockHowl.trigger('play');
    await expect(unlockPromise).resolves.toBe(true);
    expect(unlockHowl.stop).toHaveBeenCalled();
    expect(unlockHowl.off).toHaveBeenCalledWith('play');
    expect(unlockHowl.off).toHaveBeenCalledWith('playerror');
    expect(unlockHowl.off).toHaveBeenCalledWith('loaderror');
  });

  test('unlock resolves false on playerror', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: false });
    const unlockPromise = narrator.unlock();
    const [initialHowl] = MockHowl.instances;

    initialHowl.trigger('playerror');
    const fallbackHowl = MockHowl.instances[1];
    fallbackHowl.trigger('playerror');
    await expect(unlockPromise).resolves.toBe(false);
    expect(initialHowl.off).toHaveBeenCalledWith('play');
    expect(initialHowl.off).toHaveBeenCalledWith('playerror');
    expect(initialHowl.off).toHaveBeenCalledWith('loaderror');
  });
});
