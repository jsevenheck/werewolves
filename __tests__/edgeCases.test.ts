import { queueDeath, resolveDeaths } from '../server/src/managers/deathManager';
import { tryResolveDayVote } from '../server/src/managers/voteManager';
import { createRoom } from '../server/src/models/room';
import { createPlayer } from '../server/src/models/player';
import type { Player, Room } from '../core/src/types';

const makePlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  name: overrides.name ?? id,
  role: overrides.role ?? 'villager',
  team: overrides.team ?? 'village',
  alive: overrides.alive ?? true,
  connected: overrides.connected ?? true,
  socketId: overrides.socketId ?? null,
  resumeToken: overrides.resumeToken ?? 'test-token',
  isHost: overrides.isHost ?? false,
  ready: overrides.ready ?? false,
  seerResult: overrides.seerResult ?? null,
});

jest.mock('../server/src/managers/phaseManager', () => ({
  schedulePhaseTransition: jest.fn(),
  holdDayToNightTransition: jest.fn(),
}));

describe('Edge Cases', () => {
  describe('Room Initialization', () => {
    test('room initializes all required fields', () => {
      const { room } = createRoom('Host', 'socket-1', createPlayer);

      expect(room.wolfTarget).toBe(null);
      expect(room.healedTarget).toBe(null);
      expect(room.poisonTarget).toBe(null);
      expect(room.seerActed).toBe(false);
      expect(room.witchState).toEqual({ healAvailable: true, poisonAvailable: true });
      expect(room.lovers).toBe(null);
      expect(room.pendingDeaths).toEqual([]);
      expect(room.awaitingHunterShot).toBe(null);
      expect(room.hunterShotTimer).toBe(null);
      expect(room.hunterShotQueue).toEqual([]);
      expect(room.passiveRoleConfig).toEqual({ mayor: true });
    });
  });

  describe('Lover Death Chain', () => {
    test('lover dies of heartbreak when partner is voted out', () => {
      const room = {
        players: {
          a: makePlayer('a'),
          b: makePlayer('b'),
        },
        lovers: { aId: 'a', bId: 'b' },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        mayorSelectionQueue: [],
        awaitingMayorSelection: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null,
        hunterShotQueue: [],
      } as unknown as Room;
      const broadcastRoom = jest.fn();

      queueDeath(room, 'a', 'executed by vote');
      resolveDeaths(room, 'day', broadcastRoom);

      expect(room.players.a.alive).toBe(false);
      expect(room.players.b.alive).toBe(false);
      expect(room.logs).toHaveLength(2);
      expect(room.logs[1].text).toContain('died of heartbreak');
    });

    test('hunter gets shot when dying as lover', () => {
      jest.useFakeTimers();
      const room = {
        players: {
          hunter: makePlayer('hunter', {
            name: 'Hunter',
            role: 'hunter',
            team: 'village',
            socketId: 'socket-h',
          }),
          lover: makePlayer('lover'),
        },
        lovers: { aId: 'hunter', bId: 'lover' },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        mayorSelectionQueue: [],
        awaitingMayorSelection: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null,
        hunterShotQueue: [],
      } as unknown as Room;
      const emit = jest.fn();
      const io = { sockets: new Map([['socket-h', { emit }]]) };
      const broadcastRoom = jest.fn();

      queueDeath(room, 'lover', 'eaten by Werewolves');
      resolveDeaths(room, 'night', broadcastRoom, io as unknown as never);

      expect(room.players.lover.alive).toBe(false);
      expect(room.players.hunter.alive).toBe(false);
      expect(room.awaitingHunterShot).toBe('hunter');
      expect(emit).toHaveBeenCalledWith('hunterPrompt', { roomCode: room.code });
      if (room.hunterShotTimer) {
        clearTimeout(room.hunterShotTimer);
        room.hunterShotTimer = null;
      }
      jest.useRealTimers();
    });

    test('both lovers dead - no repeated death processing', () => {
      const room = {
        players: {
          a: makePlayer('a', { alive: false }),
          b: makePlayer('b'),
        },
        lovers: { aId: 'a', bId: 'b' },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        mayorSelectionQueue: [],
        awaitingMayorSelection: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null,
        hunterShotQueue: [],
      } as unknown as Room;
      const broadcastRoom = jest.fn();

      queueDeath(room, 'b', 'executed by vote');
      resolveDeaths(room, 'day', broadcastRoom);

      expect(room.players.b.alive).toBe(false);
      expect(room.logs).toHaveLength(1);
    });
  });

  describe('Vote Edge Cases', () => {
    test('single player voting themselves creates tie', () => {
      const players: Record<string, Player> = {
        a: makePlayer('a'),
        b: makePlayer('b'),
      };
      const room = {
        players,
        voteState: { votes: { a: 'a', b: 'b' }, revoteFromTie: null },
        logs: [],
        phase: 'day',
        winner: null,
        hunterShotQueue: [],
        mayorSelectionQueue: [],
        awaitingMayorSelection: null,
      } as unknown as Room;
      const broadcastRoom = jest.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      expect(room.voteState.revoteFromTie).toEqual(expect.arrayContaining(['a', 'b']));
    });

    test('unanimous vote resolves immediately', () => {
      const players: Record<string, Player> = {
        a: makePlayer('a'),
        b: makePlayer('b'),
        c: makePlayer('c'),
      };
      const room = {
        players,
        voteState: { votes: { a: 'c', b: 'c', c: null }, revoteFromTie: null },
        logs: [],
        pendingDeaths: [],
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        winner: null,
        awaitingHunterShot: null,
        mayorSelectionQueue: [],
        awaitingMayorSelection: null,
        transitionTimer: null,
        phaseTimer: null,
        hunterShotQueue: [],
      } as unknown as Room;
      const broadcastRoom = jest.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      expect(room.players.c.alive).toBe(false);
    });

    test('all players abstain - no elimination', () => {
      const players: Record<string, Player> = {
        a: makePlayer('a'),
        b: makePlayer('b'),
        c: makePlayer('c'),
      };
      const room = {
        players,
        voteState: { votes: { a: null, b: null, c: null }, revoteFromTie: null },
        logs: [],
        phase: 'day',
        winner: null,
        hunterShotQueue: [],
        mayorSelectionQueue: [],
        awaitingMayorSelection: null,
      } as unknown as Room;
      const broadcastRoom = jest.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      expect(room.logs[room.logs.length - 1].text).toBe('Vote skipped. No one eliminated.');
    });
  });

  describe('Hunter Edge Cases', () => {
    test('disconnected hunter waits for a shot without auto resolution', () => {
      const room = {
        players: {
          hunter: makePlayer('hunter', {
            name: 'Hunter',
            role: 'hunter',
            team: 'village',
            connected: false,
            socketId: 'socket-h',
          }),
        },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        mayorSelectionQueue: [],
        awaitingMayorSelection: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null,
        hunterShotQueue: [],
      } as unknown as Room;
      const emit = jest.fn();
      const io = { sockets: new Map([['socket-h', { emit }]]) };
      const broadcastRoom = jest.fn();

      queueDeath(room, 'hunter', 'executed by vote');
      resolveDeaths(room, 'day', broadcastRoom, io as unknown as never);

      expect(room.awaitingHunterShot).toBe('hunter');
      expect(emit).not.toHaveBeenCalled();
      expect(room.winner).toBeNull();
    });

    test('hunter without socket waits for a shot without auto resolution', () => {
      const room = {
        players: {
          hunter: makePlayer('hunter', {
            name: 'Hunter',
            role: 'hunter',
            team: 'village',
            socketId: null,
          }),
        },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        mayorSelectionQueue: [],
        awaitingMayorSelection: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null,
        hunterShotQueue: [],
      } as unknown as Room;
      const io = { sockets: new Map() };
      const broadcastRoom = jest.fn();

      queueDeath(room, 'hunter', 'executed by vote');
      resolveDeaths(room, 'day', broadcastRoom, io as unknown as never);

      expect(room.awaitingHunterShot).toBe('hunter');
      expect(room.winner).toBeNull();
    });
  });
});
