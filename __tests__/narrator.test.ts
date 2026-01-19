type HowlEvent = 'play' | 'playerror';

class MockHowl {
  static instances: MockHowl[] = [];
  static reset() {
    MockHowl.instances = [];
  }

  readonly options: Record<string, unknown>;
  private readonly handlers = new Map<HowlEvent, Array<() => void>>();
  off = jest.fn((_event: HowlEvent) => this);
  play = jest.fn(() => 1);
  stop = jest.fn();
  unload = jest.fn();

  constructor(options: Record<string, unknown>) {
    this.options = options;
    MockHowl.instances.push(this);
  }

  once(event: HowlEvent, handler: () => void) {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, [...existing, handler]);
    return this;
  }

  trigger(event: HowlEvent) {
    const handlers = this.handlers.get(event) ?? [];
    this.handlers.delete(event);
    handlers.forEach((handler) => handler());
  }
}

jest.mock('howler', () => ({ Howl: MockHowl }));

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
  minPlayers: 4,
  roleConfig: {
    werewolf: 1,
    seer: 1,
    hunter: 0,
    witch: 0,
    armor: 0,
    joker: 0
  },
  loversKnown: false,
  loversAssigned: false,
  loverName: null,
  witchState: { healAvailable: null, poisonAvailable: null },
  wolfVotes: null,
  wolfTarget: null,
  wolfPeers: [],
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
  winner: null,
  logs: [],
  self: null
});

const buildRoom = (overrides: RoomOverrides = {}): RoomView => ({
  ...baseRoom(),
  ...overrides
});

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
  });

  test('unlock resolves false on playerror', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: false });
    const unlockPromise = narrator.unlock();
    const [unlockHowl] = MockHowl.instances;

    unlockHowl.trigger('playerror');
    await expect(unlockPromise).resolves.toBe(false);
    expect(unlockHowl.off).toHaveBeenCalledWith('play');
    expect(unlockHowl.off).toHaveBeenCalledWith('playerror');
  });
});
