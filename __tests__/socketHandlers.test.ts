import { createRoom, getRoom, deleteRoom } from '../server/src/models/room';
import {
  broadcastRoom,
  sendStateToPlayer,
  notifyAdminObserversRoomClosed,
} from '../server/src/managers/broadcastManager';
import {
  scheduleNightStep,
  schedulePhaseTransition,
  startNight,
  advanceFromReveal,
  advanceFromMayor,
  holdDayToNightTransition,
} from '../server/src/managers/phaseManager';
import {
  tryFinalizeWolfVote,
  advanceNightStep,
  handleWitchDecision,
} from '../server/src/managers/nightManager';
import { tryResolveDayVote } from '../server/src/managers/voteManager';
import {
  queueDeath,
  resolveDeaths,
  startNextHunterShot,
  checkWinners,
} from '../server/src/managers/deathManager';
import { startNextMayorSelection, tryResolveMayorVote } from '../server/src/managers/mayorManager';
import { setupSocketHandlers } from '../server/src/handlers/socketHandlers';
import { setSocketIndex, getSocketIndex, deleteSocketIndex } from '../server/src/models/player';
import type { Room } from '../core/src/types';
import type { Mock } from 'vitest';

vi.mock('../server/src/models/room', () => ({
  createRoom: vi.fn(),
  getRoom: vi.fn(),
  getAllRooms: vi.fn(),
  deleteRoom: vi.fn(),
}));

vi.mock('../server/src/managers/broadcastManager', () => ({
  broadcastRoom: vi.fn(),
  sendStateToPlayer: vi.fn(),
  notifyAdminObserversRoomClosed: vi.fn(),
}));

vi.mock('../server/src/managers/phaseManager', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../server/src/managers/phaseManager');
  return {
    ...actual,
    schedulePhaseTransition: vi.fn(),
    holdDayToNightTransition: vi.fn(),
    advanceFromReveal: vi.fn(),
    advanceFromMayor: vi.fn(),
    startNight: vi.fn(),
    notifyLovers: vi.fn(),
    scheduleNightStep: vi.fn(),
  };
});

vi.mock('../server/src/managers/nightManager', () => ({
  tryFinalizeWolfVote: vi.fn(),
  advanceNightStep: vi.fn(),
  handleWitchDecision: vi.fn(),
}));

vi.mock('../server/src/managers/voteManager', async () => {
  const actual = await vi.importActual<typeof import('../server/src/managers/voteManager')>(
    '../server/src/managers/voteManager'
  );
  return {
    ...actual,
    tryResolveDayVote: vi.fn(actual.tryResolveDayVote),
  };
});

vi.mock('../server/src/managers/deathManager', () => ({
  queueDeath: vi.fn(),
  resolveDeaths: vi.fn(),
  startNextHunterShot: vi.fn(),
  checkWinners: vi.fn(),
}));

vi.mock('../server/src/managers/mayorManager', () => ({
  startNextMayorSelection: vi.fn(),
  startMayorSelection: vi.fn(),
  tryResolveMayorVote: vi.fn(),
}));

const makeSocket = () => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const socket = {
    id: 'socket-1',
    emit: vi.fn(),
    on: (event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handler;
    },
  };
  return { handlers, socket };
};

const makeIo = () => {
  const sockets = new Map<string, { disconnect: Mock }>();
  const io = {
    sockets: {
      get: (id: string) => sockets.get(id),
    },
  } as unknown as any;
  return { io, sockets };
};

describe('socketHandlers host handoff', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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
        owner: {
          id: 'owner',
          name: 'Owner',
          isHost: true,
          connected: true,
          socketId: 'socket-owner',
          resumeToken: 'token-owner',
        },
        peer: { id: 'peer', name: 'Peer', isHost: false, connected: true, socketId: 'socket-peer' },
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);

    const { handlers, socket } = makeSocket();
    socket.id = 'socket-owner';
    setSocketIndex('socket-owner', room.code, 'owner');
    setupSocketHandlers(io, socket as any);

    handlers.disconnect();
    vi.runAllTimers();

    expect(room.hostId).toBe('peer');

    const { handlers: handlers2, socket: socket2 } = makeSocket();
    socket2.id = 'socket-owner-2';
    setupSocketHandlers(io, socket2 as any);

    handlers2.resumePlayer(
      { roomCode: 'ABCD', playerId: 'owner', resumeToken: 'token-owner', name: 'Owner' },
      vi.fn()
    );

    expect(room.hostId).toBe('owner');
  });
});

describe('socketHandlers resumePlayer socket handoff', () => {
  afterEach(() => {
    deleteSocketIndex('socket-old');
    deleteSocketIndex('socket-new');
  });

  test('disconnects previous socket and rebinds player on resume', () => {
    const room = {
      code: 'ABCD',
      hostId: 'p1',
      phase: 'lobby',
      players: {
        p1: {
          id: 'p1',
          name: 'Player 1',
          connected: true,
          socketId: 'socket-old',
          resumeToken: 'resume-token',
          isHost: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);

    const { io, sockets } = makeIo();
    const previousSocket = { disconnect: vi.fn() };
    sockets.set('socket-old', previousSocket);
    setSocketIndex('socket-old', room.code, 'p1');

    const { handlers, socket } = makeSocket();
    socket.id = 'socket-new';
    setupSocketHandlers(io, socket as any);
    const cb = vi.fn();

    handlers.resumePlayer({ roomCode: room.code, playerId: 'p1', resumeToken: 'resume-token' }, cb);

    expect(previousSocket.disconnect).toHaveBeenCalledWith(true);
    expect(room.players.p1.socketId).toBe('socket-new');
    expect(room.players.p1.connected).toBe(true);
    expect(cb).toHaveBeenCalledWith({ ok: true });
  });
});

describe('socketHandlers room entry and state events', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  afterEach(() => {
    deleteSocketIndex('socket-1');
    deleteSocketIndex('socket-joiner');
  });

  test('createRoom returns room/player info and indexes socket', () => {
    const room = {
      code: 'WOLF',
      players: {},
      voteState: { votes: {}, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    const player = { id: 'host-1', resumeToken: 'resume-host' };
    (createRoom as Mock).mockReturnValue({ room, player });
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);
    const cb = vi.fn();

    handlers.createRoom({ name: 'Host' }, cb);

    expect(cb).toHaveBeenCalledWith({
      roomCode: 'WOLF',
      playerId: 'host-1',
      resumeToken: 'resume-host',
    });
    expect(getSocketIndex('socket-1')).toEqual({ roomCode: 'WOLF', playerId: 'host-1' });
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
  });

  test('joinRoom adds a player in lobby rooms', () => {
    const room = {
      code: 'ABCD',
      phase: 'lobby',
      hostId: 'host',
      players: {
        host: { id: 'host', name: 'Host', connected: true, socketId: 'socket-host', isHost: true },
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    socket.id = 'socket-joiner';
    setupSocketHandlers(io, socket as any);
    const cb = vi.fn();

    handlers.joinRoom({ name: 'Alice', code: 'abcd' }, cb);

    expect(cb).toHaveBeenCalledWith({
      roomCode: 'ABCD',
      playerId: 'mock-id',
      resumeToken: 'mock-id',
    });
    expect(room.players['mock-id']).toBeDefined();
    expect(room.players['mock-id'].name).toBe('Alice');
    expect(getSocketIndex('socket-joiner')).toEqual({ roomCode: 'ABCD', playerId: 'mock-id' });
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
  });

  test('leaveRoom removes player and related references', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Alice',
          role: 'guard',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      mayorId: 'p1',
      awaitingHunterShot: 'p1',
      awaitingMayorSelection: 'p1',
      wolfTarget: 'p1',
      healedTarget: 'p1',
      poisonTarget: 'p1',
      guardedTarget: 'p1',
      lastGuardedTarget: 'p1',
      lovers: { aId: 'p1', bId: 'host' },
      hunterShotQueue: ['p1', 'host'],
      mayorSelectionQueue: ['p1', 'host'],
      wolfVotes: { p1: 'host' },
      voteState: { votes: { p1: 'host' }, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);
    const cb = vi.fn();

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, cb);

    expect(room.players.p1).toBeUndefined();
    expect(room.mayorId).toBeNull();
    expect(room.awaitingHunterShot).toBeNull();
    expect(room.awaitingMayorSelection).toBeNull();
    expect(room.wolfTarget).toBeNull();
    expect(room.healedTarget).toBeNull();
    expect(room.poisonTarget).toBeNull();
    expect(room.guardedTarget).toBeNull();
    expect(room.lastGuardedTarget).toBeNull();
    expect(room.lovers).toBeNull();
    expect(room.hunterShotQueue).toEqual(['host']);
    expect(room.mayorSelectionQueue).toEqual(['host']);
    expect(room.wolfVotes.p1).toBeUndefined();
    expect(room.voteState.votes.p1).toBeUndefined();
    expect(cb).toHaveBeenCalledWith({ ok: true });
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
  });

  test('leaveRoom advances night step when active seer leaves', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'seer',
      phaseTransition: null,
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Seer',
          role: 'seer',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      mayorId: null,
      awaitingHunterShot: null,
      awaitingMayorSelection: null,
      wolfTarget: null,
      healedTarget: null,
      poisonTarget: null,
      guardedTarget: null,
      lovers: null,
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      wolfVotes: {},
      voteState: { votes: {}, revoteFromTie: null },
      seerActed: false,
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, vi.fn());

    expect(room.seerActed).toBe(true);
    expect(room.seerAwaitingDismiss).toBe(false);
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'witch', expect.any(Function), io);
  });

  test('leaveRoom clears hunter prompt timer and processes pending queues', () => {
    const timer = setTimeout(() => undefined, 60000);
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'resolve',
      phaseTransition: null,
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Hunter',
          role: 'hunter',
          socketId: 'socket-1',
          connected: true,
          alive: false,
        },
      },
      mayorId: null,
      awaitingHunterShot: 'p1',
      hunterShotTimer: timer,
      hunterShotEndsAt: Date.now() + 1000,
      awaitingMayorSelection: null,
      wolfTarget: null,
      healedTarget: null,
      poisonTarget: null,
      guardedTarget: null,
      lovers: null,
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      wolfVotes: {},
      voteState: { votes: {}, revoteFromTie: null },
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    (startNextHunterShot as Mock).mockReturnValue(false);
    (startNextMayorSelection as Mock).mockReturnValue(false);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, vi.fn());

    expect(room.awaitingHunterShot).toBeNull();
    expect(room.hunterShotTimer).toBeNull();
    expect(room.hunterShotEndsAt).toBeNull();
    expect(startNextHunterShot).toHaveBeenCalledWith(room, expect.any(Function), io);
    expect(startNextMayorSelection).toHaveBeenCalledWith(room, expect.any(Function), io);
    clearTimeout(timer);
  });

  test('leaveRoom returns early in lobby phase', () => {
    vi.clearAllMocks();
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'lobby',
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Alice',
          role: 'villager',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);
    const cb = vi.fn();

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, cb);

    expect(cb).toHaveBeenCalledWith({ ok: true });
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
    expect(checkWinners).not.toHaveBeenCalled();
  });

  test('leaveRoom returns early when room becomes empty', () => {
    vi.clearAllMocks();
    const room = {
      code: 'ABCD',
      hostId: 'p1',
      phase: 'day',
      phaseTransition: null,
      players: {
        p1: {
          id: 'p1',
          name: 'Solo',
          role: 'villager',
          socketId: 'socket-1',
          connected: true,
          alive: true,
          isHost: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);
    const cb = vi.fn();

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, cb);

    expect(Object.keys(room.players)).toEqual([]);
    expect(cb).toHaveBeenCalledWith({ ok: true });
    // Empty room is torn down (observers notified + room deleted), not broadcast.
    expect(notifyAdminObserversRoomClosed).toHaveBeenCalledWith(room.code, io);
    expect(deleteRoom).toHaveBeenCalledWith(room.code);
    expect(broadcastRoom).not.toHaveBeenCalled();
    expect(checkWinners).not.toHaveBeenCalled();
  });

  test('leaveRoom stops when winner is detected after removal', () => {
    vi.clearAllMocks();
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseTransition: null,
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Alice',
          role: 'villager',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    (checkWinners as Mock).mockImplementationOnce((target: Room) => {
      target.winner = { team: 'village', reason: 'All Werewolves are dead.' };
    });
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);
    const cb = vi.fn();

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, cb);

    expect(checkWinners).toHaveBeenCalledWith(room);
    expect(tryResolveDayVote).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith({ ok: true });
  });

  test('leaveRoom continues mayor phase vote resolution', () => {
    vi.clearAllMocks();
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'mayor',
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Alice',
          role: 'villager',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, vi.fn());

    expect(tryResolveMayorVote).toHaveBeenCalledWith(room, expect.any(Function));
  });

  test('leaveRoom advances wolves step when a werewolf leaves', () => {
    vi.clearAllMocks();
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'wolves',
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Wolf',
          role: 'werewolf',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, vi.fn());

    expect(tryFinalizeWolfVote).toHaveBeenCalledWith(room, expect.any(Function), io, {
      allowNoKill: true,
    });
  });

  test('leaveRoom advances from witch and armor roles correctly', () => {
    vi.clearAllMocks();
    const witchRoom = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'witch',
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Witch',
          role: 'witch',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValueOnce(witchRoom);
    setSocketIndex('socket-1', witchRoom.code, 'p1');
    const first = makeSocket();
    setupSocketHandlers(io, first.socket as any);
    first.handlers.leaveRoom({ roomCode: witchRoom.code, playerId: 'p1' }, vi.fn());
    expect(scheduleNightStep).toHaveBeenCalledWith(witchRoom, 'guard', expect.any(Function), io);

    const armorRoom = {
      code: 'EFGH',
      hostId: 'host',
      phase: 'armor',
      phaseStep: null,
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p2: {
          id: 'p2',
          name: 'Armor',
          role: 'armor',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValueOnce(armorRoom);
    setSocketIndex('socket-1', armorRoom.code, 'p2');
    const second = makeSocket();
    setupSocketHandlers(io, second.socket as any);
    second.handlers.leaveRoom({ roomCode: armorRoom.code, playerId: 'p2' }, vi.fn());
    expect(schedulePhaseTransition).toHaveBeenCalledWith(
      armorRoom,
      'postArmor',
      expect.any(Function)
    );
  });

  test('leaveRoom advances from guard step when guard leaves', () => {
    vi.clearAllMocks();
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'guard',
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Guard',
          role: 'guard',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      guardActed: false,
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, vi.fn());

    expect(room.guardActed).toBe(true);
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'harlot', expect.any(Function), io);
  });

  test('leaveRoom advances from harlot step when harlot leaves', () => {
    vi.clearAllMocks();
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'harlot',
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Harlot',
          role: 'harlot',
          socketId: 'socket-1',
          connected: true,
          alive: true,
        },
      },
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      harlotActed: false,
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, vi.fn());

    expect(room.harlotActed).toBe(true);
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'resolve', expect.any(Function), io);
  });

  test('leaveRoom clears mayor selection timer and processes remaining queues', () => {
    vi.clearAllMocks();
    const timer = setTimeout(() => undefined, 60000);
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      phaseTransition: null,
      players: {
        host: { id: 'host', name: 'Host', socketId: 'socket-host', connected: true, isHost: true },
        p1: {
          id: 'p1',
          name: 'Mayor',
          role: 'villager',
          socketId: 'socket-1',
          connected: true,
          alive: false,
        },
      },
      mayorId: null,
      awaitingHunterShot: null,
      awaitingMayorSelection: 'p1',
      mayorSelectionTimer: timer,
      hunterShotQueue: [],
      mayorSelectionQueue: [],
      voteState: { votes: {}, revoteFromTie: null },
      wolfVotes: {},
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    (startNextMayorSelection as Mock).mockReturnValue(false);
    (startNextHunterShot as Mock).mockReturnValue(false);
    setSocketIndex('socket-1', room.code, 'p1');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.leaveRoom({ roomCode: room.code, playerId: 'p1' }, vi.fn());

    expect(room.awaitingMayorSelection).toBeNull();
    expect(room.mayorSelectionTimer).toBeNull();
    expect(startNextMayorSelection).toHaveBeenCalledWith(room, expect.any(Function), io);
    expect(startNextHunterShot).toHaveBeenCalledWith(room, expect.any(Function), io);
    clearTimeout(timer);
  });

  test('requestState sends sanitized state to requesting player', () => {
    const player = { id: 'p1' };
    const room = {
      code: 'ABCD',
      players: { p1: player },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.requestState({ roomCode: 'ABCD', playerId: 'p1' });

    expect(sendStateToPlayer).toHaveBeenCalledWith(room, player, io);
  });
});

describe('socketHandlers hostSkipStep', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    vi.clearAllMocks();
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
        v1: { id: 'v1', role: 'villager', alive: true },
      },
      wolfVotes: { w1: null, w2: null },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.wolfVotes).toEqual({ w1: null, w2: null });
    expect(tryFinalizeWolfVote).toHaveBeenCalledWith(room, expect.any(Function), io, {
      allowNoKill: true,
    });
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
        v1: { id: 'v1', role: 'villager', alive: true },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
        v1: { id: 'v1', role: 'villager', alive: true },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(handleWitchDecision).toHaveBeenCalledWith(
      room,
      null,
      'skip',
      null,
      expect.any(Function),
      io
    );
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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.phaseStep).toBe('seer');
    expect(room.nextNightStep).toBeNull();
    expect(advanceNightStep).toHaveBeenCalledWith(room, expect.any(Function), io);
  });

  test('allows changing wolf votes', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'wolves',
      players: {
        w1: { id: 'w1', role: 'werewolf', alive: true, socketId: 'socket-1' },
        v1: { id: 'v1', role: 'villager', alive: true },
        v2: { id: 'v2', role: 'villager', alive: true },
      },
      wolfVotes: { w1: 'v1' },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitWolfVote({ roomCode: 'ABCD', playerId: 'w1', targetId: 'v2' });

    expect(room.wolfVotes.w1).toBe('v2');
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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      voteState: { votes: { a: 'b' }, revoteFromTie: ['b'] },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(advanceFromReveal).toHaveBeenCalledWith(room, expect.any(Function));
  });

  test('host skips phase transition post mayor', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'mayor',
      phaseStep: null,
      phaseTransition: 'postMayor',
      nextNightStep: null,
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(advanceFromMayor).toHaveBeenCalledWith(room, expect.any(Function));
  });

  test('host skips phase transition post armor', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'armor',
      phaseStep: null,
      phaseTransition: 'postArmor',
      nextNightStep: null,
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(startNight).toHaveBeenCalledWith(room);
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
  });

  test('host skip in mayor phase resolves vote early', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'mayor',
      phaseStep: null,
      phaseTransition: null,
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      voteState: { votes: {}, revoteFromTie: null },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(tryResolveMayorVote).toHaveBeenCalledWith(room, expect.any(Function), {
      allowEarly: true,
    });
  });

  test('host skip in armor phase schedules post-armor transition', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'armor',
      phaseStep: null,
      phaseTransition: null,
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(schedulePhaseTransition).toHaveBeenCalledWith(room, 'postArmor', expect.any(Function));
    expect(room.logs.some((entry) => entry.text.includes('Armor selection skipped'))).toBe(true);
  });

  test('host skips wolves step with no living wolves and advances to seer', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'wolves',
      phaseTransition: null,
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      wolfTarget: 'someone',
      wolfVotes: {},
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.wolfTarget).toBeNull();
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'seer', expect.any(Function), io);
    expect(tryFinalizeWolfVote).not.toHaveBeenCalled();
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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      winner: null,
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    (startNextHunterShot as Mock).mockReturnValue(false);
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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      winner: null,
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    (startNextHunterShot as Mock).mockReturnValueOnce(true);
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

  test('host skips awaiting mayor selection and advances the phase', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      phaseTransition: null,
      awaitingMayorSelection: 'mayor',
      mayorSelectionTimer: 123,
      mayorSelectionQueue: [],
      awaitingHunterShot: null,
      hunterShotQueue: [],
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      winner: null,
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    (startNextMayorSelection as Mock).mockReturnValue(false);
    (startNextHunterShot as Mock).mockReturnValue(false);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.awaitingMayorSelection).toBeNull();
    expect(room.mayorSelectionTimer).toBeNull();
    expect(startNextMayorSelection).toHaveBeenCalledWith(room, expect.any(Function), io);
    expect(checkWinners).toHaveBeenCalledWith(room);
    expect(holdDayToNightTransition).toHaveBeenCalledWith(room, expect.any(Function));
  });

  test('host skips awaiting mayor selection and starts next mayor selection', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      phaseTransition: null,
      awaitingMayorSelection: 'mayor1',
      mayorSelectionTimer: 456,
      mayorSelectionQueue: ['mayor2'],
      awaitingHunterShot: null,
      hunterShotQueue: [],
      players: {
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      winner: null,
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    (startNextMayorSelection as Mock).mockReturnValueOnce(true);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostSkipStep({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.awaitingMayorSelection).toBeNull();
    expect(room.mayorSelectionTimer).toBeNull();
    expect(startNextMayorSelection).toHaveBeenCalledWith(room, expect.any(Function), io);
    expect(checkWinners).not.toHaveBeenCalled();
    expect(schedulePhaseTransition).not.toHaveBeenCalled();
    expect(holdDayToNightTransition).not.toHaveBeenCalled();
  });
});

describe('socketHandlers disconnect vote resolution', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    deleteSocketIndex('socket-1');
  });

  afterEach(() => {
    vi.useRealTimers();
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
        host: { id: 'host', alive: true, connected: true, socketId: 'socket-1' },
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'host');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.disconnect();
    vi.runAllTimers();

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
        host: { id: 'host', alive: true, connected: true, socketId: 'socket-1' },
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'host');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.disconnect();
    vi.runAllTimers();

    expect(tryResolveDayVote).not.toHaveBeenCalled();
  });

  test('resolves day vote when alive player disconnects without pending blockers', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      phaseTransition: null,
      awaitingHunterShot: null,
      players: {
        host: { id: 'host', alive: true, connected: true, socketId: 'socket-1' },
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'host');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.disconnect();
    vi.runAllTimers();

    expect(tryResolveDayVote).toHaveBeenCalledWith(room, expect.any(Function), io);
  });

  test('resolves mayor vote when alive player disconnects during mayor phase', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'mayor',
      phaseStep: null,
      phaseTransition: null,
      awaitingHunterShot: null,
      players: {
        host: { id: 'host', alive: true, connected: true, socketId: 'socket-1' },
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    setSocketIndex('socket-1', room.code, 'host');
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.disconnect();
    vi.runAllTimers();

    expect(tryResolveMayorVote).toHaveBeenCalledWith(room, expect.any(Function));
  });
});

describe('socketHandlers hostProceedToNight', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('holds day-to-night transition when vote is resolved and no winner exists', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      dayVoteResolved: true,
      players: {
        host: { id: 'host', socketId: 'socket-1' },
      },
      winner: null,
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    (checkWinners as Mock).mockImplementation(() => {
      room.winner = null;
    });
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostProceedToNight({ roomCode: room.code, playerId: 'host' });

    expect(checkWinners).toHaveBeenCalledWith(room);
    expect(holdDayToNightTransition).toHaveBeenCalledWith(room, expect.any(Function));
    expect(broadcastRoom).not.toHaveBeenCalled();
  });

  test('does not transition when game already has a winner', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      dayVoteResolved: true,
      players: {
        host: { id: 'host', socketId: 'socket-1' },
      },
      winner: { team: 'wolves', reason: 'Werewolves already won.' },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostProceedToNight({ roomCode: room.code, playerId: 'host' });

    expect(checkWinners).not.toHaveBeenCalled();
    expect(holdDayToNightTransition).not.toHaveBeenCalled();
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
  });

  test('does not transition when winner is detected during pre-night check', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      dayVoteResolved: true,
      players: {
        host: { id: 'host', socketId: 'socket-1' },
      },
      winner: null,
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    (checkWinners as Mock).mockImplementation(() => {
      room.winner = { team: 'wolves', reason: 'Werewolves reached parity.' };
    });
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostProceedToNight({ roomCode: room.code, playerId: 'host' });

    expect(checkWinners).toHaveBeenCalledWith(room);
    expect(holdDayToNightTransition).not.toHaveBeenCalled();
    expect(broadcastRoom).toHaveBeenCalledWith(room, io);
  });
});

describe('socketHandlers hostFinalizeMayorVote', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('allows host to finalize mayor vote early', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'mayor',
      players: {
        host: { id: 'host', socketId: 'socket-1' },
      },
      voteState: { votes: {}, revoteFromTie: null },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostFinalizeMayorVote({ roomCode: 'ABCD', playerId: 'host' });

    expect(tryResolveMayorVote).toHaveBeenCalledWith(room, expect.any(Function), {
      allowEarly: true,
    });
  });
});

describe('socketHandlers security checks', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('updateRoleConfig ignores host actions from other sockets', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'lobby',
      minPlayers: 5,
      roleConfig: { werewolf: 2, seer: 1, hunter: 1, witch: 1, armor: 1, joker: 0 },
      players: {
        host: { id: 'host', socketId: 'socket-host' },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
        p1: {
          id: 'p1',
          name: 'Player',
          connected: true,
          socketId: 'socket-old',
          resumeToken: 'good-token',
        },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);
    const cb = vi.fn();

    handlers.resumePlayer(
      { roomCode: 'ABCD', playerId: 'p1', resumeToken: 'bad-token', name: 'Player' },
      cb
    );

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'server.errors.invalidSession',
        message: { key: 'server.errors.invalidSession' },
      })
    );
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
        v1: { id: 'v1', role: 'villager', alive: true },
      },
      wolfVotes: { w1: '' },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
    vi.clearAllMocks();
  });

  test('seer cannot inspect themselves', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'seer',
      players: {
        seer: { id: 'seer', role: 'seer', alive: true, socketId: 'socket-1', seerResult: null },
        v1: { id: 'v1', role: 'villager', alive: true },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
        dead: { id: 'dead', role: 'villager', alive: false },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitSeerInspect({ roomCode: 'ABCD', playerId: 'seer', targetId: 'dead' });

    expect(room.players.seer.seerResult).toBeNull();
    expect(advanceNightStep).not.toHaveBeenCalled();
  });

  test('valid seer inspect sets result and awaits dismiss without advancing', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'seer',
      players: {
        seer: {
          id: 'seer',
          role: 'seer',
          alive: true,
          socketId: 'socket-1',
          seerResult: null,
        },
        wolf: { id: 'wolf', name: 'Wolf', role: 'werewolf', alive: true },
      },
      seerActed: false,
      seerAwaitingDismiss: false,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitSeerInspect({ roomCode: 'ABCD', playerId: 'seer', targetId: 'wolf' });

    expect(room.players.seer.seerResult).toEqual({ name: 'Wolf', result: 'Werewolf' });
    expect(room.seerActed).toBe(true);
    expect(room.seerAwaitingDismiss).toBe(true);
    expect(advanceNightStep).not.toHaveBeenCalled();
  });

  test('seerContinue clears flag and advances night step', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'night',
      phaseStep: 'seer',
      players: {
        seer: { id: 'seer', role: 'seer', alive: true, socketId: 'socket-1', seerResult: null },
      },
      seerActed: true,
      seerAwaitingDismiss: true,
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.seerContinue({ roomCode: 'ABCD', playerId: 'seer' });

    expect(room.seerAwaitingDismiss).toBe(false);
    expect(advanceNightStep).toHaveBeenCalledWith(room, expect.any(Function), io);
  });

  test('day votes are locked after submission', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      phaseStep: null,
      players: {
        p1: { id: 'p1', role: 'villager', alive: true, socketId: 'socket-1' },
        p2: { id: 'p2', role: 'villager', alive: true },
      },
      voteState: { votes: { p1: 'p2' }, revoteFromTie: null },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
        joker: { id: 'joker', role: 'joker', alive: true },
      },
      voteState: { votes: { host: 'joker' }, revoteFromTie: null },
      winner: null,
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.hostFinalizeDayVote({ roomCode: 'ABCD', playerId: 'host' });

    expect(room.winner).toEqual({
      team: 'joker',
      reason: 'Joker was voted out and laughs last!',
    });
  });

  test('mayor votes reject targets outside the revote list', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'mayor',
      phaseStep: null,
      phaseTransition: null,
      mayorId: null,
      players: {
        p1: { id: 'p1', role: 'villager', alive: true, socketId: 'socket-1' },
        p2: { id: 'p2', role: 'villager', alive: true },
        p3: { id: 'p3', role: 'villager', alive: true },
      },
      voteState: { votes: {}, revoteFromTie: ['p2'] },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitMayorVote({ roomCode: 'ABCD', playerId: 'p1', targetId: 'p3' });

    expect(room.voteState.votes.p1).toBeUndefined();
    expect(tryResolveMayorVote).not.toHaveBeenCalled();
    expect(broadcastRoom).not.toHaveBeenCalled();
  });

  test('mayor votes reject dead targets', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'mayor',
      phaseStep: null,
      phaseTransition: null,
      mayorId: null,
      players: {
        p1: { id: 'p1', role: 'villager', alive: true, socketId: 'socket-1' },
        p2: { id: 'p2', role: 'villager', alive: false },
      },
      voteState: { votes: {}, revoteFromTie: null },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
    const { handlers, socket } = makeSocket();
    setupSocketHandlers(io, socket as any);

    handlers.submitMayorVote({ roomCode: 'ABCD', playerId: 'p1', targetId: 'p2' });

    expect(room.voteState.votes.p1).toBeUndefined();
    expect(tryResolveMayorVote).not.toHaveBeenCalled();
    expect(broadcastRoom).not.toHaveBeenCalled();
  });
});

describe('socketHandlers restartGame', () => {
  const io = { sockets: { sockets: new Map() } } as unknown as any;

  beforeEach(() => {
    vi.clearAllMocks();
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
          ready: true,
          seerResult: { name: 'p2', result: 'Werewolf' },
        },
        p2: {
          id: 'p2',
          role: 'villager',
          team: 'village',
          alive: false,
          ready: true,
          seerResult: null,
        },
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
      mayorId: 'p2',
      awaitingMayorSelection: 'host',
      mayorSelectionQueue: ['p2'],
      mayorSelectionTimer: 9,
      logs: [{ ts: 1, text: 'old log', publicText: null }],
      nextNightStep: 'resolve',
      phaseTransition: 'dayToNight',
      phaseTimer: 1,
      transitionTimer: 2,
      hunterShotTimer: 3,
      hunterShotQueue: ['hunter'],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
    expect(room.mayorId).toBeNull();
    expect(room.awaitingMayorSelection).toBeNull();
    expect(room.mayorSelectionQueue).toEqual([]);
    expect(room.mayorSelectionTimer).toBeNull();
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
        host: { id: 'host', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
        other: { id: 'other', role: 'villager', alive: true, socketId: 'socket-1' },
      },
      logs: [],
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
    vi.clearAllMocks();
  });

  test('hunter can shoot after death when awaitingHunterShot is set', () => {
    const room = {
      code: 'ABCD',
      hostId: 'host',
      phase: 'day',
      awaitingHunterShot: 'hunter',
      players: {
        hunter: { id: 'hunter', role: 'hunter', alive: false, socketId: 'socket1' },
        v1: { id: 'v1', role: 'villager', alive: true },
      },
    } as unknown as Room;
    (getRoom as Mock).mockReturnValue(room);
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
