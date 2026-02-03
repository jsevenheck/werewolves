import {
  ROOM_CODE,
  DEFAULT_ROLE_CONFIG,
  DEFAULT_PASSIVE_ROLE_CONFIG,
  MIN_PLAYERS,
} from '../config/constants';
import { createVoteState, clearRoomTimers } from '../utils/helpers';
import type { Player, Room } from '../../../core/src/types';

const rooms = new Map<string, Room>();

// Maps a platform sessionId → internal room code so that autoJoinRoom
// can locate (or create) the correct room without exposing the 4-char code.
const sessionToRoom = new Map<string, string>();

// Cleanup configuration
const ROOM_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const ROOM_ENDED_CLEANUP_MS = 60 * 60 * 1000; // 1 hour after game ends
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run cleanup every hour

function createRoom(
  hostName: string,
  socketId: string,
  createPlayer: (name: string, socketId: string, isHost: boolean) => Player
) {
  let code: string;
  do {
    code = ROOM_CODE();
  } while (rooms.has(code));
  const now = Date.now();
  const room: Room = {
    code,
    hostId: null,
    phase: 'lobby',
    phaseStep: null,
    dayCount: 0,
    players: {},
    minPlayers: MIN_PLAYERS,
    roleConfig: { ...DEFAULT_ROLE_CONFIG },
    passiveRoleConfig: { ...DEFAULT_PASSIVE_ROLE_CONFIG },
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
    guardedTarget: null,
    lastGuardedTarget: null,
    guardActed: false,
    harlotVisitedTarget: null,
    harlotActed: false,
    voteState: createVoteState(),
    pendingDeaths: [],
    winner: null,
    lastNightDeaths: [],
    lastDayDeaths: [],
    lastDayMessage: null,
    awaitingHunterShot: null,
    dayVoteResolved: false,
    logs: [],
    nextNightStep: null,
    transitionTimer: null,
    phaseTransition: null,
    phaseTimer: null,
    hunterShotTimer: null,
    hunterShotEndsAt: null,
    hunterShotQueue: [],
    createdAt: now,
    lastActivityAt: now,
  };
  const player = createPlayer(hostName, socketId, true);
  room.players[player.id] = player;
  room.hostId = player.id;
  rooms.set(code, room);
  return { room, player };
}

function getRoom(code: string) {
  return rooms.get(code);
}

function getAllRooms() {
  return rooms;
}

function deleteRoom(code: string) {
  const room = rooms.get(code);
  if (room) {
    clearRoomTimers(room);
    rooms.delete(code);
    // Clean up any sessionId → roomCode mapping that pointed here
    for (const [sessionId, mappedCode] of sessionToRoom.entries()) {
      if (mappedCode === code) sessionToRoom.delete(sessionId);
    }
    return true;
  }
  return false;
}

/**
 * Resolve a platform sessionId to an existing room code.
 * Returns undefined when no room has been linked to this sessionId yet.
 */
function getRoomCodeBySessionId(sessionId: string): string | undefined {
  return sessionToRoom.get(sessionId);
}

/**
 * Persist the sessionId → roomCode mapping so that subsequent autoJoinRoom
 * calls find the same room.
 */
function linkSessionToRoom(sessionId: string, roomCode: string): void {
  sessionToRoom.set(sessionId, roomCode);
}

function updateRoomActivity(room: Room) {
  room.lastActivityAt = Date.now();
}

function cleanupIdleRooms() {
  const now = Date.now();
  const roomsToDelete: string[] = [];

  for (const [code, room] of rooms.entries()) {
    const idleTime = now - room.lastActivityAt;

    // Clean up ended games after 1 hour
    if (room.phase === 'ended' && idleTime > ROOM_ENDED_CLEANUP_MS) {
      roomsToDelete.push(code);
      continue;
    }

    // Clean up idle rooms (in lobby or abandoned) after 24 hours
    if (idleTime > ROOM_IDLE_TIMEOUT_MS) {
      const allDisconnected = Object.values(room.players).every((p) => !p.connected);
      if (allDisconnected || room.phase === 'lobby') {
        roomsToDelete.push(code);
      }
    }
  }

  roomsToDelete.forEach((code) => deleteRoom(code));

  // Cleaned up idle rooms (if any)
}

// Start periodic cleanup (unref to prevent test hanging)
setInterval(cleanupIdleRooms, CLEANUP_INTERVAL_MS).unref();

export {
  createRoom,
  getRoom,
  getAllRooms,
  deleteRoom,
  updateRoomActivity,
  cleanupIdleRooms,
  getRoomCodeBySessionId,
  linkSessionToRoom,
};
