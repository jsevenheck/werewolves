const { ROLE_INFO } = require('../config/constants');
const { addLog, clearRoomTimers } = require('../utils/helpers');

function queueDeath(room, playerId, reason) {
  room.pendingDeaths.push({ playerId, reason });
}

function resolveDeaths(room, context = 'general', broadcastRoom, io) {
  const announced = [];
  while (room.pendingDeaths.length) {
    const { playerId, reason } = room.pendingDeaths.shift();
    const player = room.players[playerId];
    if (!player || !player.alive) continue;
    player.alive = false;
    player.voteTarget = null;
    announced.push({ name: player.name, role: player.role });
    addLog(
      room,
      `${player.name} died (${reason}). Role: ${ROLE_INFO[player.role]?.label || player.role}.`,
      `${player.name} died. Role: ${ROLE_INFO[player.role]?.label || player.role}.`
    );
    if (player.role === 'hunter' && io) {
      room.awaitingHunterShot = player.id;
      const socket = player.socketId && io.sockets.sockets.get(player.socketId);
      if (socket && player.connected) {
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

function checkWinners(room) {
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

module.exports = {
  queueDeath,
  resolveDeaths,
  checkWinners
};
