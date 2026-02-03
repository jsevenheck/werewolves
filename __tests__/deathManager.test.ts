import { queueDeath, resolveDeaths, checkWinners } from '../server/src/managers/deathManager';
import type { Player, Room, RoleConfig } from '../core/src/types';

type IoStub = { sockets: Map<string, { emit: jest.Mock }> };

const makeRoom = (): Room => ({
  code: 'ABCD',
  hostId: 'a',
  phase: 'night',
  phaseStep: 'wolves',
  dayCount: 1,
  players: {},
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
  } as RoleConfig,
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
  guardedTarget: null,
  lastGuardedTarget: null,
  guardActed: false,
  voteState: { votes: {}, revoteFromTie: null },
  pendingDeaths: [],
  logs: [],
  lastNightDeaths: [],
  lastDayDeaths: [],
  lastDayMessage: null,
  awaitingHunterShot: null,
  winner: null,
  nextNightStep: null,
  phaseTransition: null,
  transitionTimer: null,
  phaseTimer: null,
  hunterShotTimer: null,
  hunterShotEndsAt: null,
  hunterShotQueue: [],
  harlotVisitedTarget: null,
  harlotActed: false,
  dayVoteResolved: false,
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
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
  ready: false,
  seerResult: null,
  ...overrides,
});

describe('deathManager', () => {
  test('resolveDeaths applies lover chain deaths and night announcement', () => {
    const room = makeRoom();
    room.players = {
      a: buildPlayer({ id: 'a', name: 'A', role: 'villager', alive: true, connected: true }),
      b: buildPlayer({ id: 'b', name: 'B', role: 'villager', alive: true, connected: true }),
      wolf: buildPlayer({
        id: 'wolf',
        name: 'Wolf',
        role: 'werewolf',
        team: 'wolves',
        alive: true,
        connected: true,
      }),
    };
    room.lovers = { aId: 'a', bId: 'b' };
    const broadcastRoom = jest.fn();

    queueDeath(room, 'a', 'eaten by Werewolves');
    resolveDeaths(room, 'night', broadcastRoom);

    expect(room.players.a.alive).toBe(false);
    expect(room.players.b.alive).toBe(false);
    expect(room.lastNightDeaths).toHaveLength(2);
    expect(room.logs).toHaveLength(2);
    expect(room.logs[0].text).toContain('died');
    expect(broadcastRoom).toHaveBeenCalledTimes(1);
  });

  test('resolveDeaths queues hunter prompt and delays winner check', () => {
    const room = makeRoom();
    room.players = {
      hunter: buildPlayer({
        id: 'hunter',
        name: 'Hunter',
        role: 'hunter',
        alive: true,
        connected: true,
        socketId: 'socket-h',
      }),
      villager: buildPlayer({
        id: 'villager',
        name: 'Villager',
        role: 'villager',
        alive: true,
        connected: true,
      }),
    };
    const emit = jest.fn();
    const io: IoStub = { sockets: new Map([['socket-h', { emit }]]) };
    const broadcastRoom = jest.fn();

    queueDeath(room, 'hunter', 'executed by vote');
    resolveDeaths(room, 'day', broadcastRoom, io as unknown as never);

    expect(room.awaitingHunterShot).toBe('hunter');
    expect(room.hunterShotTimer).not.toBeNull(); // Timer should be set for auto-timeout
    expect(emit).toHaveBeenCalledWith('hunterPrompt', { roomCode: room.code });
    expect(room.winner).toBeNull();
  });

  test('checkWinners ends the game on wolf parity', () => {
    const room = makeRoom();
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'werewolf', team: 'wolves', alive: true }),
      w2: buildPlayer({ id: 'w2', role: 'werewolf', team: 'wolves', alive: true }),
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
    };

    checkWinners(room);

    expect(room.winner).toEqual({ team: 'wolves', reason: 'Werewolves have the majority.' });
    expect(room.phase).toBe('ended');
    expect(room.phaseStep).toBeNull();
    expect(room.nextNightStep).toBeNull();
    expect(room.phaseTransition).toBeNull();
    expect(room.transitionTimer).toBeNull();
    expect(room.phaseTimer).toBeNull();
  });

  test('checkWinners declares village win when lone witch has both potions at parity', () => {
    const room = makeRoom();
    room.players = {
      wolf: buildPlayer({ id: 'wolf', role: 'werewolf', team: 'wolves', alive: true }),
      witch: buildPlayer({ id: 'witch', role: 'witch', team: 'village', alive: true }),
    };
    room.witchState = { healAvailable: true, poisonAvailable: true };

    checkWinners(room);

    expect(room.winner).toEqual({
      team: 'village',
      reason: 'Witch can heal and poison to break parity.',
    });
    expect(room.phase).toBe('ended');
  });
});
