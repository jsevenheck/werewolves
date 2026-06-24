/**
 * Admin observer registry.
 *
 * Admin sockets are NOT regular players. They are tracked separately so that:
 *   1. They are not in `room.players` (so game logic never targets them).
 *   2. They can be fanned out room updates via `broadcastRoomToAdmins`.
 *   3. Their lifecycle (disconnect, leave) is independent of player lifecycle.
 *
 * One socket can observe at most one room at a time. Re-joining a different
 * room first removes the previous association.
 */
import type { AdminObserver } from '../../../core/src/types';

/**
 * Map<roomCode, Map<socketId, AdminObserver>>
 *
 * Using a nested Map (rather than a Set) lets us carry the observer metadata
 * (label, joinedAt) cheaply and update it on re-join without losing history.
 */
const observersByRoom = new Map<string, Map<string, AdminObserver>>();

/**
 * Inverse lookup: socketId -> roomCode, so we can clean up on disconnect.
 */
const roomBySocket = new Map<string, string>();

function registerAdminObserver(socketId: string, roomCode: string, label: string): AdminObserver {
  // If this socket was previously observing a different room, drop the old link.
  const previousRoomCode = roomBySocket.get(socketId);
  if (previousRoomCode && previousRoomCode !== roomCode) {
    removeAdminObserver(socketId);
  }
  const observer: AdminObserver = {
    socketId,
    roomCode,
    label,
    joinedAt: Date.now(),
  };
  let bucket = observersByRoom.get(roomCode);
  if (!bucket) {
    bucket = new Map();
    observersByRoom.set(roomCode, bucket);
  }
  bucket.set(socketId, observer);
  roomBySocket.set(socketId, roomCode);
  return observer;
}

function removeAdminObserver(socketId: string): AdminObserver | null {
  const roomCode = roomBySocket.get(socketId);
  if (!roomCode) return null;
  roomBySocket.delete(socketId);
  const bucket = observersByRoom.get(roomCode);
  if (!bucket) return null;
  const observer = bucket.get(socketId) ?? null;
  bucket.delete(socketId);
  if (bucket.size === 0) {
    observersByRoom.delete(roomCode);
  }
  return observer;
}

function listAdminObservers(roomCode: string): AdminObserver[] {
  const bucket = observersByRoom.get(roomCode);
  if (!bucket) return [];
  return Array.from(bucket.values());
}

function getAdminObserversForRoom(roomCode: string): string[] {
  const bucket = observersByRoom.get(roomCode);
  if (!bucket) return [];
  return Array.from(bucket.keys());
}

/**
 * Returns the roomCode this socket is currently observing, or null.
 */
function getRoomForAdminSocket(socketId: string): string | null {
  return roomBySocket.get(socketId) ?? null;
}

/**
 * Test-only: wipe the registry. Do NOT call from production code.
 */
function _resetAdminManagerForTests(): void {
  observersByRoom.clear();
  roomBySocket.clear();
}

export {
  registerAdminObserver,
  removeAdminObserver,
  listAdminObservers,
  getAdminObserversForRoom,
  getRoomForAdminSocket,
  _resetAdminManagerForTests,
};
