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
import { getRoom, getAllRooms, deleteRoom } from '../models/room';
import { deleteSocketIndex } from '../models/player';
import { errorResponse, localizedMessage, addLog } from '../utils/helpers';
import { isAdminSocket } from '../utils/adminAuth';
import { cancelPendingDisconnect } from './socketHandlers';
import {
  registerAdminObserver,
  removeAdminObserver,
  getAdminObserversForRoom,
  getRoomForAdminSocket,
} from '../managers/adminManager';
import {
  broadcastRoom,
  broadcastRoomToAdmins,
  notifyAdminObserversRoomClosed,
} from '../managers/broadcastManager';
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
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      alive: player.alive,
      connected: player.connected,
      isHost: player.id === room.hostId,
      role: null,
    })),
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
): boolean {
  const target = room.players[targetId];
  if (!target) return false;
  // Add a localized log entry before we drop the player record.
  addLog(
    room,
    `${target.name} was removed from the room (${reason}).`,
    null,
    localizedMessage('server.logs.kicked', { name: target.name })
  );
  if (target.socketId) {
    const targetSocket = io.sockets.get(target.socketId);
    if (targetSocket) {
      deleteSocketIndex(target.socketId);
      targetSocket.disconnect(true);
    }
  }
  delete room.players[targetId];
  // If we just removed the host, hand off to whoever is still connected.
  // We also clear the previous host's `isHost` flag and set it on the
  // fallback, so `player.isHost` stays consistent with `room.hostId`.
  if (room.hostId === targetId) {
    const fallback = Object.values(room.players).find((p) => p.connected);
    // Clear the flag on every remaining player first to avoid stale
    // `isHost = true` on the previous host (if they were tracked by id).
    for (const p of Object.values(room.players)) {
      p.isHost = false;
    }
    if (fallback) {
      fallback.isHost = true;
      room.hostId = fallback.id;
    } else {
      room.hostId = null;
    }
  }
  // If the kick emptied the room, tear it down immediately so it does not
  // linger in the admin room list. Admin observers are notified via
  // `roomClosed` and removed from the observer registry.
  if (Object.keys(room.players).length === 0) {
    notifyAdminObserversRoomClosed(room.code, io);
    deleteRoom(room.code);
    return true;
  }
  return false;
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
    // admin override), in any phase, even the last remaining player. If the
    // kick empties the room, `kickPlayerFromRoom` tears it down immediately
    // (admin observers get `roomClosed`, the room is deleted) — so there is
    // no lingering empty room and no state corruption.
    //
    // (A previous "cannot remove the last player" guard here was dead code:
    // it required `connectedCount === 0` while the target was still in
    // `room.players`, which can never hold for a connected host. It was
    // removed because it contradicted the documented admin-override intent.)
    const roomDeleted = kickPlayerFromRoom(io, room, targetId, 'admin kick');
    cb?.({ ok: true });
    // Skip broadcasts if the kick emptied and deleted the room.
    if (!roomDeleted) {
      broadcastRoom(room, io);
      broadcastRoomToAdmins(room, io, getAdminObserversForRoom(room.code));
    }
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
    const roomDeleted = kickPlayerFromRoom(io, room, targetId, 'host mid-game kick');
    cb?.({ ok: true });
    if (!roomDeleted) {
      broadcastRoom(room, io);
      broadcastRoomToAdmins(room, io, getAdminObserversForRoom(room.code));
    }
  });

  socket.on('adminCloseRoom', ({ roomCode }, cb) => {
    if (!isAdminSocket(socket)) {
      return cb?.(errorResponse('Admin access required', 'server.errors.adminRequired'));
    }
    const room = getRoom(roomCode);
    if (!room) return cb?.(errorResponse('Room not found', 'server.errors.roomNotFound'));

    // Cancel any pending disconnect grace timers for all players in the room.
    for (const pid of Object.keys(room.players)) {
      cancelPendingDisconnect(pid);
    }

    // Notify all connected players before tearing down.
    for (const player of Object.values(room.players)) {
      if (player.socketId) {
        const playerSocket = io.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('roomClosed');
          deleteSocketIndex(player.socketId);
          playerSocket.disconnect(true);
        }
      }
    }

    // Release any admin observers watching this room.
    notifyAdminObserversRoomClosed(roomCode, io);

    deleteRoom(roomCode);
    cb?.({ ok: true });
  });

  // On disconnect, drop this socket from any room it was observing so we
  // don't try to broadcast to a dead socket.
  socket.on('disconnect', () => {
    removeAdminObserver(socket.id);
  });
}

export { setupAdminSocketHandlers, kickPlayerFromRoom, toRoomSummary };
