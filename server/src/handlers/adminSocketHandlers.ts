/**
 * Admin-only Socket.IO handlers.
 *
 * These are registered alongside `setupSocketHandlers` on the same namespace.
 * Every handler first checks `socket.data.adminToken === true`; if absent the
 * handler responds with an `ErrorResponse` and does not mutate any room state.
 *
 * The events handled here:
 *   - adminListRooms      → list every room as a sanitized `RoomSummary`.
 *   - adminJoinRoom       → register as an observer and start receiving
 *                           `roomUpdate` events for that room.
 *   - adminLeaveRoom      → stop observing the room.
 *   - adminKickPlayer     → kick any player in any phase (admin override).
 *   - hostMidGameKickPlayer → host-only kick that works in any phase; the
 *                             acting socket must be BOTH admin AND host.
 *
 * The existing `kickPlayer` handler in `socketHandlers.ts` is intentionally
 * untouched — it remains the lobby-only in-game kick used by players/hosts.
 */
import type { Namespace, Socket } from 'socket.io';
import { getRoom, getAllRooms } from '../models/room';
import { deleteSocketIndex } from '../models/player';
import { errorResponse, localizedMessage, addLog } from '../utils/helpers';
import { isAdminSocket } from '../utils/adminAuth';
import {
  registerAdminObserver,
  removeAdminObserver,
  getAdminObserversForRoom,
  getRoomForAdminSocket,
} from '../managers/adminManager';
import { broadcastRoom, broadcastRoomToAdmins } from '../managers/broadcastManager';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../core/src/events';
import type { Room, RoomSummary } from '../../../core/src/types';

/**
 * Build a `RoomSummary` for the global admin page.
 *
 * We deliberately do not include any role or vote information here; the
 * per-room admin observer view (`buildAdminRoomView`) covers that.
 */
function toRoomSummary(room: Room): RoomSummary {
  const players = Object.values(room.players);
  const connectedPlayerCount = players.filter((p) => p.connected).length;
  const host = room.hostId ? room.players[room.hostId] : null;
  return {
    code: room.code,
    phase: room.phase,
    dayCount: room.dayCount,
    playerCount: players.length,
    connectedPlayerCount,
    hostName: host ? host.name : null,
    createdAt: room.createdAt,
    lastActivityAt: room.lastActivityAt,
  };
}

/**
 * Remove a player from a room and tear down their socket.
 *
 * Shared by `adminKickPlayer` and `hostMidGameKickPlayer`. We deliberately
 * reuse the same housekeeping the lobby `kickPlayer` performs (socket
 * disconnect, socket-index cleanup, host fallback, localized log entry) so
 * that admins never leave a half-torn-down player behind. Phase-related
 * continuations (day vote, mayor selection, hunter shot) are NOT advanced —
 * this is an admin emergency stop, not a normal "leaveRoom".
 *
 * Returns the removed player, or null if the target did not exist.
 */
function kickPlayerFromRoom(
  io: Namespace<ClientToServerEvents, ServerToClientEvents>,
  room: Room,
  targetId: string,
  reason: string
) {
  const target = room.players[targetId];
  if (!target) return null;
  // Add a localized log entry before we drop the player record.
  addLog(
    room,
    `${target.name} was removed from the room (${reason}).`,
    null,
    localizedMessage('server.logs.kicked', { name: target.name })
  );
  if (target.socketId) {
    const targetSocket = io.sockets.get(target.socketId);
    deleteSocketIndex(target.socketId);
    if (targetSocket) {
      targetSocket.disconnect(true);
    }
  }
  delete room.players[targetId];
  // If we just removed the host, hand off to whoever is still connected.
  if (room.hostId === targetId) {
    const fallback = Object.values(room.players).find((p) => p.connected);
    room.hostId = fallback ? fallback.id : null;
  }
  return target;
}

function setupAdminSocketHandlers(
  io: Namespace<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
) {
  socket.on('adminListRooms', (_payload, cb) => {
    if (!isAdminSocket(socket)) {
      return cb?.(errorResponse('Admin access required', 'server.errors.adminRequired'));
    }
    const rooms = getAllRooms();
    const summaries: RoomSummary[] = [];
    for (const room of rooms.values()) {
      summaries.push(toRoomSummary(room));
    }
    cb?.({ rooms: summaries });
  });

  socket.on('adminJoinRoom', ({ roomCode }, cb) => {
    if (!isAdminSocket(socket)) {
      return cb?.(errorResponse('Admin access required', 'server.errors.adminRequired'));
    }
    const room = getRoom(roomCode);
    if (!room) {
      return cb?.(errorResponse('Room not found', 'server.errors.roomNotFound'));
    }
    registerAdminObserver(socket.id, room.code, 'admin');
    cb?.({ ok: true });
    // Immediately push the current state so the UI doesn't have to wait for
    // the next player-driven broadcast.
    broadcastRoomToAdmins(room, io, getAdminObserversForRoom(room.code));
  });

  socket.on('adminLeaveRoom', ({ roomCode }, cb) => {
    if (!isAdminSocket(socket)) {
      return cb?.(errorResponse('Admin access required', 'server.errors.adminRequired'));
    }
    const observedCode = getRoomForAdminSocket(socket.id);
    // If the caller passed a roomCode, only act on that room; otherwise
    // leave whatever they were observing. We require an active observation
    // (no implicit "leave any room by guessing the code" behavior).
    const code = roomCode ?? observedCode;
    if (!code) {
      return cb?.(errorResponse('Not observing any room', 'server.errors.adminNotObserving'));
    }
    if (!observedCode) {
      // A roomCode was given but the socket is not observing anything.
      return cb?.(errorResponse('Not observing any room', 'server.errors.adminNotObserving'));
    }
    if (roomCode && observedCode && roomCode !== observedCode) {
      return cb?.(errorResponse('Not observing that room', 'server.errors.adminNotObservingRoom'));
    }
    removeAdminObserver(socket.id);
    cb?.({ ok: true });
  });

  socket.on('adminKickPlayer', ({ roomCode, targetId }, cb) => {
    if (!isAdminSocket(socket)) {
      return cb?.(errorResponse('Admin access required', 'server.errors.adminRequired'));
    }
    const room = getRoom(roomCode);
    if (!room) return cb?.(errorResponse('Room not found', 'server.errors.roomNotFound'));
    if (!room.players[targetId]) {
      return cb?.(errorResponse('Target not found', 'server.errors.targetNotFound'));
    }
    // Admins can kick anyone (including the host — the whole point of an
    // admin override). They cannot, however, "kick themselves": admins are
    // never in room.players, so this branch is just a guard.
    if (
      targetId === room.hostId &&
      Object.values(room.players).filter((p) => p.connected).length === 0
    ) {
      return cb?.(
        errorResponse('Cannot remove the last player', 'server.errors.cannotRemoveLastPlayer')
      );
    }
    kickPlayerFromRoom(io, room, targetId, 'admin kick');
    cb?.({ ok: true });
    broadcastRoom(room, io);
    broadcastRoomToAdmins(room, io, getAdminObserversForRoom(room.code));
  });

  socket.on('hostMidGameKickPlayer', ({ roomCode, playerId, targetId }, cb) => {
    if (!isAdminSocket(socket)) {
      return cb?.(errorResponse('Admin access required', 'server.errors.adminRequired'));
    }
    const room = getRoom(roomCode);
    if (!room) return cb?.(errorResponse('Room not found', 'server.errors.roomNotFound'));
    if (room.hostId !== playerId) {
      return cb?.(errorResponse('Only host can use this kick', 'server.errors.onlyHostKick'));
    }
    if (!room.players[playerId]) {
      return cb?.(errorResponse('Host player not in room', 'server.errors.playerNotInRoom'));
    }
    if (playerId === targetId) {
      return cb?.(errorResponse('Cannot kick yourself', 'server.errors.cannotKickSelf'));
    }
    if (!room.players[targetId]) {
      return cb?.(errorResponse('Target not found', 'server.errors.targetNotFound'));
    }
    // Mid-game kicks are intentionally allowed in ANY phase — the host may
    // need to remove a player who is disrupting the game. We still log the
    // action for transparency.
    kickPlayerFromRoom(io, room, targetId, 'host mid-game kick');
    cb?.({ ok: true });
    broadcastRoom(room, io);
    broadcastRoomToAdmins(room, io, getAdminObserversForRoom(room.code));
  });

  // On disconnect, drop this socket from any room it was observing so we
  // don't try to broadcast to a dead socket.
  socket.on('disconnect', () => {
    removeAdminObserver(socket.id);
  });
}

export { setupAdminSocketHandlers, kickPlayerFromRoom, toRoomSummary };
