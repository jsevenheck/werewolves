jest.mock('howler', () => ({ Howl: class {} }));

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
