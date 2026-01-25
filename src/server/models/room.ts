import { ROOM_CODE, DEFAULT_ROLE_CONFIG, DEFAULT_PASSIVE_ROLE_CONFIG, MIN_PLAYERS } from '../config/constants';
import { createVoteState, clearRoomTimers } from '../utils/helpers';
import type { Player, Room } from '../../shared/types';

const rooms = new Map<string, Room>();

// Cleanup configuration
const ROOM_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const ROOM_ENDED_CLEANUP_MS = 60 * 60 * 1000; // 1 hour after game ends
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run cleanup every hour

function createRoom(hostName: string, socketId: string, createPlayer: (name: string, socketId: string, isHost: boolean) => Player) {
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
    voteState: createVoteState(),
    pendingDeaths: [],
    winner: null,
    lastNightDeaths: [],
    lastDayDeaths: [],
    lastDayMessage: null,
    awaitingHunterShot: null,
    logs: [],
    nextNightStep: null,
    transitionTimer: null,
    phaseTransition: null,
    phaseTimer: null,
    hunterShotTimer: null,
    hunterShotQueue: [],
    createdAt: now,
    lastActivityAt: now
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
    return true;
  }
  return false;
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
      const allDisconnected = Object.values(room.players).every(p => !p.connected);
      if (allDisconnected || room.phase === 'lobby') {
        roomsToDelete.push(code);
      }
    }
  }

  roomsToDelete.forEach(code => deleteRoom(code));

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
  cleanupIdleRooms
};
