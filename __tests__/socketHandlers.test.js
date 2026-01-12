jest.mock('../src/server/models/room', () => ({
  createRoom: jest.fn(),
  getRoom: jest.fn(),
  getAllRooms: jest.fn()
}));

jest.mock('../src/server/managers/broadcastManager', () => ({
  broadcastRoom: jest.fn(),
  sendStateToPlayer: jest.fn()
}));

jest.mock('../src/server/managers/phaseManager', () => ({
  schedulePhaseTransition: jest.fn(),
  advanceFromReveal: jest.fn(),
  startNight: jest.fn(),
  notifyLovers: jest.fn(),
  scheduleNightStep: jest.fn()
}));

jest.mock('../src/server/managers/nightManager', () => ({
  tryFinalizeWolfVote: jest.fn(),
  advanceNightStep: jest.fn(),
  handleWitchDecision: jest.fn()
}));

jest.mock('../src/server/managers/deathManager', () => ({
  queueDeath: jest.fn(),
  resolveDeaths: jest.fn()
}));

const { getRoom } = require('../src/server/models/room');
const { broadcastRoom } = require('../src/server/managers/broadcastManager');
const { scheduleNightStep } = require('../src/server/managers/phaseManager');
const { startNight, advanceFromReveal } = require('../src/server/managers/phaseManager');
const { tryFinalizeWolfVote, handleWitchDecision } = require('../src/server/managers/nightManager');
const { queueDeath, resolveDeaths } = require('../src/server/managers/deathManager');
const { setupSocketHandlers } = require('../src/server/handlers/socketHandlers');

const makeSocket = () => {
  const handlers = {};
  const socket = {
    on: (event, handler) => {
      handlers[event] = handler;
    }
  };
  return { handlers, socket };
};

describe('socketHandlers hostSkipStep', () => {
  const io = { sockets: { sockets: new Map() } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('host skips wolves step even when wolves are alive', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'wolves',
      phaseTransition: null,
      players: {
        w1: { id: 'w1', role: 'werewolf', alive: true },
        w2: { id: 'w2', role: 'werewolf', alive: true },
        v1: { id: 'v1', role: 'villager', alive: true }
      },
      wolfVotes: { w1: null, w2: null }
    };
    getRoom.mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.wolfVotes).toEqual({ w1: null, w2: null });
    expect(tryFinalizeWolfVote).toHaveBeenCalledWith(room, expect.any(Function), io);
  });

  test('host skips seer step even when seer is alive', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'seer',
      phaseTransition: null,
      seerActed: false,
      players: {
        s1: { id: 's1', role: 'seer', alive: true },
        v1: { id: 'v1', role: 'villager', alive: true }
      }
    };
    getRoom.mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.seerActed).toBe(true);
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'witch', expect.any(Function), io);
  });

  test('host skips witch step even when witch is alive', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'witch',
      phaseTransition: null,
      players: {
        w1: { id: 'w1', role: 'witch', alive: true },
        v1: { id: 'v1', role: 'villager', alive: true }
      }
    };
    getRoom.mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(handleWitchDecision).toHaveBeenCalledWith(room, 'skip', null, expect.any(Function), io);
  });

  test('host skips transition to a night step immediately', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'transition',
      nextNightStep: 'seer',
      phaseTransition: null,
      players: {}
    };
    getRoom.mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.phaseStep).toBe('seer');
    expect(room.nextNightStep).toBeNull();
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
  });

  test('host skips phase transition night to day', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'transition',
      phaseTransition: 'nightToDay',
      nextNightStep: null,
      dayCount: 0,
      players: {},
      voteState: { votes: { a: 'b' }, revoteFromTie: ['b'] },
      logs: []
    };
    getRoom.mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.phaseTransition).toBeNull();
    expect(room.phase).toBe('day');
    expect(room.phaseStep).toBeNull();
    expect(room.dayCount).toBe(1);
    expect(room.voteState).toEqual({ votes: {}, revoteFromTie: null });
    expect(room.logs[room.logs.length - 1].text).toBe('Day 1 has begun.');
  });

  test('host skips phase transition day to night', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      phaseTransition: 'dayToNight',
      nextNightStep: null,
      players: {}
    };
    getRoom.mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(startNight).toHaveBeenCalledWith(room);
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
  });

  test('host skips phase transition post reveal', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'roleReveal',
      phaseStep: null,
      phaseTransition: 'postReveal',
      nextNightStep: null,
      players: {}
    };
    getRoom.mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(advanceFromReveal).toHaveBeenCalledWith(room, expect.any(Function));
  });
});

describe('socketHandlers hunterShoot', () => {
  const io = { sockets: { sockets: new Map() } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hunter can shoot after death when awaitingHunterShot is set', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      awaitingHunterShot: 'hunter',
      players: {
        hunter: { id: 'hunter', role: 'hunter', alive: false, socketId: 'socket1' },
        v1: { id: 'v1', role: 'villager', alive: true }
      }
    };
    getRoom.mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    socket.id = 'socket1';
    setupSocketHandlers(io, socket);

    handlers.hunterShoot({ roomCode: 'ABCD', playerId: 'hunter', targetId: 'v1' });

    expect(queueDeath).toHaveBeenCalledWith(room, 'v1', 'shot by Hunter');
    expect(room.awaitingHunterShot).toBeNull();
    expect(resolveDeaths).toHaveBeenCalledWith(room, 'general', expect.any(Function), io);
  });
});
