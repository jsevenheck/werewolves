const { sanitizeName } = require('../utils/helpers');
const { createRoom, getRoom } = require('../models/room');
const { createPlayer, setSocketIndex, getSocketIndex, deleteSocketIndex } = require('../models/player');
const { broadcastRoom, sendStateToPlayer } = require('../managers/broadcastManager');
const { normalizeRoleConfig, validateCounts, assignRoles } = require('../managers/roleManager');
const { schedulePhaseTransition, advanceFromReveal, startNight, notifyLovers } = require('../managers/phaseManager');
const { tryFinalizeWolfVote, advanceNightStep, handleWitchDecision } = require('../managers/nightManager');
const { tryResolveDayVote } = require('../managers/voteManager');
const { queueDeath, resolveDeaths } = require('../managers/deathManager');
const { createVoteState, addLog, clearRoomTimers } = require('../utils/helpers');

function setupSocketHandlers(io, socket) {
  socket.on('createRoom', ({ name }, cb) => {
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.({ error: 'Name required' });
    const { room, player } = createRoom(cleanName, socket.id, createPlayer);
    setSocketIndex(socket.id, room.code, player.id);
    cb?.({ roomCode: room.code, playerId: player.id });
    broadcastRoom(room, io);
  });

  socket.on('joinRoom', ({ name, code }, cb) => {
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.({ error: 'Name required' });
    const room = getRoom(code?.toUpperCase());
    if (!room) return cb?.({ error: 'Room not found' });
    if (room.phase !== 'lobby') return cb?.({ error: 'Game already started' });
    const player = createPlayer(cleanName, socket.id, false);
    room.players[player.id] = player;
    setSocketIndex(socket.id, room.code, player.id);
    cb?.({ roomCode: room.code, playerId: player.id });
    broadcastRoom(room, io);
  });

  socket.on('resumePlayer', ({ roomCode, playerId }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.({ error: 'Room not found' });
    const player = room.players[playerId];
    if (!player) return cb?.({ error: 'Player not in room' });
    player.socketId = socket.id;
    player.connected = true;
    setSocketIndex(socket.id, roomCode, playerId);
    cb?.({ ok: true });
    sendStateToPlayer(room, player, io);
  });

  socket.on('updateRoleConfig', ({ roomCode, playerId, config }) => {
    const room = getRoom(roomCode);
    if (!room) return;
    if (room.hostId !== playerId) return;
    if (room.phase !== 'lobby') return;
    room.roleConfig = normalizeRoleConfig(config);
    if (config?.minPlayers !== undefined) {
      const rawMin = Number(config.minPlayers);
      if (Number.isFinite(rawMin) && rawMin >= 3) {
        room.minPlayers = Math.floor(rawMin);
      }
    }
    broadcastRoom(room, io);
  });

  socket.on('startGame', ({ roomCode, playerId }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.({ error: 'Room missing' });
    if (room.hostId !== playerId) return cb?.({ error: 'Only host can start' });
    if (room.phase !== 'lobby') return cb?.({ error: 'Already started' });
    const validation = validateCounts(room);
    if (validation.error) return cb?.(validation);
    assignRoles(room);
    room.phase = 'roleReveal';
    room.phaseStep = null;
    room.dayCount = 0;
    room.lastNightDeaths = [];
    room.voteState = createVoteState();
    cb?.({ ok: true });
    addLog(room, 'Roles assigned. Secret information has been delivered.');
    broadcastRoom(room, io);
  });

  socket.on('markReady', ({ roomCode, playerId }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.({ error: 'Room missing' });
    if (room.phase !== 'roleReveal') return cb?.({ error: 'Not in roleReveal phase' });
    const player = room.players[playerId];
    if (!player) return cb?.({ error: 'Player missing' });
    if (player.socketId !== socket.id) return cb?.({ error: 'Socket mismatch' });
    player.ready = true;
    broadcastRoom(room, io);
    cb?.({ ok: true });
  });

  socket.on('continueAfterReveal', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostId !== playerId) return;
    if (room.phase !== 'roleReveal') return;
    const allReady = Object.values(room.players).every((p) => !p.connected || p.ready);
    if (!allReady) return;
    schedulePhaseTransition(room, 'postReveal', (r) => broadcastRoom(r, io));
  });

  socket.on('submitArmor', ({ roomCode, playerId, targets }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'armor') return;
    const player = room.players[playerId];
    if (!player || player.role !== 'armor' || !player.alive) return;
    if (!Array.isArray(targets) || targets.length !== 2) return;
    const [a, b] = targets;
    if (a === b) return;
    const targetA = room.players[a];
    const targetB = room.players[b];
    if (!targetA || !targetB || !targetA.alive || !targetB.alive) return;
    room.lovers = { aId: a, bId: b };
    notifyLovers(room);
    addLog(room, `${player.name} linked two souls together as Lovers.`, 'The Lovers have been chosen.');
    schedulePhaseTransition(room, 'postArmor', (r) => broadcastRoom(r, io));
  });

  socket.on('submitWolfVote', ({ roomCode, playerId, targetId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'wolves') return;
    const player = room.players[playerId];
    if (!player || player.role !== 'werewolf' || !player.alive) return;
    if (targetId && !room.players[targetId]?.alive) return;
    room.wolfVotes[playerId] = targetId || null;
    tryFinalizeWolfVote(room, (r) => broadcastRoom(r, io), io);
    broadcastRoom(room, io);
  });

  socket.on('submitSeerInspect', ({ roomCode, playerId, targetId }, cb) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'seer') return;
    const player = room.players[playerId];
    if (!player || player.role !== 'seer' || !player.alive) return;
    const target = room.players[targetId];
    if (!target) return;
    const result = target.role === 'werewolf' ? 'Werewolf' : 'Not Werewolf';
    player.seerResult = { name: target.name, result };
    cb?.({ ok: true, name: target.name, result });
    room.seerActed = true;
    advanceNightStep(room, (r) => broadcastRoom(r, io), io);
  });

  socket.on('submitWitchDecision', ({ roomCode, playerId, action, targetId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'witch') return;
    const player = room.players[playerId];
    if (!player || player.role !== 'witch' || !player.alive) return;
    handleWitchDecision(room, action, targetId, (r) => broadcastRoom(r, io), io);
  });

  socket.on('hostSkipStep', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostId !== playerId) return;
    if (room.phase !== 'night' && !room.phaseTransition) return;
    
    if (room.phaseStep === 'transition' && room.nextNightStep) {
      clearRoomTimers(room);
      const step = room.nextNightStep;
      room.phaseStep = step;
      room.nextNightStep = null;
      if (step === 'resolve') {
        const { resolveNight } = require('../managers/nightManager');
        resolveNight(room, (r) => broadcastRoom(r, io), io);
      } else {
        broadcastRoom(room, io);
      }
      return;
    }
    
    if (room.phaseTransition) {
      if (room.phaseTimer) {
        clearTimeout(room.phaseTimer);
        room.phaseTimer = null;
      }
      const kind = room.phaseTransition;
      room.phaseTransition = null;
      if (kind === 'nightToDay') {
        room.dayCount += 1;
        room.phase = 'day';
        room.phaseStep = null;
        room.nextNightStep = null;
        room.voteState = createVoteState();
        addLog(room, `Day ${room.dayCount} has begun.`);
        broadcastRoom(room, io);
        return;
      }
      if (kind === 'dayToNight') {
        startNight(room);
        broadcastRoom(room, io);
        return;
      }
      if (kind === 'postReveal') {
        advanceFromReveal(room, (r) => broadcastRoom(r, io));
        return;
      }
      if (kind === 'postArmor') {
        startNight(room);
        broadcastRoom(room, io);
        return;
      }
      return;
    }
    
    if (room.phaseStep === 'wolves') {
      const livingWolves = Object.values(room.players).filter((p) => p.role === 'werewolf' && p.alive);
      if (livingWolves.length === 0) {
        room.wolfTarget = null;
        const { scheduleNightStep } = require('../managers/phaseManager');
        scheduleNightStep(room, 'seer', (r) => broadcastRoom(r, io), io);
        return;
      }
      livingWolves.forEach((wolf) => {
        if (room.wolfVotes[wolf.id] === undefined || room.wolfVotes[wolf.id] === '') {
          room.wolfVotes[wolf.id] = '';
        }
      });
      tryFinalizeWolfVote(room, (r) => broadcastRoom(r, io), io);
      return;
    }
    
    if (room.phaseStep === 'seer') {
      room.seerActed = true;
      const { scheduleNightStep } = require('../managers/phaseManager');
      scheduleNightStep(room, 'witch', (r) => broadcastRoom(r, io), io);
      return;
    }
    
    if (room.phaseStep === 'witch') {
      handleWitchDecision(room, 'skip', null, (r) => broadcastRoom(r, io), io);
      return;
    }
  });

  socket.on('submitDayVote', ({ roomCode, playerId, targetId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'day') return;
    const player = room.players[playerId];
    if (!player || !player.alive) return;
    if (player.socketId !== socket.id) return;
    if (room.voteState.revoteFromTie && targetId && !room.voteState.revoteFromTie.includes(targetId)) {
      return;
    }
    if (targetId && !room.players[targetId]?.alive) return;
    room.voteState.votes[playerId] = targetId || null;
    tryResolveDayVote(room, (r) => broadcastRoom(r, io), io);
    broadcastRoom(room, io);
  });

  socket.on('hunterShoot', ({ roomCode, playerId, targetId }) => {
    const room = getRoom(roomCode);
    if (!room || room.awaitingHunterShot !== playerId) return;
    const target = room.players[targetId];
    if (!target || !target.alive) return;
    queueDeath(room, targetId, 'shot by Hunter');
    room.awaitingHunterShot = null;
    resolveDeaths(room, 'general', (r) => broadcastRoom(r, io), io);
  });

  socket.on('requestState', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room) return;
    const player = room.players[playerId];
    if (!player) return;
    sendStateToPlayer(room, player, io);
  });

  socket.on('disconnect', () => {
    const ref = getSocketIndex(socket.id);
    if (!ref) return;
    deleteSocketIndex(socket.id);
    const room = getRoom(ref.roomCode);
    if (!room) return;
    const player = room.players[ref.playerId];
    if (!player) return;
    player.connected = false;
    addLog(room, `${player.name} disconnected.`);
    broadcastRoom(room, io);
  });
}

module.exports = {
  setupSocketHandlers
};
