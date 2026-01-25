import { getRoom } from '../src/server/models/room';
import { broadcastRoom } from '../src/server/managers/broadcastManager';
import {
  scheduleNightStep,
  schedulePhaseTransition,
  startNight,
  advanceFromReveal,
  holdDayToNightTransition
} from '../src/server/managers/phaseManager';
import { tryFinalizeWolfVote, advanceNightStep, handleWitchDecision } from '../src/server/managers/nightManager';
import { tryResolveDayVote } from '../src/server/managers/voteManager';
import { queueDeath, resolveDeaths, startNextHunterShot, checkWinners } from '../src/server/managers/deathManager';
import { setupSocketHandlers } from '../src/server/handlers/socketHandlers';
import { setSocketIndex, deleteSocketIndex } from '../src/server/models/player';
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
  holdDayToNightTransition: jest.fn(),
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

jest.mock('../src/server/managers/voteManager', () => {
  const actual = jest.requireActual('../src/server/managers/voteManager');
  return {
    ...actual,
    tryResolveDayVote: jest.fn(actual.tryResolveDayVote)
  };
});

jest.mock('../src/server/managers/deathManager', () => ({
  queueDeath: jest.fn(),
  resolveDeaths: jest.fn(),
  startNextHunterShot: jest.fn(),
  checkWinners: jest.fn()
}));

const makeSocket = () => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const socket = {
    id: 'socket-1',
    emit: jest.fn(),
    on: (event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handler;
    }
  };
  return { handlers, socket };
};

describe('socketHandlers host handoff', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  afterEach(() => {
    deleteSocketIndex('socket-owner');
    deleteSocketIndex('socket-owner-2');
  });

  test('acting host transfers on disconnect and reclaims on resume', () => {
    const room = {
      code: 'ABCD',
      hostId: 'owner',
      phase: 'lobby',
      phaseStep: null,
      phaseTransition: null,
      players: {
        owner: { id: 'owner', name: 'Owner', isHost: true, connected: true, socketId: 'socket-owner', resumeToken: 'token-owner' },
        peer: { id: 'peer', name: 'Peer', isHost: false, connected: true, socketId: 'socket-peer' }
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: []
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);

    const { handlers, socket } = makeSocket();
    socket.id = 'socket-owner';
    setSocketIndex('socket-owner', room.code, 'owner');
    setupSocketHandlers(io, socket as any);

    handlers.disconnect();

    expect(room.hostId).toBe('peer');

    const { handlers: handlers2, socket: socket2 } = makeSocket();
    socket2.id = 'socket-owner-2';
    setupSocketHandlers(io, socket2 as any);

    handlers2.resumePlayer({ roomCode: 'ABCD', playerId: 'owner', resumeToken: 'token-owner', name: 'Owner' }, jest.fn());

    expect(room.hostId).toBe('owner');
  });
});

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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
        w1: { id: 'w1', role: 'werewolf', alive: true },
        w2: { id: 'w2', role: 'werewolf', alive: true },
        v1: { id: 'v1', role: 'villager', alive: true }
      },
      wolfVotes: { w1: '', w2: '' }
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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
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
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' }
      }
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
        w1: { id: 'w1', role: 'werewolf', alive: true, socketId: 'socket-1' },
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
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' }
      },
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
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' }
      }
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
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' }
      }
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(advanceFromReveal).toHaveBeenCalledWith(room, expect.any(Function));
  });

  test('host skips awaiting hunter shot and advances the phase', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: null,
      phaseTransition: null,
      awaitingHunterShot: 'hunter',
      hunterShotTimer: 123,
      hunterShotQueue: [],
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' }
      },
      winner: null
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    (startNextHunterShot as jest.Mock).mockReturnValue(false);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.awaitingHunterShot).toBeNull();
    expect(room.hunterShotTimer).toBeNull();
    expect(startNextHunterShot).toHaveBeenCalledWith(room, expect.any(Function), io);
    expect(checkWinners).toHaveBeenCalledWith(room);
    expect(schedulePhaseTransition).toHaveBeenCalledWith(room, 'nightToDay', expect.any(Function));
  });

  test('host skips awaiting hunter shot and starts next hunter shot', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: null,
      phaseTransition: null,
      awaitingHunterShot: 'hunter',
      hunterShotTimer: 456,
      hunterShotQueue: ['hunter2'],
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' }
      },
      winner: null
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    (startNextHunterShot as jest.Mock).mockReturnValueOnce(true);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.awaitingHunterShot).toBeNull();
    expect(room.hunterShotTimer).toBeNull();
    expect(startNextHunterShot).toHaveBeenCalledWith(room, expect.any(Function), io);
    expect(checkWinners).not.toHaveBeenCalled();
    expect(schedulePhaseTransition).not.toHaveBeenCalled();
    expect(holdDayToNightTransition).not.toHaveBeenCalled();
  });
});

describe('socketHandlers disconnect vote resolution', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    jest.clearAllMocks();
    deleteSocketIndex('socket-1');
  });

  test('does not resolve day vote during a phase transition', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      phaseTransition: 'dayToNight',
      awaitingHunterShot: null,
      players: {
        host: { id: 'host', alive: true, connected: true, socketId: 'socket-1' }
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: []
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'host');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.disconnect();

    expect(tryResolveDayVote).not.toHaveBeenCalled();
  });

  test('does not resolve day vote while awaiting a hunter shot', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      phaseTransition: null,
      awaitingHunterShot: 'host',
      players: {
        host: { id: 'host', alive: true, connected: true, socketId: 'socket-1' }
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: []
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'host');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.disconnect();

    expect(tryResolveDayVote).not.toHaveBeenCalled();
  });
});

describe('socketHandlers security checks', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updateRoleConfig ignores host actions from other sockets', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'lobby',
      minPlayers: 5,
      roleConfig: { werewolf: 2, seer: 1, hunter: 1, witch: 1, armor: 1, joker: 0 },
      players: {
        host: { id: 'host', socketId: 'socket-host' }
      }
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.updateRoleConfig({ roomCode: 'ABCD', playerId: 'host', config: { werewolf: 0 } });

    expect(room.roleConfig.werewolf).toBe(2);
    expect(broadcastRoom).not.toHaveBeenCalled();
  });

  test('resumePlayer rejects invalid resume tokens', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'lobby',
      players: {
        p1: { id: 'p1', name: 'Player', connected: true, socketId: 'socket-old', resumeToken: 'good-token' }
      }
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);
    const cb = jest.fn();

    handlers.resumePlayer({ roomCode: 'ABCD', playerId: 'p1', resumeToken: 'bad-token', name: 'Player' }, cb);

    expect(cb).toHaveBeenCalledWith({ error: 'Invalid session' });
    expect(room.players.p1.socketId).toBe('socket-old');
    expect(room.players.p1.connected).toBe(true);
  });

  test('submitWolfVote rejects socket impersonation', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'wolves',
      players: {
        w1: { id: 'w1', role: 'werewolf', alive: true, socketId: 'socket-2' },
        v1: { id: 'v1', role: 'villager', alive: true }
      },
      wolfVotes: { w1: '' }
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitWolfVote({ roomCode: 'ABCD', playerId: 'w1', targetId: 'v1' });

    expect(room.wolfVotes.w1).toBe('');
    expect(tryFinalizeWolfVote).not.toHaveBeenCalled();
    expect(broadcastRoom).not.toHaveBeenCalled();
  });
});

describe('socketHandlers mechanics guards', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('seer cannot inspect themselves', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'seer',
      players: {
        seer: { id: 'seer', role: 'seer', alive: true, socketId: 'socket-1', seerResult: null },
        v1: { id: 'v1', role: 'villager', alive: true }
      }
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitSeerInspect({ roomCode: 'ABCD', playerId: 'seer', targetId: 'seer' });

    expect(room.players.seer.seerResult).toBeNull();
    expect(advanceNightStep).not.toHaveBeenCalled();
  });

  test('seer cannot inspect dead players', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'seer',
      players: {
        seer: { id: 'seer', role: 'seer', alive: true, socketId: 'socket-1', seerResult: null },
        dead: { id: 'dead', role: 'villager', alive: false }
      }
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitSeerInspect({ roomCode: 'ABCD', playerId: 'seer', targetId: 'dead' });

    expect(room.players.seer.seerResult).toBeNull();
    expect(advanceNightStep).not.toHaveBeenCalled();
  });

  test('day votes are locked after submission', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      players: {
        p1: { id: 'p1', role: 'villager', alive: true, socketId: 'socket-1' },
        p2: { id: 'p2', role: 'villager', alive: true }
      },
      voteState: { votes: { p1: 'p2' }, revoteFromTie: null }
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitDayVote({ roomCode: 'ABCD', playerId: 'p1', targetId: null });

    expect(room.voteState.votes.p1).toBe('p2');
    expect(broadcastRoom).not.toHaveBeenCalled();
  });

  test('host can finalize day vote early', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
        joker: { id: 'joker', role: 'joker', alive: true }
      },
      voteState: { votes: { host: 'joker' }, revoteFromTie: null },
      winner: null,
      logs: []
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostFinalizeDayVote({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.winner).toEqual({
      team: 'joker',
      reason: 'Joker was voted out and laughs last!'
    });
  });
});

describe('socketHandlers restartGame', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('restart only works for the host when the game ended', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'ended',
      phaseStep: 'transition',
      dayCount: 3,
      players: {
        host: {
          id: 'host',
          role: 'werewolf',
          team: 'wolves',
          alive: false,
          socketId: 'socket-1',
          voteTarget: 'p2',
          nightAction: { vote: 'p2' },
          ready: true,
          seerResult: { name: 'p2', result: 'Werewolf' }
        },
        p2: {
          id: 'p2',
          role: 'villager',
          team: 'village',
          alive: false,
          voteTarget: 'host',
          nightAction: null,
          ready: true,
          seerResult: null
        }
      },
      lovers: { aId: 'host', bId: 'p2' },
      witchState: { healAvailable: false, poisonAvailable: false },
      wolfVotes: { host: 'p2' },
      wolfTarget: 'p2',
      healedTarget: 'host',
      poisonTarget: 'p2',
      seerActed: true,
      voteState: { votes: { host: 'p2' }, revoteFromTie: ['p2'] },
      pendingDeaths: [{ playerId: 'p2', reason: 'executed by vote' }],
      winner: { team: 'wolves', reason: 'Werewolves reached parity.' },
      lastNightDeaths: [{ name: 'p2', role: 'villager' }],
      lastDayDeaths: [{ name: 'host', role: 'werewolf' }],
      lastDayMessage: 'Someone died.',
      awaitingHunterShot: 'host',
      logs: [{ ts: 1, text: 'old log', publicText: null }],
      nextNightStep: 'resolve',
      phaseTransition: 'dayToNight',
      phaseTimer: 1,
      transitionTimer: 2,
      hunterShotTimer: 3,
      hunterShotQueue: ['hunter']
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.restartGame({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.phase).toBe('lobby');
    expect(room.phaseStep).toBeNull();
    expect(room.dayCount).toBe(0);
    expect(room.lovers).toBeNull();
    expect(room.witchState).toEqual({ healAvailable: true, poisonAvailable: true });
    expect(room.wolfVotes).toEqual({});
    expect(room.wolfTarget).toBeNull();
    expect(room.healedTarget).toBeNull();
    expect(room.poisonTarget).toBeNull();
    expect(room.seerActed).toBe(false);
    expect(room.voteState).toEqual({ votes: {}, revoteFromTie: null });
    expect(room.pendingDeaths).toEqual([]);
    expect(room.winner).toBeNull();
    expect(room.lastNightDeaths).toEqual([]);
    expect(room.lastDayDeaths).toEqual([]);
    expect(room.lastDayMessage).toBeNull();
    expect(room.awaitingHunterShot).toBeNull();
    expect(room.nextNightStep).toBeNull();
    expect(room.phaseTransition).toBeNull();
    expect(room.phaseTimer).toBeNull();
    expect(room.transitionTimer).toBeNull();
    expect(room.hunterShotTimer).toBeNull();
    expect(room.hunterShotQueue).toEqual([]);
    expect(room.logs[room.logs.length - 1].text).toBe('Game reset. Back to lobby.');
    Object.values(room.players).forEach((player) => {
      expect(player.role).toBeNull();
      expect(player.team).toBeNull();
      expect(player.alive).toBe(true);
      expect(player.voteTarget).toBeNull();
      expect(player.nightAction).toBeNull();
      expect(player.ready).toBe(false);
      expect(player.seerResult).toBeNull();
    });
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
  });

  test('restart is ignored for non-ended games', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      dayCount: 2,
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' }
      },
      logs: []
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.restartGame({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.phase).toBe('day');
    expect(broadcastRoom).not.toHaveBeenCalled();
  });

  test('restart is ignored for non-hosts', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'ended',
      phaseStep: null,
      dayCount: 1,
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-host' },
        other: { id: 'other', role: 'villager', alive: true, socketId: 'socket-1' }
      },
      logs: []
    } as unknown as Room;
    (getRoom as jest.Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.restartGame({ roomCode: 'ABCD', playerId: 'other' });

    expect(room.phase).toBe('ended');
    expect(broadcastRoom).not.toHaveBeenCalled();
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
      phase: 'day',
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
    expect(resolveDeaths).toHaveBeenCalledWith(room, 'day', expect.any(Function), io);
    expect(startNextHunterShot).toHaveBeenCalledWith(room, expect.any(Function), io);
    expect(holdDayToNightTransition).toHaveBeenCalledWith(room, expect.any(Function));
  });
});
