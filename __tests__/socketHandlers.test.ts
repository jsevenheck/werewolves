import { getRoom } from '../src/server/models/room';
import { broadcastRoom } from '../src/server/managers/broadcastManager';
import { scheduleNightStep, startNight, advanceFromReveal } from '../src/server/managers/phaseManager';
import { tryFinalizeWolfVote, advanceNightStep, handleWitchDecision } from '../src/server/managers/nightManager';
import { queueDeath, resolveDeaths } from '../src/server/managers/deathManager';
import { setupSocketHandlers } from '../src/server/handlers/socketHandlers';
import type { ClientToServerEvents, ServerToClientEvents } from '../src/shared/events';
import type { Room } from '../src/shared/types';

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

const makeSocket = () => {
  const handlers: Record<string, (payload?: any) => void> = {};
  const socket = {
    id: 'socket-1',
    emit: jest.fn(),
    on: (event: string, handler: (payload?: any) => void) => {
      handlers[event] = handler;
    }
  };
  return { handlers, socket };
};

describe('socketHandlers hostSkipStep', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

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
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

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
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

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
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(handleWitchDecision).toHaveBeenCalledWith(room, null, 'skip', null, expect.any(Function), io);
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
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.phaseStep).toBe('seer');
    expect(room.nextNightStep).toBeNull();
    expect(advanceNightStep).toHaveBeenCalledWith(room, expect.any(Function), io);
  });

  test('rejects duplicate wolf votes', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'wolves',
      players: {
        w1: { id: 'w1', role: 'werewolf', alive: true },
        v1: { id: 'v1', role: 'villager', alive: true }
      },
      wolfVotes: { w1: 'v1' }
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitWolfVote({ roomCode: 'ABCD', playerId: 'w1', targetId: 'v1' });

    expect(socket.emit).toHaveBeenCalledWith('wolfVoteRejected', { reason: 'already_voted' });
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
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

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
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

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
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(advanceFromReveal).toHaveBeenCalledWith(room, expect.any(Function));
  });
});

describe('socketHandlers hunterShoot', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

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
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    socket.id = 'socket1';
    setupSocketHandlers(io, socket as any);

    handlers.hunterShoot({ roomCode: 'ABCD', playerId: 'hunter', targetId: 'v1' });

    expect(queueDeath).toHaveBeenCalledWith(room, 'v1', 'shot by Hunter');
    expect(room.awaitingHunterShot).toBeNull();
    expect(resolveDeaths).toHaveBeenCalledWith(room, 'general', expect.any(Function), io);
  });
});
