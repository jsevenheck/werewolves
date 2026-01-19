import { startNight, scheduleNightStep, schedulePhaseTransition } from '../src/server/managers/phaseManager';
import type { Player, Room, RoleConfig } from '../src/shared/types';

const makeRoom = (): Room => ({
  code: 'ABCD',
  hostId: 'w1',
  players: {},
  phase: 'lobby',
  phaseStep: null,
  nextNightStep: null,
  phaseTransition: null,
  transitionTimer: null,
  phaseTimer: null,
  wolfVotes: { stale: 'x' },
  wolfTarget: 'old',
  healedTarget: null,
  poisonTarget: null,
  seerActed: true,
  pendingDeaths: [],
  lastNightDeaths: [],
  lastDayDeaths: [],
  lastDayMessage: null,
  voteState: { votes: { a: 'b' }, revoteFromTie: ['b'] },
  awaitingHunterShot: 'p1',
  dayCount: 0,
  logs: [],
  winner: null,
  minPlayers: 3,
  roleConfig: { werewolf: 1, seer: 0, hunter: 0, witch: 0, armor: 0, joker: 0 } as RoleConfig,
  lovers: null,
  witchState: { healAvailable: true, poisonAvailable: true }
});

const buildPlayer = (overrides: Partial<Player>): Player => ({
  id: 'p1',
  name: 'Player',
  role: 'villager',
  team: 'village',
  alive: true,
  connected: true,
  socketId: null,
  isHost: false,
  voteTarget: null,
  nightAction: null,
  ready: false,
  seerResult: null,
  ...overrides
});

describe('phaseManager', () => {
  test('startNight resets night state and wolf votes', () => {
    const room = makeRoom();
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'werewolf', team: 'wolves', alive: true }),
      w2: buildPlayer({ id: 'w2', role: 'werewolf', team: 'wolves', alive: false }),
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true })
    };

    startNight(room);

    expect(room.phase).toBe('night');
    expect(room.phaseStep).toBe('wolves');
    expect(room.wolfVotes).toEqual({ w1: null });
    expect(room.wolfTarget).toBeNull();
    expect(room.seerActed).toBe(false);
    expect(room.pendingDeaths).toEqual([]);
    expect(room.lastNightDeaths).toEqual([]);
    expect(room.voteState).toEqual({ votes: {}, revoteFromTie: null });
    expect(room.awaitingHunterShot).toBeNull();
  });

  test('scheduleNightStep transitions after the night delay', () => {
    jest.useFakeTimers();
    const room = makeRoom();
    room.phase = 'night';
    room.phaseStep = 'wolves';
    room.players = {
      s1: buildPlayer({ id: 's1', role: 'seer', alive: true })
    };
    const broadcastRoom = jest.fn();

    scheduleNightStep(room, 'seer', broadcastRoom, undefined as never);

    expect(room.phaseStep).toBe('transition');
    expect(room.nextNightStep).toBe('seer');
    expect(broadcastRoom).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3000);

    expect(room.phaseStep).toBe('seer');
    expect(room.nextNightStep).toBeNull();
    expect(broadcastRoom).toHaveBeenCalledTimes(2);
  });

  test('schedulePhaseTransition moves night to day after delay', () => {
    jest.useFakeTimers();
    const room = makeRoom();
    room.phase = 'night';
    room.phaseStep = 'wolves';
    const broadcastRoom = jest.fn();

    schedulePhaseTransition(room, 'nightToDay', broadcastRoom);

    expect(room.phaseTransition).toBe('nightToDay');
    expect(room.phaseStep).toBe('transition');
    expect(broadcastRoom).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3000);

    expect(room.phaseTransition).toBeNull();
    expect(room.phase).toBe('day');
    expect(room.dayCount).toBe(1);
    expect(room.voteState).toEqual({ votes: {}, revoteFromTie: null });
    expect(room.logs[room.logs.length - 1].text).toBe('Day 1 has begun.');
    expect(broadcastRoom).toHaveBeenCalledTimes(2);
  });
});
