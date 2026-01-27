import type { Server } from 'socket.io';
import { addLog, clearRoomTimers, getPlayerRoleLabel } from '../utils/helpers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/events';
import type { NightDeathAnnouncement, Room } from '../../shared/types';

const IS_E2E = process.env.E2E_TESTS === '1';
const HUNTER_SHOT_TIMEOUT_MS = IS_E2E ? 30 * 1000 : 60 * 1000;

function queueDeath(room: Room, playerId: string, reason: string) {
  room.pendingDeaths.push({ playerId, reason });
}

function shiftNextValidHunter(room: Room) {
  while (room.hunterShotQueue.length) {
    const nextId = room.hunterShotQueue.shift();
    if (!nextId) continue;
    const hunter = room.players[nextId];
    if (hunter && hunter.role === 'hunter' && !hunter.alive) {
      return nextId;
    }
  }
  return null;
}

function startHunterShot(
  room: Room,
  hunterId: string,
  broadcastRoom: (room: Room) => void,
  io?: Server<ClientToServerEvents, ServerToClientEvents>,
  shouldBroadcast = true
) {
  room.awaitingHunterShot = hunterId;
  if (room.hunterShotTimer) {
    clearTimeout(room.hunterShotTimer);
    room.hunterShotTimer = null;
  }

  const hunter = room.players[hunterId];
  const socket = io && hunter?.socketId && io.sockets?.sockets?.get(hunter.socketId);
  if (socket && hunter?.connected) {
    socket.emit('hunterPrompt', { roomCode: room.code });
  }

  // Auto-skip hunter shot after timeout if no response
  room.hunterShotTimer = setTimeout(() => {
    if (room.awaitingHunterShot === hunterId) {
      addLog(room, `Hunter shot timed out. No target selected.`);
      room.awaitingHunterShot = null;
      room.hunterShotTimer = null;

      // Check for next hunter in queue
      if (!startNextHunterShot(room, broadcastRoom, io)) {
        // No more hunters, check win conditions
        checkWinners(room);
        if (!room.winner) {
          const { startNextMayorSelection } = require('./mayorManager');
          if (!startNextMayorSelection(room, broadcastRoom, io)) {
            // No more mayor selections either, resume game flow
            const { schedulePhaseTransition, holdDayToNightTransition } = require('../managers/phaseManager');
            if (!room.awaitingHunterShot && !room.awaitingMayorSelection) {
              if (room.phase === 'day') {
                holdDayToNightTransition(room, broadcastRoom);
              } else if (room.phase === 'night' && room.phaseStep === 'resolve') {
                // Resume night->day transition after hunter shot during night
                schedulePhaseTransition(room, 'nightToDay', broadcastRoom);
              }
            }
          }
        }
      }
      broadcastRoom(room);
    }
  }, HUNTER_SHOT_TIMEOUT_MS);
  room.hunterShotTimer.unref?.();

  if (shouldBroadcast) {
    broadcastRoom(room);
  }
}

function startNextHunterShot(
  room: Room,
  broadcastRoom: (room: Room) => void,
  io?: Server<ClientToServerEvents, ServerToClientEvents>
) {
  if (room.awaitingHunterShot || !room.hunterShotQueue.length) {
    return false;
  }
  const nextId = shiftNextValidHunter(room);
  if (!nextId) {
    return false;
  }
  startHunterShot(room, nextId, broadcastRoom, io, true);
  return true;
}

function resolveDeaths(
  room: Room,
  context: 'general' | 'night' | 'day' = 'general',
  broadcastRoom: (room: Room) => void,
  io?: Server<ClientToServerEvents, ServerToClientEvents>
) {
  const announced: NightDeathAnnouncement[] = [];
  while (room.pendingDeaths.length) {
    const next = room.pendingDeaths.shift();
    if (!next) break;
    const { playerId, reason } = next;
    const player = room.players[playerId];
    if (!player || !player.alive) continue;
    player.alive = false;
    player.voteTarget = null;
    announced.push({ name: player.name, role: player.role });
    const roleLabel = getPlayerRoleLabel(player);
    addLog(
      room,
      `${player.name} died (${reason}). Role: ${roleLabel}.`,
      `${player.name} died. Role: ${roleLabel}.`
    );
    if (player.role === 'hunter') {
      const alreadyQueued =
        room.awaitingHunterShot === player.id || room.hunterShotQueue.includes(player.id);
      if (!alreadyQueued) {
        room.hunterShotQueue.push(player.id);
      }
      if (!room.awaitingHunterShot) {
        const nextId = shiftNextValidHunter(room);
        if (nextId) {
          startHunterShot(room, nextId, broadcastRoom, io, false);
        }
      }
    }
    // Handle mayor succession when mayor dies
    if (room.mayorId === playerId) {
      const alreadyQueued =
        room.awaitingMayorSelection === player.id || room.mayorSelectionQueue.includes(player.id);
      if (!alreadyQueued) {
        room.mayorSelectionQueue.push(player.id);
      }
    }
    if (room.lovers && (room.lovers.aId === playerId || room.lovers.bId === playerId)) {
      const otherId = room.lovers.aId === playerId ? room.lovers.bId : room.lovers.aId;
      const other = room.players[otherId];
      if (other && other.alive) {
        queueDeath(room, otherId, 'died of heartbreak');
      }
    }
  }
  if (announced.length && context === 'night') {
    room.lastNightDeaths = (room.lastNightDeaths || []).concat(announced);
  }
  if (context === 'day') {
    if (announced.length) {
      room.lastDayDeaths = (room.lastDayDeaths || []).concat(announced);
      // If there were any day deaths, clear lastDayMessage since the death announcement itself is sufficient.
      room.lastDayMessage = null;
    }
  }
  if (!room.awaitingHunterShot && room.hunterShotQueue.length === 0) {
    checkWinners(room);
  }
  if (!room.winner && !room.awaitingHunterShot && room.hunterShotQueue.length === 0) {
    const { startNextMayorSelection } = require('./mayorManager');
    startNextMayorSelection(room, broadcastRoom, io);
  }
  broadcastRoom(room);
}

function checkWinners(room: Room) {
  if (room.winner) return;
  const alive = Object.values(room.players).filter((p) => p.alive);
  const wolves = alive.filter((p) => p.role === 'werewolf');
  if (!wolves.length) {
    room.winner = { team: 'village', reason: 'All Werewolves are dead.' };
    room.phase = 'ended';
    room.phaseStep = null;
    room.nextNightStep = null;
    room.phaseTransition = null;
    room.awaitingMayorSelection = null;
    room.mayorSelectionQueue = [];
    clearRoomTimers(room);
    return;
  }
  const others = alive.length - wolves.length;
  if (wolves.length >= others) {
    const loneWitch = alive.length === 2 && alive.some((p) => p.role === 'witch');
    const witchHasLastStand = loneWitch && room.witchState.healAvailable && room.witchState.poisonAvailable;
    if (witchHasLastStand) {
      return;
    }
    room.winner = { team: 'wolves', reason: 'Werewolves reached parity.' };
    room.phase = 'ended';
    room.phaseStep = null;
    room.nextNightStep = null;
    room.phaseTransition = null;
    room.awaitingMayorSelection = null;
    room.mayorSelectionQueue = [];
    clearRoomTimers(room);
  }
}

export {
  queueDeath,
  resolveDeaths,
  startNextHunterShot,
  checkWinners
};
