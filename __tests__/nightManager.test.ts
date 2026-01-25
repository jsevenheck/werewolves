import { scheduleNightStep, schedulePhaseTransition } from '../src/server/managers/phaseManager';
import { queueDeath, resolveDeaths } from '../src/server/managers/deathManager';
import { tryFinalizeWolfVote, handleWitchDecision, resolveNight } from '../src/server/managers/nightManager';
import { NIGHT_RESOLVE_DELAY_MS } from '../src/server/config/constants';
import type { Player, Room, RoleConfig } from '../src/shared/types';

jest.mock('../src/server/managers/phaseManager', () => ({
  scheduleNightStep: jest.fn(),
  schedulePhaseTransition: jest.fn()
}));

jest.mock('../src/server/managers/deathManager', () => ({
  queueDeath: jest.fn(),
  resolveDeaths: jest.fn()
}));

const makeRoom = (): Room => ({
  code: 'ABCD',
  hostId: 'w1',
  phase: 'night',
  phaseStep: 'wolves',
  dayCount: 0,
  players: {},
  minPlayers: 3,
  roleConfig: { werewolf: 1, seer: 0, hunter: 0, witch: 0, armor: 0, joker: 0 } as RoleConfig,
  passiveRoleConfig: { mayor: true },
  mayorId: null,
  awaitingMayorSelection: null,
  mayorSelectionQueue: [],
  mayorSelectionTimer: null,
  lovers: null,
  witchState: { healAvailable: true, poisonAvailable: true },
  wolfVotes: {},
  wolfTarget: null,
  healedTarget: null,
  poisonTarget: null,
  seerActed: false,
  voteState: { votes: {}, revoteFromTie: null },
  pendingDeaths: [],
  logs: [],
  nextNightStep: null,
  phaseTransition: null,
  phaseTimer: null,
  transitionTimer: null,
  hunterShotTimer: null,
  hunterShotQueue: [],
  lastNightDeaths: [],
  lastDayDeaths: [],
  lastDayMessage: null,
  awaitingHunterShot: null,
  winner: null
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

describe('nightManager', () => {
  test('tryFinalizeWolfVote picks a tied target and advances', () => {
    const room = makeRoom();
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'werewolf', team: 'wolves', alive: true }),
      w2: buildPlayer({ id: 'w2', role: 'werewolf', team: 'wolves', alive: true }),
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
      v2: buildPlayer({ id: 'v2', role: 'villager', team: 'village', alive: true })
    };
    room.wolfVotes = { w1: 'v1', w2: 'v2' };
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    tryFinalizeWolfVote(room, jest.fn(), undefined as never);

    expect(room.wolfTarget).toBe('v1');
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'seer', expect.any(Function), undefined);
    randomSpy.mockRestore();
  });

  test('tryFinalizeWolfVote advances when no wolves are alive', () => {
    const room = makeRoom();
    room.players = {
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true })
    };

    tryFinalizeWolfVote(room, jest.fn(), undefined as never);

    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'seer', expect.any(Function), undefined);
  });

  test('handleWitchDecision uses heal potion and advances', () => {
    const room = makeRoom();
    room.wolfTarget = 'v1';

    handleWitchDecision(room, 'w1', 'heal', null, jest.fn(), undefined as never);

    expect(room.witchState.healAvailable).toBe(false);
    expect(room.healedTarget).toBe('v1');
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'resolve', expect.any(Function), undefined);
  });

  test('handleWitchDecision keeps witch step open when poison remains', () => {
    const room = makeRoom();
    room.wolfTarget = 'v1';
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'witch', team: 'village', alive: true }),
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true })
    };
    const broadcastRoom = jest.fn();

    handleWitchDecision(room, 'w1', 'heal', null, broadcastRoom, undefined as never);

    expect(room.witchState.healAvailable).toBe(false);
    expect(room.witchState.poisonAvailable).toBe(true);
    expect(room.healedTarget).toBe('v1');
    expect(scheduleNightStep).not.toHaveBeenCalled();
    expect(broadcastRoom).toHaveBeenCalledWith(room);
  });

  test('handleWitchDecision keeps witch step open when heal remains', () => {
    const room = makeRoom();
    room.wolfTarget = 'v1';
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'witch', team: 'village', alive: true }),
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true })
    };
    const broadcastRoom = jest.fn();

    handleWitchDecision(room, 'w1', 'poison', 'v1', broadcastRoom, undefined as never);

    expect(room.witchState.poisonAvailable).toBe(false);
    expect(room.witchState.healAvailable).toBe(true);
    expect(room.poisonTarget).toBe('v1');
    expect(scheduleNightStep).not.toHaveBeenCalled();
    expect(broadcastRoom).toHaveBeenCalledWith(room);
  });

  test('handleWitchDecision uses poison potion and advances', () => {
    const room = makeRoom();
    room.players = { v2: buildPlayer({ id: 'v2', role: 'villager', team: 'village', alive: true }) };

    handleWitchDecision(room, 'w1', 'poison', 'v2', jest.fn(), undefined as never);

    expect(room.witchState.poisonAvailable).toBe(false);
    expect(room.poisonTarget).toBe('v2');
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'resolve', expect.any(Function), undefined);
  });

  test('resolveNight queues deaths, resolves, and transitions', () => {
    jest.useFakeTimers();
    try {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.wolfTarget = 'v1';
      room.poisonTarget = 'v2';

      resolveNight(room, jest.fn(), undefined as never);

      expect(queueDeath).toHaveBeenCalledWith(room, 'v1', 'eaten by Werewolves');
      expect(queueDeath).toHaveBeenCalledWith(room, 'v2', 'poisoned by Witch');
      expect(resolveDeaths).toHaveBeenCalledWith(room, 'night', expect.any(Function), undefined);
      expect(room.healedTarget).toBeNull();
      expect(room.poisonTarget).toBeNull();
      jest.advanceTimersByTime(NIGHT_RESOLVE_DELAY_MS);
      expect(schedulePhaseTransition).toHaveBeenCalledWith(room, 'nightToDay', expect.any(Function));
    } finally {
      jest.useRealTimers();
    }
  });
});
