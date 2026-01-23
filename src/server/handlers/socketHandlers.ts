import type { Server, Socket } from 'socket.io';
import { sanitizeName, createVoteState, addLog, clearRoomTimers } from '../utils/helpers';
import { createRoom, getRoom } from '../models/room';
import { createPlayer, setSocketIndex, getSocketIndex, deleteSocketIndex } from '../models/player';
import { broadcastRoom, sendStateToPlayer } from '../managers/broadcastManager';
import { normalizeRoleConfig, validateCounts, assignRoles } from '../managers/roleManager';
import { schedulePhaseTransition, advanceFromReveal, startNight, notifyLovers, holdDayToNightTransition } from '../managers/phaseManager';
import { tryFinalizeWolfVote, advanceNightStep, handleWitchDecision } from '../managers/nightManager';
import { tryResolveDayVote } from '../managers/voteManager';
import { queueDeath, resolveDeaths, startNextHunterShot, checkWinners } from '../managers/deathManager';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/events';
import type { Room } from '../../shared/types';

function getPlayerForSocket(room: Room, playerId: string, socketId: string) {
  const player = room.players[playerId];
  if (!player || player.socketId !== socketId) return null;
  return player;
}

function ensureActingHost(room: Room) {
  const owner = Object.values(room.players).find((player) => player.isHost);
  if (owner?.connected && room.hostId !== owner.id) {
    room.hostId = owner.id;
    return true;
  }
  const currentHost = room.hostId ? room.players[room.hostId] : null;
  if (currentHost?.connected) return false;
  const fallback = Object.values(room.players).find((player) => player.connected);
  if (fallback && room.hostId !== fallback.id) {
    room.hostId = fallback.id;
    return true;
  }
  return false;
}

function updateHostIfNeeded(room: Room) {
  ensureActingHost(room);
}

function detachSocketFromRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socketId: string,
  reason?: string
) {
  const ref = getSocketIndex(socketId);
  if (!ref) return;
  deleteSocketIndex(socketId);
  const room = getRoom(ref.roomCode);
  if (!room) return;
  const player = room.players[ref.playerId];
  if (!player) return;
  if (player.socketId !== socketId) return;
  player.connected = false;
  player.socketId = null;
  if (reason) {
    addLog(room, `${player.name} ${reason}.`);
  }
  updateHostIfNeeded(room);
  if (room.phase === 'day' && player.alive) {
    tryResolveDayVote(room, (r) => broadcastRoom(r, io), io);
  }
  broadcastRoom(room, io);
}

function setupSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
) {
  socket.on('createRoom', ({ name }, cb) => {
    detachSocketFromRoom(io, socket.id, 'left the room');
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.({ error: 'Name required' });
    const { room, player } = createRoom(cleanName, socket.id, createPlayer);
    setSocketIndex(socket.id, room.code, player.id);
    cb?.({ roomCode: room.code, playerId: player.id });
    broadcastRoom(room, io);
  });

  socket.on('joinRoom', ({ name, code }, cb) => {
    detachSocketFromRoom(io, socket.id, 'left the room');
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.({ error: 'Name required' });
    const room = getRoom(code?.toUpperCase());
    if (!room) return cb?.({ error: 'Room not found' });
    if (room.phase !== 'lobby') return cb?.({ error: 'Game already started' });
    const player = createPlayer(cleanName, socket.id, false);
    room.players[player.id] = player;
    setSocketIndex(socket.id, room.code, player.id);
    updateHostIfNeeded(room);
    cb?.({ roomCode: room.code, playerId: player.id });
    broadcastRoom(room, io);
  });

  socket.on('resumePlayer', ({ roomCode, playerId }, cb) => {
    const existingRef = getSocketIndex(socket.id);
    if (existingRef && (existingRef.roomCode !== roomCode || existingRef.playerId !== playerId)) {
      detachSocketFromRoom(io, socket.id, 'left the room');
    }
    const room = getRoom(roomCode);
    if (!room) return cb?.({ error: 'Room not found' });
    const player = room.players[playerId];
    if (!player) return cb?.({ error: 'Player not in room' });
    if (player.socketId && player.socketId !== socket.id) {
      const previousSocketId = player.socketId;
      const existingSocket = io.sockets.sockets.get(previousSocketId);
      if (existingSocket) {
        detachSocketFromRoom(io, previousSocketId);
        existingSocket.disconnect(true);
      }
    }
    player.socketId = socket.id;
    player.connected = true;
    setSocketIndex(socket.id, roomCode, playerId);
    updateHostIfNeeded(room);
    cb?.({ ok: true });
    broadcastRoom(room, io);
    if (room.awaitingHunterShot === playerId && player.role === 'hunter' && !player.alive) {
      socket.emit('hunterPrompt', { roomCode: room.code });
    }
  });

  socket.on('updateRoleConfig', ({ roomCode, playerId, config }) => {
    const room = getRoom(roomCode);
    if (!room) return;
    if (!getPlayerForSocket(room, playerId, socket.id)) return;
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
    if (!getPlayerForSocket(room, playerId, socket.id)) return cb?.({ error: 'Player missing' });
    if (room.hostId !== playerId) return cb?.({ error: 'Only host can start' });
    if (room.phase !== 'lobby') return cb?.({ error: 'Already started' });
    const validation = validateCounts(room);
    if ('error' in validation) return cb?.(validation);
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
    if (!getPlayerForSocket(room, playerId, socket.id)) return;
    if (room.phase !== 'roleReveal') return;
    const allReady = Object.values(room.players).every((p) => !p.connected || p.ready);
    if (!allReady) return;
    schedulePhaseTransition(room, 'postReveal', (r) => broadcastRoom(r, io));
  });

  socket.on('submitArmor', ({ roomCode, playerId, targets }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'armor') return;
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'armor' || !player.alive) return;
    if (room.lovers) return;
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
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'werewolf' || !player.alive) return;
    if (room.wolfVotes[playerId] !== undefined && room.wolfVotes[playerId] !== '') {
      // Inform the client that this vote was rejected because the player has already voted.
      socket.emit('wolfVoteRejected', { reason: 'already_voted' });
      return;
    }
    if (targetId && !room.players[targetId]?.alive) return;
    if (targetId && room.players[targetId]?.role === 'werewolf') return;
    room.wolfVotes[playerId] = targetId || null;
    tryFinalizeWolfVote(room, (r) => broadcastRoom(r, io), io);
    broadcastRoom(room, io);
  });

  socket.on('submitSeerInspect', ({ roomCode, playerId, targetId }, cb) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'seer') return;
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'seer' || !player.alive) return;
    if (targetId === playerId) return;
    const target = room.players[targetId];
    if (!target || !target.alive) return;
    const result = target.role === 'werewolf' ? 'Werewolf' : 'Not Werewolf';
    player.seerResult = { name: target.name, result };
    cb?.({ ok: true, name: target.name, result });
    room.seerActed = true;
    advanceNightStep(room, (r) => broadcastRoom(r, io), io);
  });

  socket.on('submitWitchDecision', ({ roomCode, playerId, action, targetId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'witch') return;
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'witch' || !player.alive) return;
    handleWitchDecision(room, playerId, action, targetId ?? null, (r) => broadcastRoom(r, io), io);
  });

  socket.on('hostSkipStep', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostId !== playerId) return;
    if (!getPlayerForSocket(room, playerId, socket.id)) return;
    if (room.phase !== 'night' && !room.phaseTransition && !room.awaitingHunterShot) return;

    if (room.awaitingHunterShot) {
      room.awaitingHunterShot = null;
      if (room.hunterShotTimer) {
        clearTimeout(room.hunterShotTimer);
        room.hunterShotTimer = null;
      }
      if (startNextHunterShot(room, (r) => broadcastRoom(r, io), io)) {
        return;
      }
      if (!room.winner) {
        checkWinners(room);
      }
      if (!room.winner) {
        const transition =
          room.phase === 'night' ? 'nightToDay' :
          room.phase === 'day' ? 'dayToNight' :
          null;
        if (transition) {
          if (transition === 'dayToNight') {
            holdDayToNightTransition(room, (r) => broadcastRoom(r, io));
          } else {
            schedulePhaseTransition(room, transition, (r) => broadcastRoom(r, io));
          }
          return;
        }
      }
      broadcastRoom(room, io);
      return;
    }

    if (room.phaseStep === 'transition' && room.nextNightStep) {
      clearRoomTimers(room);
      const step = room.nextNightStep;
      room.phaseStep = step;
      room.nextNightStep = null;
      if (step === 'resolve') {
        const { resolveNight } = require('../managers/nightManager');
        resolveNight(room, (r: typeof room) => broadcastRoom(r, io), io);
      } else if (step === 'seer' || step === 'witch') {
        advanceNightStep(room, (r) => broadcastRoom(r, io), io);
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
        scheduleNightStep(room, 'seer', (r: typeof room) => broadcastRoom(r, io), io);
        return;
      }
      livingWolves.forEach((wolf) => {
        if (room.wolfVotes[wolf.id] === undefined || room.wolfVotes[wolf.id] === '') {
          room.wolfVotes[wolf.id] = null;
        }
      });
      tryFinalizeWolfVote(room, (r) => broadcastRoom(r, io), io);
      return;
    }

    if (room.phaseStep === 'seer') {
      room.seerActed = true;
      const { scheduleNightStep } = require('../managers/phaseManager');
      scheduleNightStep(room, 'witch', (r: typeof room) => broadcastRoom(r, io), io);
      return;
    }

    if (room.phaseStep === 'witch') {
      handleWitchDecision(room, null, 'skip', null, (r) => broadcastRoom(r, io), io);
      return;
    }
  });

  socket.on('submitDayVote', ({ roomCode, playerId, targetId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'day') return;
    const player = room.players[playerId];
    if (!player || !player.alive) return;
    if (player.socketId !== socket.id) return;
    if (room.voteState.votes[playerId] !== undefined) return;
    if (room.voteState.revoteFromTie && targetId && !room.voteState.revoteFromTie.includes(targetId)) {
      return;
    }
    if (targetId && !room.players[targetId]?.alive) return;
    room.voteState.votes[playerId] = targetId || null;
    tryResolveDayVote(room, (r) => broadcastRoom(r, io), io);
    broadcastRoom(room, io);
  });

  socket.on('hostFinalizeDayVote', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'day') return;
    if (room.hostId !== playerId) return;
    if (!getPlayerForSocket(room, playerId, socket.id)) return;
    tryResolveDayVote(room, (r) => broadcastRoom(r, io), io, { allowEarly: true });
  });

  socket.on('hunterShoot', ({ roomCode, playerId, targetId }) => {
    const room = getRoom(roomCode);
    if (!room) return;
    const player = room.players[playerId];
    if (!player || player.role !== 'hunter') return;
    if (player.socketId !== socket.id) return;
    if (room.awaitingHunterShot !== playerId) return;
    const target = room.players[targetId];
    if (!target || !target.alive) return;
    if (room.hunterShotTimer) {
      clearTimeout(room.hunterShotTimer);
      room.hunterShotTimer = null;
    }
    queueDeath(room, targetId, 'shot by Hunter');
    room.awaitingHunterShot = null;
    const context =
      room.phase === 'night' ? 'night' :
      room.phase === 'day' ? 'day' :
      'general';
    resolveDeaths(room, context, (r) => broadcastRoom(r, io), io);
    if (startNextHunterShot(room, (r) => broadcastRoom(r, io), io)) {
      return;
    }
    if (!room.winner && !room.awaitingHunterShot) {
      const transition =
        room.phase === 'night' ? 'nightToDay' :
        room.phase === 'day' ? 'dayToNight' :
        null;
      if (transition) {
        if (transition === 'dayToNight') {
          holdDayToNightTransition(room, (r) => broadcastRoom(r, io));
        } else {
          schedulePhaseTransition(room, transition, (r) => broadcastRoom(r, io));
        }
      }
    }
  });

  socket.on('restartGame', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostId !== playerId) return;
    if (!getPlayerForSocket(room, playerId, socket.id)) return;
    if (room.phase !== 'ended') return;
    clearRoomTimers(room);
    room.phase = 'lobby';
    room.phaseStep = null;
    room.dayCount = 0;
    room.lovers = null;
    room.witchState = { healAvailable: true, poisonAvailable: true };
    room.wolfVotes = {};
    room.wolfTarget = null;
    room.healedTarget = null;
    room.poisonTarget = null;
    room.seerActed = false;
    room.voteState = createVoteState();
    room.pendingDeaths = [];
    room.winner = null;
    room.lastNightDeaths = [];
    room.lastDayDeaths = [];
    room.lastDayMessage = null;
    room.awaitingHunterShot = null;
    room.logs = [];
    room.nextNightStep = null;
    room.phaseTransition = null;
    room.phaseTimer = null;
    room.transitionTimer = null;
    room.hunterShotTimer = null;
    room.hunterShotQueue = [];
    Object.values(room.players).forEach((player) => {
      player.role = null;
      player.team = null;
      player.alive = true;
      player.voteTarget = null;
      player.nightAction = null;
      player.ready = false;
      player.seerResult = null;
    });
    addLog(room, 'Game reset. Back to lobby.');
    broadcastRoom(room, io);
  });

  socket.on('leaveRoom', ({ roomCode, playerId }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.({ error: 'Room not found' });
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player) return cb?.({ error: 'Player not found' });
    detachSocketFromRoom(io, socket.id, 'left the game');
    cb?.({ ok: true });
  });

  socket.on('requestState', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room) return;
    const player = room.players[playerId];
    if (!player) return;
    sendStateToPlayer(room, player, io);
  });

  socket.on('disconnect', () => {
    detachSocketFromRoom(io, socket.id, 'disconnected');
  });
}

export {
  setupSocketHandlers
};
