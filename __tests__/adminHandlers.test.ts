/**
 * Unit tests for admin socket handlers.
 *
 * These tests construct fake `Namespace` / `Socket` shapes (matching the
 * pattern in `socketHandlers.test.ts`) and call `setupAdminSocketHandlers`
 * directly. Room state is constructed by hand.
 *
 * The test file exercises:
 *   - adminListRooms     (empty + with rooms)
 *   - adminKickPlayer    (works in lobby/night/day, denied without token)
 *   - hostMidGameKickPlayer (host + admin required, mid-game works)
 *   - adminJoinRoom      (admin is NOT added to room.players)
 *   - adminLeaveRoom
 */
import type { Mock } from 'vitest';
import { setupAdminSocketHandlers } from '../server/src/handlers/adminSocketHandlers';
import { attachAdminToSocket, _resetAdminAuthWarningForTests } from '../server/src/utils/adminAuth';
import { _resetAdminManagerForTests } from '../server/src/managers/adminManager';
import * as roomsModule from '../server/src/models/room';
import * as playerModule from '../server/src/models/player';
import * as broadcastModule from '../server/src/managers/broadcastManager';
import type { Room } from '../core/src/types';

vi.mock('../server/src/models/room', async () => {
  const actual = await vi.importActual<typeof roomsModule>('../server/src/models/room');
  return {
    ...actual,
    getRoom: vi.fn(actual.getRoom),
    getAllRooms: vi.fn(actual.getAllRooms),
  };
});

vi.mock('../server/src/models/player', async () => {
  const actual = await vi.importActual<typeof playerModule>('../server/src/models/player');
  return {
    ...actual,
    deleteSocketIndex: vi.fn(actual.deleteSocketIndex),
  };
});

vi.mock('../server/src/managers/broadcastManager', async () => {
  const actual = await vi.importActual<typeof broadcastModule>(
    '../server/src/managers/broadcastManager'
  );
  return {
    ...actual,
    broadcastRoom: vi.fn(actual.broadcastRoom),
    broadcastRoomToAdmins: vi.fn(actual.broadcastRoomToAdmins),
  };
});

function makeIo() {
  const sockets = new Map<string, { disconnect: Mock }>();
  const io = {
    sockets: {
      get: (id: string) => sockets.get(id),
    },
  } as unknown as any;
  return { io, sockets };
}

function makeSocket(id: string, admin = false) {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const data: { adminToken?: boolean; roomCode?: string; playerId?: string } = {};
  const socket: any = {
    id,
    data,
    handshake: { auth: {} },
    emit: vi.fn(),
    on: (event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handler;
    },
  };
  if (admin) attachAdminToSocket(socket);
  return { handlers, socket };
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  const now = Date.now();
  return {
    code: 'ABCD',
    hostId: 'host',
    phase: 'lobby',
    phaseStep: null,
    phaseTransition: null,
    dayCount: 0,
    players: {
      host: {
        id: 'host',
        name: 'Host',
        role: null,
        team: null,
        alive: true,
        connected: true,
        socketId: 'socket-host',
        resumeToken: 'tok-host',
        isHost: true,
        ready: false,
        seerResult: null,
      },
      target: {
        id: 'target',
        name: 'Target',
        role: null,
        team: null,
        alive: true,
        connected: true,
        socketId: 'socket-target',
        resumeToken: 'tok-target',
        isHost: false,
        ready: false,
        seerResult: null,
      },
    },
    minPlayers: 5,
    roleConfig: {
      werewolf: 1,
      seer: 1,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0,
      harlot: 0,
    },
    passiveRoleConfig: { mayor: false },
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
    seerAwaitingDismiss: false,
    guardedTarget: null,
    lastGuardedTarget: null,
    guardActed: false,
    harlotVisitedTarget: null,
    harlotActed: false,
    voteState: { votes: {}, revoteFromTie: null },
    pendingDeaths: [],
    winner: null,
    lastNightDeaths: [],
    lastDayDeaths: [],
    lastDayMessage: null,
    lastDayMessageI18n: null,
    awaitingHunterShot: null,
    dayVoteResolved: false,
    logs: [],
    nextNightStep: null,
    transitionTimer: null,
    phaseTimer: null,
    hunterShotTimer: null,
    hunterShotEndsAt: null,
    hunterShotQueue: [],
    createdAt: now,
    lastActivityAt: now,
    ...overrides,
  } as unknown as Room;
}

describe('setupAdminSocketHandlers — adminListRooms', () => {
  beforeEach(() => {
    _resetAdminManagerForTests();
    _resetAdminAuthWarningForTests();
    (roomsModule.getAllRooms as Mock).mockImplementation(() => new Map());
  });

  test('returns empty array when no rooms exist', () => {
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin-1', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminListRooms({}, cb);
    expect(cb).toHaveBeenCalledWith({ rooms: [] });
  });

  test('returns one RoomSummary per existing room', () => {
    const room = makeRoom();
    const map = new Map([[room.code, room]]);
    (roomsModule.getAllRooms as Mock).mockReturnValue(map);

    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin-2', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminListRooms({}, cb);

    const call = cb.mock.calls[0]?.[0] as { rooms: Array<Record<string, unknown>> };
    expect(call.rooms).toHaveLength(1);
    const summary = call.rooms[0]!;
    expect(summary.code).toBe('ABCD');
    expect(summary.phase).toBe('lobby');
    expect(summary.playerCount).toBe(2);
    expect(summary.connectedPlayerCount).toBe(2);
    expect(summary.hostName).toBe('Host');
    // M1 fix: RoomSummary.players must include a sanitized per-player
    // snapshot so the detail view can render the player list without
    // joining as a live observer. `role` is always null (no leaks).
    const players = summary.players as Array<Record<string, unknown>>;
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({
      name: 'Host',
      alive: true,
      connected: true,
      isHost: true,
      role: null,
    });
    expect(players[1]).toMatchObject({
      name: 'Target',
      isHost: false,
      role: null,
    });
    expect(players[0]).toHaveProperty('id');
  });

  test('refuses to list rooms without admin token', () => {
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-no-admin', false);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminListRooms({}, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.adminRequired' })
    );
  });
});

describe('setupAdminSocketHandlers — adminKickPlayer', () => {
  let room: Room;

  beforeEach(() => {
    _resetAdminManagerForTests();
    _resetAdminAuthWarningForTests();
    (broadcastModule.broadcastRoom as Mock).mockClear();
    (broadcastModule.broadcastRoomToAdmins as Mock).mockClear();
    (playerModule.deleteSocketIndex as Mock).mockClear();
  });

  test('kicks a player in lobby phase', () => {
    room = makeRoom();
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io, sockets } = makeIo();
    const targetSocket = { disconnect: vi.fn() };
    sockets.set('socket-target', targetSocket);

    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminKickPlayer({ roomCode: 'ABCD', targetId: 'target' }, cb);

    expect(cb).toHaveBeenCalledWith({ ok: true });
    expect(room.players.target).toBeUndefined();
    expect(targetSocket.disconnect).toHaveBeenCalledWith(true);
    expect(broadcastModule.broadcastRoom).toHaveBeenCalled();
  });

  test('kicks a player during night phase', () => {
    room = makeRoom({
      phase: 'night',
      phaseStep: 'wolves',
    });
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io, sockets } = makeIo();
    const targetSocket = { disconnect: vi.fn() };
    sockets.set('socket-target', targetSocket);

    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminKickPlayer({ roomCode: 'ABCD', targetId: 'target' }, cb);

    expect(cb).toHaveBeenCalledWith({ ok: true });
    expect(room.players.target).toBeUndefined();
    expect(room.phase).toBe('night'); // phase must not change
  });

  test('kicks a player during day phase', () => {
    room = makeRoom({ phase: 'day', dayCount: 1 });
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io, sockets } = makeIo();
    sockets.set('socket-target', { disconnect: vi.fn() });

    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminKickPlayer({ roomCode: 'ABCD', targetId: 'target' }, cb);

    expect(cb).toHaveBeenCalledWith({ ok: true });
    expect(room.players.target).toBeUndefined();
    expect(room.phase).toBe('day');
  });

  // Documents the intended admin-override behavior: an admin may kick
  // anyone, including the last remaining player. The previous last-player
  // guard was dead code (it required a connected count of 0 while the
  // target was still in room.players) and contradicted the documented
  // intent, so it was removed. An emptied room is left with hostId = null
  // and reaped by idle-room cleanup.
  test('admin override can kick the last remaining player', () => {
    room = makeRoom();
    // Remove the non-host player so only the host remains.
    delete room.players.target;
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io, sockets } = makeIo();
    sockets.set('socket-host', { disconnect: vi.fn() });

    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminKickPlayer({ roomCode: 'ABCD', targetId: 'host' }, cb);

    expect(cb).toHaveBeenCalledWith({ ok: true });
    expect(room.players.host).toBeUndefined();
    expect(room.hostId).toBeNull();
  });

  test('rejects without admin token', () => {
    room = makeRoom();
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-non-admin', false);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminKickPlayer({ roomCode: 'ABCD', targetId: 'target' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.adminRequired' })
    );
    expect(room.players.target).toBeDefined();
  });

  test('returns error for unknown room', () => {
    (roomsModule.getRoom as Mock).mockReturnValue(undefined);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminKickPlayer({ roomCode: 'ZZZZ', targetId: 'target' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.roomNotFound' })
    );
  });

  test('returns error for unknown target', () => {
    room = makeRoom();
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminKickPlayer({ roomCode: 'ABCD', targetId: 'ghost' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.targetNotFound' })
    );
  });
});

describe('setupAdminSocketHandlers — hostMidGameKickPlayer', () => {
  let room: Room;

  beforeEach(() => {
    _resetAdminManagerForTests();
    _resetAdminAuthWarningForTests();
    (broadcastModule.broadcastRoom as Mock).mockClear();
    (broadcastModule.broadcastRoomToAdmins as Mock).mockClear();
  });

  test('rejects when caller is not admin', () => {
    room = makeRoom({ phase: 'day' });
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-not-admin', false);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.hostMidGameKickPlayer({ roomCode: 'ABCD', playerId: 'host', targetId: 'target' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.adminRequired' })
    );
  });

  test('rejects when caller is not host', () => {
    room = makeRoom({ phase: 'day' });
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.hostMidGameKickPlayer({ roomCode: 'ABCD', playerId: 'target', targetId: 'host' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.onlyHostKick' })
    );
  });

  test('kicks a player mid-game when caller is admin + host', () => {
    room = makeRoom({ phase: 'night', phaseStep: 'wolves' });
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io, sockets } = makeIo();
    sockets.set('socket-target', { disconnect: vi.fn() });

    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.hostMidGameKickPlayer({ roomCode: 'ABCD', playerId: 'host', targetId: 'target' }, cb);

    expect(cb).toHaveBeenCalledWith({ ok: true });
    expect(room.players.target).toBeUndefined();
    expect(room.phase).toBe('night');
  });

  test('kicks a player during day phase', () => {
    room = makeRoom({ phase: 'day', dayCount: 1 });
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io, sockets } = makeIo();
    sockets.set('socket-target', { disconnect: vi.fn() });

    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.hostMidGameKickPlayer({ roomCode: 'ABCD', playerId: 'host', targetId: 'target' }, cb);

    expect(cb).toHaveBeenCalledWith({ ok: true });
    expect(room.players.target).toBeUndefined();
  });

  test('rejects self-kick', () => {
    room = makeRoom({ phase: 'day' });
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.hostMidGameKickPlayer({ roomCode: 'ABCD', playerId: 'host', targetId: 'host' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.cannotKickSelf' })
    );
  });
});

describe('setupAdminSocketHandlers — adminJoinRoom / adminLeaveRoom', () => {
  beforeEach(() => {
    _resetAdminManagerForTests();
    _resetAdminAuthWarningForTests();
    (broadcastModule.broadcastRoomToAdmins as Mock).mockClear();
  });

  test('adminJoinRoom does NOT add the admin to room.players', () => {
    const room = makeRoom();
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);

    const cb = vi.fn();
    handlers.adminJoinRoom({ roomCode: 'ABCD' }, cb);

    expect(cb).toHaveBeenCalledWith({ ok: true });
    // The admin is not in room.players.
    expect(Object.values(room.players).some((p) => p.socketId === 'socket-admin')).toBe(false);
    expect(room.players.host).toBeDefined();
    expect(room.players.target).toBeDefined();
  });

  test('adminJoinRoom pushes an immediate admin view', () => {
    const room = makeRoom();
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    handlers.adminJoinRoom({ roomCode: 'ABCD' }, vi.fn());
    expect(broadcastModule.broadcastRoomToAdmins).toHaveBeenCalled();
  });

  test('adminLeaveRoom removes the observer mapping', () => {
    const room = makeRoom();
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    handlers.adminJoinRoom({ roomCode: 'ABCD' }, vi.fn());

    const cb = vi.fn();
    handlers.adminLeaveRoom({ roomCode: 'ABCD' }, cb);
    expect(cb).toHaveBeenCalledWith({ ok: true });

    // A second leave should now fail because we are not observing anymore.
    const cb2 = vi.fn();
    handlers.adminLeaveRoom({ roomCode: 'ABCD' }, cb2);
    expect(cb2).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.adminNotObserving' })
    );
  });

  test('adminJoinRoom fails for unknown room', () => {
    (roomsModule.getRoom as Mock).mockReturnValue(undefined);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminJoinRoom({ roomCode: 'ZZZZ' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.roomNotFound' })
    );
  });

  test('adminLeaveRoom without join returns an error', () => {
    (roomsModule.getRoom as Mock).mockReturnValue(undefined);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-admin', true);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminLeaveRoom({ roomCode: 'ABCD' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.adminNotObserving' })
    );
  });

  test('adminJoinRoom rejects non-admin callers', () => {
    const room = makeRoom();
    (roomsModule.getRoom as Mock).mockReturnValue(room);
    const { io } = makeIo();
    const { handlers, socket } = makeSocket('socket-not-admin', false);
    setupAdminSocketHandlers(io, socket);
    const cb = vi.fn();
    handlers.adminJoinRoom({ roomCode: 'ABCD' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'server.errors.adminRequired' })
    );
  });
});
