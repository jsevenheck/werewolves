jest.mock('../src/server/managers/phaseManager', () => ({
  schedulePhaseTransition: jest.fn()
}));

const { queueDeath, resolveDeaths } = require('../src/server/managers/deathManager');
const { tryResolveDayVote } = require('../src/server/managers/voteManager');
const { createRoom, getRoom } = require('../src/server/models/room');
const { createPlayer } = require('../src/server/models/player');
const { schedulePhaseTransition } = require('../src/server/managers/phaseManager');

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
    });
  });

  describe('Lover Death Chain', () => {
    test('lover dies of heartbreak when partner is voted out', () => {
      const room = {
        players: {
          a: { id: 'a', name: 'A', role: 'villager', alive: true, connected: true },
          b: { id: 'b', name: 'B', role: 'villager', alive: true, connected: true }
        },
        lovers: { aId: 'a', bId: 'b' },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null
      };
      const broadcastRoom = jest.fn();

      queueDeath(room, 'a', 'executed by vote');
      resolveDeaths(room, 'day', broadcastRoom);

      expect(room.players.a.alive).toBe(false);
      expect(room.players.b.alive).toBe(false);
      expect(room.logs).toHaveLength(2);
      expect(room.logs[1].text).toContain('died of heartbreak');
    });

    test('hunter gets shot when dying as lover', () => {
      const room = {
        players: {
          hunter: { 
            id: 'hunter', 
            name: 'Hunter', 
            role: 'hunter', 
            alive: true, 
            connected: true,
            socketId: 'socket-h'
          },
          lover: { id: 'lover', name: 'Lover', role: 'villager', alive: true, connected: true }
        },
        lovers: { aId: 'hunter', bId: 'lover' },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null
      };
      const emit = jest.fn();
      const io = { sockets: { sockets: new Map([['socket-h', { emit }]]) } };
      const broadcastRoom = jest.fn();

      queueDeath(room, 'lover', 'eaten by Werewolves');
      resolveDeaths(room, 'night', broadcastRoom, io);

      expect(room.players.lover.alive).toBe(false);
      expect(room.players.hunter.alive).toBe(false);
      expect(room.awaitingHunterShot).toBe('hunter');
      expect(emit).toHaveBeenCalledWith('hunterPrompt', { roomCode: undefined });
    });

    test('both lovers dead - no repeated death processing', () => {
      const room = {
        players: {
          a: { id: 'a', name: 'A', role: 'villager', alive: false, connected: true },
          b: { id: 'b', name: 'B', role: 'villager', alive: true, connected: true }
        },
        lovers: { aId: 'a', bId: 'b' },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null
      };
      const broadcastRoom = jest.fn();

      queueDeath(room, 'b', 'executed by vote');
      resolveDeaths(room, 'day', broadcastRoom);

      expect(room.players.b.alive).toBe(false);
      expect(room.logs).toHaveLength(1);
    });
  });

  describe('Vote Edge Cases', () => {
    test('single player voting themselves creates tie', () => {
      const players = {
        a: { id: 'a', alive: true },
        b: { id: 'b', alive: true }
      };
      const room = {
        players,
        voteState: { votes: { a: 'a', b: 'b' }, revoteFromTie: null },
        logs: [],
        phase: 'day',
        winner: null
      };
      const broadcastRoom = jest.fn();

      tryResolveDayVote(room, broadcastRoom);

      expect(room.voteState.revoteFromTie).toEqual(expect.arrayContaining(['a', 'b']));
    });

    test('unanimous vote resolves immediately', () => {
      const players = {
        a: { id: 'a', alive: true, name: 'A', role: 'villager' },
        b: { id: 'b', alive: true, name: 'B', role: 'villager' },
        c: { id: 'c', alive: true, name: 'C', role: 'villager' }
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
        transitionTimer: null,
        phaseTimer: null
      };
      const broadcastRoom = jest.fn();
      
      tryResolveDayVote(room, broadcastRoom);

      expect(room.players.c.alive).toBe(false);
    });

    test('all players abstain - no elimination', () => {
      const players = {
        a: { id: 'a', alive: true },
        b: { id: 'b', alive: true },
        c: { id: 'c', alive: true }
      };
      const room = {
        players,
        voteState: { votes: { a: null, b: null, c: null }, revoteFromTie: null },
        logs: [],
        phase: 'day',
        winner: null
      };
      const broadcastRoom = jest.fn();

      tryResolveDayVote(room, broadcastRoom);

      expect(room.logs[room.logs.length - 1].text).toBe('Vote skipped. No one eliminated.');
    });
  });

  describe('Hunter Edge Cases', () => {
    test('disconnected hunter does not get prompt', () => {
      const room = {
        players: {
          hunter: {
            id: 'hunter',
            name: 'Hunter',
            role: 'hunter',
            alive: true,
            connected: false,
            socketId: 'socket-h'
          }
        },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null
      };
      const emit = jest.fn();
      const io = { sockets: { sockets: new Map([['socket-h', { emit }]]) } };
      const broadcastRoom = jest.fn();

      queueDeath(room, 'hunter', 'executed by vote');
      resolveDeaths(room, 'day', broadcastRoom, io);

      expect(room.awaitingHunterShot).toBe(null);
      expect(emit).not.toHaveBeenCalled();
    });

    test('hunter without socket does not get prompt', () => {
      const room = {
        players: {
          hunter: {
            id: 'hunter',
            name: 'Hunter',
            role: 'hunter',
            alive: true,
            connected: true,
            socketId: null
          }
        },
        pendingDeaths: [],
        logs: [],
        awaitingHunterShot: null,
        winner: null,
        phase: 'day',
        phaseStep: null,
        nextNightStep: null,
        phaseTransition: null,
        transitionTimer: null,
        phaseTimer: null
      };
      const io = { sockets: { sockets: new Map() } };
      const broadcastRoom = jest.fn();

      queueDeath(room, 'hunter', 'executed by vote');
      resolveDeaths(room, 'day', broadcastRoom, io);

      expect(room.awaitingHunterShot).toBe(null);
    });
  });
});
