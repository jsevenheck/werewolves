import type { Namespace, Socket } from 'socket.io';
import { sanitizeName, createVoteState, addLog, clearRoomTimers } from '../utils/helpers';
import { createRoom, getRoom, getRoomCodeBySessionId, linkSessionToRoom } from '../models/room';
import { createPlayer, setSocketIndex, getSocketIndex, deleteSocketIndex } from '../models/player';
import { broadcastRoom, sendStateToPlayer } from '../managers/broadcastManager';
import {
  normalizeRoleConfig,
  normalizePassiveRoleConfig,
  validateCounts,
  assignRoles,
} from '../managers/roleManager';
import {
  schedulePhaseTransition,
  scheduleNightStep,
  advanceFromReveal,
  advanceFromMayor,
  startNight,
  notifyLovers,
  holdDayToNightTransition,
} from '../managers/phaseManager';
import {
  tryFinalizeWolfVote,
  advanceNightStep,
  handleWitchDecision,
  resolveNight,
} from '../managers/nightManager';
import { tryResolveDayVote } from '../managers/voteManager';
import {
  queueDeath,
  resolveDeaths,
  startNextHunterShot,
  checkWinners,
} from '../managers/deathManager';
import { startNextMayorSelection, tryResolveMayorVote } from '../managers/mayorManager';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../core/src/events';
import type { Room } from '../../../core/src/types';

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
  io: Namespace<ClientToServerEvents, ServerToClientEvents>,
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
  if (room.phase === 'day' && player.alive && !room.phaseTransition && !room.awaitingHunterShot) {
    tryResolveDayVote(room, (r) => broadcastRoom(r, io), io);
  }
  if (room.phase === 'mayor' && player.alive) {
    tryResolveMayorVote(room, (r) => broadcastRoom(r, io));
  }
  broadcastRoom(room, io);
}

function setupSocketHandlers(
  io: Namespace<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
) {
  socket.on('createRoom', ({ name }, cb) => {
    detachSocketFromRoom(io, socket.id, 'left the room');
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.({ error: 'Name required' });
    const { room, player } = createRoom(cleanName, socket.id, createPlayer);
    setSocketIndex(socket.id, room.code, player.id);
    cb?.({ roomCode: room.code, playerId: player.id, resumeToken: player.resumeToken });
    broadcastRoom(room, io);
  });

  socket.on('joinRoom', ({ name, code }, cb) => {
    detachSocketFromRoom(io, socket.id, 'left the room');
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.({ error: 'Name required' });
    const room = getRoom(code?.toUpperCase());
    if (!room) return cb?.({ error: 'Room not found' });
    if (room.phase !== 'lobby') return cb?.({ error: 'Game already started' });
    // Check for duplicate names
    const nameExists = Object.values(room.players).some((p) => p.name === cleanName);
    if (nameExists) return cb?.({ error: 'Name already taken' });
    const player = createPlayer(cleanName, socket.id, false);
    room.players[player.id] = player;
    setSocketIndex(socket.id, room.code, player.id);
    updateHostIfNeeded(room);
    cb?.({ roomCode: room.code, playerId: player.id, resumeToken: player.resumeToken });
    broadcastRoom(room, io);
  });

  // Hub integration: automatically create or join a room keyed by platform sessionId.
  // The platform player ID is accepted as-is so that the hub can correlate game state
  // back to its own user records.
  socket.on('autoJoinRoom', ({ sessionId, playerId: hubPlayerIdRaw, name }, cb) => {
    try {
      if (!sessionId || typeof sessionId !== 'string') return cb?.({ error: 'sessionId required' });
      detachSocketFromRoom(io, socket.id, 'left the room');

      const cleanName = sanitizeName(name) || 'Player';
      const hubPlayerId =
        typeof hubPlayerIdRaw === 'string' && hubPlayerIdRaw.trim().length > 0
          ? hubPlayerIdRaw
          : undefined;
      const existingCode = getRoomCodeBySessionId(sessionId);
      let room = existingCode ? getRoom(existingCode) : undefined;

      if (!room) {
        // First player for this session → create the room
        const created = createRoom(cleanName, socket.id, (n, sid, isHost) => {
          const player = createPlayer(n, sid, isHost);
          // Override generated ID with the hub-supplied one when available
          if (hubPlayerId) player.id = hubPlayerId;
          return player;
        });
        room = created.room;
        linkSessionToRoom(sessionId, room.code);
        setSocketIndex(socket.id, room.code, created.player.id);
        cb?.({
          roomCode: room.code,
          playerId: created.player.id,
          resumeToken: created.player.resumeToken,
        });
        broadcastRoom(room, io);
        return;
      }

      // Room already exists – check if this player is already present (reconnect).
      // Reconnect detection relies on a stable hubPlayerId supplied by the platform.
      // Without it existingPlayer is always undefined and the request falls through
      // to the "new player" branch, which will create a duplicate slot.
      const existingPlayer = hubPlayerId ? room.players[hubPlayerId] : undefined;
      if (existingPlayer) {
        // Detach the previous socket so its socketIndex entry is removed and the
        // old connection is torn down – prevents a stale disconnect from later
        // marking this player as disconnected.
        if (existingPlayer.socketId && existingPlayer.socketId !== socket.id) {
          const previousSocketId = existingPlayer.socketId;
          const previousSocket = io.sockets.get(previousSocketId);
          if (previousSocket) {
            detachSocketFromRoom(io, previousSocketId);
            previousSocket.disconnect(true);
          } else {
            deleteSocketIndex(previousSocketId);
          }
        }
        // Reconnect: reuse the existing player slot
        existingPlayer.socketId = socket.id;
        existingPlayer.connected = true;
        setSocketIndex(socket.id, room.code, existingPlayer.id);
        cb?.({
          roomCode: room.code,
          playerId: existingPlayer.id,
          resumeToken: existingPlayer.resumeToken,
        });
        broadcastRoom(room, io);
        return;
      }

      // New player joining an existing room
      if (room.phase !== 'lobby') return cb?.({ error: 'Game already started' });
      const nameExists = Object.values(room.players).some((p) => p.name === cleanName);
      if (nameExists) return cb?.({ error: 'Name already taken' });
      const player = createPlayer(cleanName, socket.id, false);
      if (hubPlayerId) player.id = hubPlayerId;
      room.players[player.id] = player;
      setSocketIndex(socket.id, room.code, player.id);
      updateHostIfNeeded(room);
      cb?.({ roomCode: room.code, playerId: player.id, resumeToken: player.resumeToken });
      broadcastRoom(room, io);
    } catch {
      cb?.({ error: 'Failed to join room' });
    }
  });

  socket.on('resumePlayer', ({ roomCode, playerId, resumeToken }, cb) => {
    const existingRef = getSocketIndex(socket.id);
    if (existingRef && (existingRef.roomCode !== roomCode || existingRef.playerId !== playerId)) {
      detachSocketFromRoom(io, socket.id, 'left the room');
    }
    const room = getRoom(roomCode);
    if (!room) return cb?.({ error: 'Room not found' });
    const player = room.players[playerId];
    if (!player) return cb?.({ error: 'Player not in room' });
    if (!player.resumeToken) {
      return cb?.({ error: 'Invalid session' });
    }
    if (!resumeToken || resumeToken !== player.resumeToken) {
      return cb?.({ error: 'Invalid session' });
    }
    if (player.socketId && player.socketId !== socket.id) {
      const previousSocketId = player.socketId;
      const previousSocket = io.sockets.get(previousSocketId);
      if (previousSocket) {
        detachSocketFromRoom(io, previousSocketId);
        previousSocket.disconnect(true);
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
    if (config.passiveRoles) {
      room.passiveRoleConfig = normalizePassiveRoleConfig(config.passiveRoles);
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
    // Only count connected players - disconnected players should not block game start
    const connectedPlayers = Object.values(room.players).filter((p) => p.connected);
    const allConnectedReady = connectedPlayers.every((p) => p.ready);
    if (!allConnectedReady || connectedPlayers.length === 0) return;
    schedulePhaseTransition(room, 'postReveal', (r) => broadcastRoom(r, io));
  });

  socket.on('selectMayor', ({ roomCode, playerId, targetId }) => {
    const room = getRoom(roomCode);
    if (!room) return;
    const player = room.players[playerId];
    if (!player) return;
    if (player.socketId !== socket.id) return;

    // Mayor succession - dying mayor selects successor
    if (room.awaitingMayorSelection !== playerId) return;
    const target = room.players[targetId];
    if (!target || !target.alive) return;
    if (room.mayorSelectionTimer) {
      clearTimeout(room.mayorSelectionTimer);
      room.mayorSelectionTimer = null;
    }
    room.mayorId = targetId;
    addLog(
      room,
      `${target.name} has been appointed as the new Mayor by ${player.name}.`,
      `${target.name} has been appointed as the new Mayor.`
    );
    room.awaitingMayorSelection = null;

    // Check if there are more mayor selections pending
    if (startNextMayorSelection(room, (r) => broadcastRoom(r, io), io)) {
      return;
    }

    // Continue with hunter shots if any are pending
    if (startNextHunterShot(room, (r) => broadcastRoom(r, io), io)) {
      return;
    }

    // Check win conditions and continue
    checkWinners(room);
    if (!room.winner && !room.awaitingHunterShot && !room.awaitingMayorSelection) {
      if (room.phase === 'day') {
        // Mark vote as resolved; host must manually proceed to night
        room.dayVoteResolved = true;
      } else if (room.phase === 'night' && room.phaseStep === 'resolve') {
        // Resume night->day transition after mayor succession during night
        schedulePhaseTransition(room, 'nightToDay', (r) => broadcastRoom(r, io));
      }
    }
    broadcastRoom(room, io);
  });

  socket.on('submitMayorVote', ({ roomCode, playerId, targetId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'mayor') return;
    if (room.mayorId || room.phaseTransition === 'postMayor') return;
    const player = room.players[playerId];
    if (!player || !player.alive) return;
    if (player.socketId !== socket.id) return;
    if (room.voteState.votes[playerId] !== undefined) return;
    if (
      room.voteState.revoteFromTie &&
      targetId &&
      !room.voteState.revoteFromTie.includes(targetId)
    ) {
      return;
    }
    if (!targetId) return;
    if (!room.players[targetId]?.alive) return;
    room.voteState.votes[playerId] = targetId;
    if (!tryResolveMayorVote(room, (r) => broadcastRoom(r, io))) {
      broadcastRoom(room, io);
    }
  });

  socket.on('submitArmor', ({ roomCode, playerId, targets }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'armor') return;
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'armor' || !player.alive) return;
    if (room.lovers) return;
    if (!Array.isArray(targets) || targets.length !== 2) return;
    const [a, b] = targets;
    // Prevent selecting same player twice or armor selecting themselves
    if (a === b || a === playerId || b === playerId) return;
    const targetA = room.players[a];
    const targetB = room.players[b];
    if (!targetA || !targetB || !targetA.alive || !targetB.alive) return;
    room.lovers = { aId: a, bId: b };
    notifyLovers(room);
    addLog(
      room,
      `${player.name} linked two souls together as Lovers.`,
      'The Lovers have been chosen.'
    );
    schedulePhaseTransition(room, 'postArmor', (r) => broadcastRoom(r, io));
  });

  socket.on('submitWolfVote', ({ roomCode, playerId, targetId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'wolves') return;
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'werewolf' || !player.alive) return;
    // Allow wolves to change their vote (by checking only for having voted before)
    // If vote is not undefined, they've already submitted a vote
    const alreadyVoted = room.wolfVotes[playerId] !== undefined;
    if (targetId && !room.players[targetId]?.alive) return;
    if (targetId && room.players[targetId]?.role === 'werewolf') return;
    room.wolfVotes[playerId] = targetId || null;
    // Inform wolves when they update their vote
    if (alreadyVoted) {
      const votedPlayer = targetId ? room.players[targetId] : null;
      addLog(
        room,
        `${player.name} changed their wolf vote${votedPlayer ? ` to ${votedPlayer.name}` : ''}.`
      );
    }
    if (!tryFinalizeWolfVote(room, (r) => broadcastRoom(r, io), io)) {
      broadcastRoom(room, io);
    }
  });

  socket.on('submitSeerInspect', ({ roomCode, playerId, targetId }, cb) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'seer')
      return cb?.({ error: 'Invalid room or phase' });
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'seer' || !player.alive)
      return cb?.({ error: 'Invalid player' });
    if (targetId === playerId) return cb?.({ error: 'Cannot inspect yourself' });
    const target = room.players[targetId];
    if (!target || !target.alive) return cb?.({ error: 'Invalid target' });
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

  socket.on('submitGuardProtection', ({ roomCode, playerId, targetId }, cb) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'guard')
      return cb?.({ error: 'Invalid room or phase' });

    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'guard' || !player.alive)
      return cb?.({ error: 'Invalid player' });

    if (targetId === playerId) return cb?.({ error: 'Cannot protect yourself' });

    // Check consecutive protection rule
    if (room.lastGuardedTarget && room.lastGuardedTarget === targetId)
      return cb?.({ error: 'Cannot protect the same player two nights in a row' });

    const target = room.players[targetId];
    if (!target || !target.alive) return cb?.({ error: 'Invalid target' });

    room.guardedTarget = targetId;
    room.guardActed = true;
    cb?.({ ok: true });

    advanceNightStep(room, (r) => broadcastRoom(r, io), io);
  });

  socket.on('submitHarlotVisit', ({ roomCode, playerId, targetId }, cb) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'harlot')
      return cb?.({ error: 'Invalid room or phase' });

    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'harlot' || !player.alive)
      return cb?.({ error: 'Invalid player' });

    if (targetId === playerId) return cb?.({ error: 'Cannot visit yourself' });

    const target = room.players[targetId];
    if (!target || !target.alive) return cb?.({ error: 'Invalid target' });

    room.harlotVisitedTarget = targetId;
    room.harlotActed = true;
    cb?.({ ok: true });

    advanceNightStep(room, (r) => broadcastRoom(r, io), io);
  });

  socket.on('hostSkipStep', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostId !== playerId) return;
    if (!getPlayerForSocket(room, playerId, socket.id)) return;
    if (
      room.phase !== 'night' &&
      room.phase !== 'mayor' &&
      room.phase !== 'armor' &&
      !room.phaseTransition &&
      !room.awaitingHunterShot &&
      !room.awaitingMayorSelection
    )
      return;

    if (room.awaitingMayorSelection) {
      room.awaitingMayorSelection = null;
      if (room.mayorSelectionTimer) {
        clearTimeout(room.mayorSelectionTimer);
        room.mayorSelectionTimer = null;
      }
      if (startNextMayorSelection(room, (r) => broadcastRoom(r, io), io)) {
        return;
      }
      if (startNextHunterShot(room, (r) => broadcastRoom(r, io), io)) {
        return;
      }
      if (!room.winner) {
        checkWinners(room);
      }
      if (!room.winner) {
        const transition =
          room.phase === 'night' ? 'nightToDay' : room.phase === 'day' ? 'dayToNight' : null;
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

    if (room.awaitingHunterShot) {
      room.awaitingHunterShot = null;
      if (room.hunterShotTimer) {
        clearTimeout(room.hunterShotTimer);
        room.hunterShotTimer = null;
      }
      room.hunterShotEndsAt = null;
      if (startNextHunterShot(room, (r) => broadcastRoom(r, io), io)) {
        return;
      }
      if (!room.winner) {
        checkWinners(room);
      }
      if (!room.winner) {
        const transition =
          room.phase === 'night' ? 'nightToDay' : room.phase === 'day' ? 'dayToNight' : null;
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
        resolveNight(room, (r: typeof room) => broadcastRoom(r, io), io);
      } else if (step === 'seer' || step === 'witch' || step === 'guard' || step === 'harlot') {
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
      if (kind === 'postMayor') {
        advanceFromMayor(room, (r) => broadcastRoom(r, io));
        return;
      }
      if (kind === 'postArmor') {
        startNight(room);
        broadcastRoom(room, io);
        return;
      }
      return;
    }

    if (room.phase === 'mayor') {
      tryResolveMayorVote(room, (r) => broadcastRoom(r, io), { allowEarly: true });
      return;
    }

    if (room.phase === 'armor') {
      addLog(room, 'Armor selection skipped. Moving to night.');
      schedulePhaseTransition(room, 'postArmor', (r) => broadcastRoom(r, io));
      return;
    }

    if (room.phaseStep === 'wolves') {
      const livingWolves = Object.values(room.players).filter(
        (p) => p.role === 'werewolf' && p.alive
      );
      if (livingWolves.length === 0) {
        room.wolfTarget = null;
        scheduleNightStep(room, 'seer', (r: typeof room) => broadcastRoom(r, io), io);
        return;
      }
      livingWolves.forEach((wolf) => {
        if (room.wolfVotes[wolf.id] === undefined || room.wolfVotes[wolf.id] === null) {
          room.wolfVotes[wolf.id] = null;
        }
      });
      tryFinalizeWolfVote(room, (r) => broadcastRoom(r, io), io, { allowNoKill: true });
      return;
    }

    if (room.phaseStep === 'seer') {
      room.seerActed = true;
      scheduleNightStep(room, 'witch', (r: typeof room) => broadcastRoom(r, io), io);
      return;
    }

    if (room.phaseStep === 'witch') {
      handleWitchDecision(room, null, 'skip', null, (r) => broadcastRoom(r, io), io);
      return;
    }

    if (room.phaseStep === 'guard') {
      room.guardActed = true;
      scheduleNightStep(room, 'harlot', (r: typeof room) => broadcastRoom(r, io), io);
      return;
    }

    if (room.phaseStep === 'harlot') {
      room.harlotActed = true;
      scheduleNightStep(room, 'resolve', (r: typeof room) => broadcastRoom(r, io), io);
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
    // Require explicit selection: targetId must be provided (string for player, null for abstain)
    // Reject undefined which indicates no selection was made
    if (targetId === undefined) return;
    if (
      room.voteState.revoteFromTie &&
      targetId &&
      !room.voteState.revoteFromTie.includes(targetId)
    ) {
      return;
    }
    if (targetId && !room.players[targetId]?.alive) return;
    room.voteState.votes[playerId] = targetId;
    if (!tryResolveDayVote(room, (r) => broadcastRoom(r, io), io)) {
      broadcastRoom(room, io);
    }
  });

  socket.on('hostFinalizeDayVote', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'day') return;
    if (room.hostId !== playerId) return;
    if (!getPlayerForSocket(room, playerId, socket.id)) return;
    tryResolveDayVote(room, (r) => broadcastRoom(r, io), io, { allowEarly: true });
  });

  socket.on('hostProceedToNight', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'day') return;
    if (room.hostId !== playerId) return;
    if (!getPlayerForSocket(room, playerId, socket.id)) return;
    if (!room.dayVoteResolved) return;
    // Check if game has already ended before transitioning
    if (room.winner) {
      broadcastRoom(room, io);
      return;
    }
    // Check win conditions before starting the night
    checkWinners(room);
    if (room.winner) {
      broadcastRoom(room, io);
      return;
    }
    holdDayToNightTransition(room, (r) => broadcastRoom(r, io));
  });

  socket.on('hostFinalizeMayorVote', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'mayor') return;
    if (room.hostId !== playerId) return;
    if (!getPlayerForSocket(room, playerId, socket.id)) return;
    tryResolveMayorVote(room, (r) => broadcastRoom(r, io), { allowEarly: true });
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
    room.hunterShotEndsAt = null;
    queueDeath(room, targetId, 'shot by Hunter');
    room.awaitingHunterShot = null;
    const context = room.phase === 'night' ? 'night' : room.phase === 'day' ? 'day' : 'general';
    resolveDeaths(room, context, (r) => broadcastRoom(r, io), io);
    if (startNextHunterShot(room, (r) => broadcastRoom(r, io), io)) {
      return;
    }
    // After all hunter shots, check for mayor succession
    if (startNextMayorSelection(room, (r: Room) => broadcastRoom(r, io), io)) {
      return;
    }
    if (!room.winner && !room.awaitingHunterShot && !room.awaitingMayorSelection) {
      const transition =
        room.phase === 'night' ? 'nightToDay' : room.phase === 'day' ? 'dayToNight' : null;
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
    room.mayorId = null;
    room.awaitingMayorSelection = null;
    room.mayorSelectionQueue = [];
    room.mayorSelectionTimer = null;
    room.lovers = null;
    room.witchState = { healAvailable: true, poisonAvailable: true };
    room.wolfVotes = {};
    room.wolfTarget = null;
    room.healedTarget = null;
    room.poisonTarget = null;
    room.seerActed = false;
    room.guardedTarget = null;
    room.lastGuardedTarget = null;
    room.guardActed = false;
    room.harlotVisitedTarget = null;
    room.harlotActed = false;
    room.voteState = createVoteState();
    room.pendingDeaths = [];
    room.winner = null;
    room.lastNightDeaths = [];
    room.lastDayDeaths = [];
    room.lastDayMessage = null;
    room.awaitingHunterShot = null;
    room.dayVoteResolved = false;
    room.logs = [];
    room.nextNightStep = null;
    room.phaseTransition = null;
    room.phaseTimer = null;
    room.transitionTimer = null;
    room.hunterShotTimer = null;
    room.hunterShotEndsAt = null;
    room.hunterShotQueue = [];
    Object.values(room.players).forEach((player) => {
      player.role = null;
      player.team = null;
      player.alive = true;
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

    const wasAlive = player.alive;
    const playerRole = player.role;
    const playerPhaseStep = room.phaseStep;

    // Remove player completely from the room
    addLog(room, `${player.name} left the game.`);
    delete room.players[playerId];
    deleteSocketIndex(socket.id);

    // Clean up any references to this player
    if (room.mayorId === playerId) room.mayorId = null;
    if (room.wolfTarget === playerId) room.wolfTarget = null;
    if (room.healedTarget === playerId) room.healedTarget = null;
    if (room.poisonTarget === playerId) room.poisonTarget = null;
    if (room.guardedTarget === playerId) room.guardedTarget = null;
    if (playerRole === 'guard') {
      room.guardedTarget = null;
      room.lastGuardedTarget = null;
    }
    if (room.lovers && (room.lovers.aId === playerId || room.lovers.bId === playerId)) {
      room.lovers = null;
    }
    room.hunterShotQueue = room.hunterShotQueue.filter((id) => id !== playerId);
    room.mayorSelectionQueue = room.mayorSelectionQueue.filter((id) => id !== playerId);
    delete room.wolfVotes[playerId];
    delete room.voteState.votes[playerId];
    // Remove stale votes targeting the departed player
    for (const [voterId, targetId] of Object.entries(room.voteState.votes)) {
      if (targetId === playerId) {
        delete room.voteState.votes[voterId];
      }
    }
    // Remove from revote tie list
    if (room.voteState.revoteFromTie) {
      room.voteState.revoteFromTie = room.voteState.revoteFromTie.filter((id) => id !== playerId);
      if (room.voteState.revoteFromTie.length === 0) {
        room.voteState.revoteFromTie = null;
      }
    }
    updateHostIfNeeded(room);

    // --- Game flow continuation after player removal ---
    // If the game hasn't started yet or already ended, just broadcast
    if (room.phase === 'lobby' || room.phase === 'ended') {
      broadcastRoom(room, io);
      cb?.({ ok: true });
      return;
    }

    // If no players remain, nothing to resolve
    if (!Object.keys(room.players).length) {
      broadcastRoom(room, io);
      cb?.({ ok: true });
      return;
    }

    // Clear timers for awaiting actions that belonged to this player
    if (room.awaitingHunterShot === playerId) {
      room.awaitingHunterShot = null;
      if (room.hunterShotTimer) {
        clearTimeout(room.hunterShotTimer);
        room.hunterShotTimer = null;
      }
      room.hunterShotEndsAt = null;
      // Process remaining hunter/mayor queues
      if (!startNextHunterShot(room, (r) => broadcastRoom(r, io), io)) {
        if (!startNextMayorSelection(room, (r) => broadcastRoom(r, io), io)) {
          checkWinners(room);
        }
      }
    }
    if (room.awaitingMayorSelection === playerId) {
      room.awaitingMayorSelection = null;
      if (room.mayorSelectionTimer) {
        clearTimeout(room.mayorSelectionTimer);
        room.mayorSelectionTimer = null;
      }
      if (!startNextMayorSelection(room, (r) => broadcastRoom(r, io), io)) {
        if (!startNextHunterShot(room, (r) => broadcastRoom(r, io), io)) {
          checkWinners(room);
        }
      }
    }

    // Check win conditions after removing the player
    if (!room.winner) {
      checkWinners(room);
    }
    if (room.winner) {
      broadcastRoom(room, io);
      cb?.({ ok: true });
      return;
    }

    // Continue game flow based on current phase if the departed player was alive
    if (wasAlive) {
      if (room.phase === 'day' && !room.phaseTransition && !room.awaitingHunterShot) {
        tryResolveDayVote(room, (r) => broadcastRoom(r, io), io);
      }

      if (room.phase === 'mayor') {
        tryResolveMayorVote(room, (r) => broadcastRoom(r, io));
      }

      if (room.phase === 'night') {
        // If the departing player was the active night role, advance the step
        if (playerPhaseStep === 'wolves' && playerRole === 'werewolf') {
          tryFinalizeWolfVote(room, (r) => broadcastRoom(r, io), io, { allowNoKill: true });
        } else if (playerPhaseStep === 'seer' && playerRole === 'seer') {
          room.seerActed = true;
          scheduleNightStep(room, 'witch', (r) => broadcastRoom(r, io), io);
        } else if (playerPhaseStep === 'witch' && playerRole === 'witch') {
          scheduleNightStep(room, 'guard', (r) => broadcastRoom(r, io), io);
        } else if (playerPhaseStep === 'guard' && playerRole === 'guard') {
          room.guardActed = true;
          scheduleNightStep(room, 'harlot', (r) => broadcastRoom(r, io), io);
        } else if (playerPhaseStep === 'harlot' && playerRole === 'harlot') {
          room.harlotActed = true;
          scheduleNightStep(room, 'resolve', (r) => broadcastRoom(r, io), io);
        }
      }

      if (room.phase === 'armor' && playerRole === 'armor') {
        addLog(room, 'Armor left the game. Skipping armor phase.');
        schedulePhaseTransition(room, 'postArmor', (r) => broadcastRoom(r, io));
      }
    }

    broadcastRoom(room, io);
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

export { setupSocketHandlers };
