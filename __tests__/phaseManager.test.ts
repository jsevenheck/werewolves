import { startNight, scheduleNightStep, schedulePhaseTransition, advanceFromReveal } from '../src/server/managers/phaseManager';
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
  hunterShotTimer: null,
  hunterShotQueue: [],
  wolfVotes: { stale: 'x' },
  wolfTarget: 'old',
  healedTarget: null,
  poisonTarget: null,
  seerActed: true,
  guardedTarget: null,
  lastGuardedTarget: null,
  guardActed: false,
  pendingDeaths: [],
  lastNightDeaths: [],
  lastDayDeaths: [],
  lastDayMessage: null,
  voteState: { votes: { a: 'b' }, revoteFromTie: ['b'] },
  awaitingHunterShot: 'p1',
  dayCount: 0,
  logs: [],
  winner: null,
  minPlayers: 5,
  roleConfig: { werewolf: 1, seer: 0, hunter: 0, witch: 0, armor: 0, joker: 0, guard: 0 } as RoleConfig,
  passiveRoleConfig: { mayor: true },
  mayorId: null,
  awaitingMayorSelection: null,
  mayorSelectionQueue: [],
  mayorSelectionTimer: null,
  lovers: null,
  witchState: { healAvailable: true, poisonAvailable: true },
  createdAt: Date.now(),
  lastActivityAt: Date.now()
});

const buildPlayer = (overrides: Partial<Player>): Player => ({
  id: 'p1',
  name: 'Player',
  role: 'villager',
  team: 'village',
  alive: true,
  connected: true,
  socketId: null,
  resumeToken: 'token',
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
    room.seerActed = false;
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
    jest.useRealTimers();
  });

  test('scheduleNightStep skips seer when none are alive', () => {
    jest.useFakeTimers();
    const room = makeRoom();
    room.phase = 'night';
    room.phaseStep = 'wolves';
    room.seerActed = false;
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'witch', alive: true })
    };
    const broadcastRoom = jest.fn();

    scheduleNightStep(room, 'seer', broadcastRoom, undefined as never);

    expect(room.phaseStep).toBe('transition');
    expect(room.nextNightStep).toBe('witch');
    expect(broadcastRoom).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3000);

    expect(room.phaseStep).toBe('witch');
    expect(room.nextNightStep).toBeNull();
    expect(broadcastRoom).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
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

  test('advanceFromReveal skips mayor when disabled and armor is alive', () => {
    const room = makeRoom();
    room.passiveRoleConfig.mayor = false;
    room.roleConfig.armor = 1;
    room.players = {
      armor: buildPlayer({ id: 'armor', role: 'armor', alive: true }),
      villager: buildPlayer({ id: 'villager', role: 'villager', alive: true })
    };
    const broadcastRoom = jest.fn();

    advanceFromReveal(room, broadcastRoom);

    expect(room.phase).toBe('armor');
    expect(room.phaseStep).toBeNull();
    expect(broadcastRoom).toHaveBeenCalledTimes(1);
  });

  test('advanceFromReveal skips mayor when disabled and no armor is alive', () => {
    const room = makeRoom();
    room.passiveRoleConfig.mayor = false;
    room.roleConfig.armor = 0;
    room.players = {
      wolf: buildPlayer({ id: 'wolf', role: 'werewolf', team: 'wolves', alive: true }),
      villager: buildPlayer({ id: 'villager', role: 'villager', alive: true })
    };
    const broadcastRoom = jest.fn();

    advanceFromReveal(room, broadcastRoom);

    expect(room.phase).toBe('night');
    expect(room.phaseStep).toBe('wolves');
    expect(broadcastRoom).toHaveBeenCalledTimes(1);
  });
});
