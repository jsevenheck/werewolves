import type { Server } from 'socket.io';
import { ROLE_INFO } from '../config/constants';
import { addLog, clearRoomTimers } from '../utils/helpers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/events';
import type { Room } from '../../shared/types';

function queueDeath(room: Room, playerId: string, reason: string) {
  room.pendingDeaths.push({ playerId, reason });
}

function resolveDeaths(
  room: Room,
  context: 'general' | 'night' | 'day' = 'general',
  broadcastRoom: (room: Room) => void,
  io?: Server<ClientToServerEvents, ServerToClientEvents>
) {
  const announced: { name: string; role: string | null }[] = [];
  while (room.pendingDeaths.length) {
    const next = room.pendingDeaths.shift();
    if (!next) break;
    const { playerId, reason } = next;
    const player = room.players[playerId];
    if (!player || !player.alive) continue;
    player.alive = false;
    player.voteTarget = null;
    announced.push({ name: player.name, role: player.role });
    addLog(
      room,
      `${player.name} died (${reason}). Role: ${ROLE_INFO[player.role ?? 'villager']?.label || player.role}.`,
      `${player.name} died. Role: ${ROLE_INFO[player.role ?? 'villager']?.label || player.role}.`
    );
    if (player.role === 'hunter' && io) {
      const socket = player.socketId && io.sockets?.sockets?.get(player.socketId);
      if (socket && player.connected) {
        room.awaitingHunterShot = player.id;
        socket.emit('hunterPrompt', { roomCode: room.code });
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
    room.lastNightDeaths = announced;
  }
  if (!room.awaitingHunterShot) {
    checkWinners(room);
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
    clearRoomTimers(room);
    return;
  }
  const others = alive.length - wolves.length;
  if (wolves.length >= others) {
    room.winner = { team: 'wolves', reason: 'Werewolves reached parity.' };
    room.phase = 'ended';
    room.phaseStep = null;
    room.nextNightStep = null;
    room.phaseTransition = null;
    clearRoomTimers(room);
  }
}

export {
  queueDeath,
  resolveDeaths,
  checkWinners
};
