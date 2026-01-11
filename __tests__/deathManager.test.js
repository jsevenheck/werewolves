const { queueDeath, resolveDeaths, checkWinners } = require('../src/server/managers/deathManager');

const makeRoom = () => ({
  code: 'ABCD',
  players: {},
  pendingDeaths: [],
  logs: [],
  lovers: null,
  lastNightDeaths: [],
  awaitingHunterShot: null,
  winner: null,
  phase: 'night',
  phaseStep: 'wolves',
  nextNightStep: null,
  phaseTransition: null,
  transitionTimer: 1,
  phaseTimer: 2
});

describe('deathManager', () => {
  test('resolveDeaths applies lover chain deaths and night announcement', () => {
    const room = makeRoom();
    room.players = {
      a: { id: 'a', name: 'A', role: 'villager', alive: true, connected: true },
      b: { id: 'b', name: 'B', role: 'villager', alive: true, connected: true },
      wolf: { id: 'wolf', name: 'Wolf', role: 'werewolf', alive: true, connected: true }
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
      hunter: {
        id: 'hunter',
        name: 'Hunter',
        role: 'hunter',
        alive: true,
        connected: true,
        socketId: 'socket-h'
      },
      villager: { id: 'villager', name: 'Villager', role: 'villager', alive: true, connected: true }
    };
    const emit = jest.fn();
    const io = { sockets: { sockets: new Map([['socket-h', { emit }]]) } };
    const broadcastRoom = jest.fn();

    queueDeath(room, 'hunter', 'executed by vote');
    resolveDeaths(room, 'day', broadcastRoom, io);

    expect(room.awaitingHunterShot).toBe('hunter');
    expect(emit).toHaveBeenCalledWith('hunterPrompt', { roomCode: room.code });
    expect(room.winner).toBeNull();
  });

  test('checkWinners ends the game on wolf parity', () => {
    const room = makeRoom();
    room.players = {
      w1: { id: 'w1', role: 'werewolf', alive: true },
      w2: { id: 'w2', role: 'werewolf', alive: true },
      v1: { id: 'v1', role: 'villager', alive: true }
    };

    checkWinners(room);

    expect(room.winner).toEqual({ team: 'wolves', reason: 'Werewolves reached parity.' });
    expect(room.phase).toBe('ended');
    expect(room.phaseStep).toBeNull();
    expect(room.nextNightStep).toBeNull();
    expect(room.phaseTransition).toBeNull();
    expect(room.transitionTimer).toBeNull();
    expect(room.phaseTimer).toBeNull();
  });
});
