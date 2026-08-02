import type { Namespace, Socket } from 'socket.io';
import {
  sanitizeName,
  createVoteState,
  addLog,
  clearRoomTimers,
  errorResponse,
  localizedMessage,
  isDiscussionLocked,
} from '../utils/helpers';
import { createRoom, getRoom, deleteRoom } from '../models/room';
import { createPlayer, setSocketIndex, getSocketIndex, deleteSocketIndex } from '../models/player';
import {
  broadcastRoom,
  sendStateToPlayer,
  notifyAdminObserversRoomClosed,
} from '../managers/broadcastManager';
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
  beginDay,
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

/**
 * Grace period before a disconnected player is marked offline.
 * Phones lock their screen and the OS immediately closes the WebSocket,
 * but the client reconnects within seconds. With this buffer the "Disconnected"
 * badge never flashes for brief interruptions.
 */
const RECONNECT_GRACE_MS = 5_000;
const pendingDisconnects = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingDisconnect(playerId: string) {
  const timer = pendingDisconnects.get(playerId);
  if (timer) {
    clearTimeout(timer);
    pendingDisconnects.delete(playerId);
  }
}

// Exported so the admin close-session handler can cancel grace timers for
// every player in a room it is about to tear down.
export { cancelPendingDisconnect };

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
    addLog(
      room,
      `${player.name} ${reason}.`,
      null,
      reason === 'left the room'
        ? localizedMessage('server.logs.leftRoom', { name: player.name })
        : localizedMessage('server.logs.playerReason', { name: player.name, reason })
    );
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
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.(errorResponse('Name required', 'server.errors.nameRequired'));
    detachSocketFromRoom(io, socket.id, 'left the room');
    const { room, player } = createRoom(cleanName, socket.id, createPlayer);
    setSocketIndex(socket.id, room.code, player.id);
    cb?.({ roomCode: room.code, playerId: player.id, resumeToken: player.resumeToken });
    broadcastRoom(room, io);
  });

  socket.on('joinRoom', ({ name, code }, cb) => {
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.(errorResponse('Name required', 'server.errors.nameRequired'));
    const room = getRoom(code?.toUpperCase());
    if (!room) return cb?.(errorResponse('Room not found', 'server.errors.roomNotFound'));
    if (room.phase !== 'lobby') {
      return cb?.(errorResponse('Game already started', 'server.errors.gameAlreadyStarted'));
    }
    // Check for duplicate names
    const nameExists = Object.values(room.players).some((p) => p.name === cleanName);
    if (nameExists) {
      return cb?.(errorResponse('Name already taken', 'server.errors.nameAlreadyTaken'));
    }
    detachSocketFromRoom(io, socket.id, 'left the room');
    const player = createPlayer(cleanName, socket.id, false);
    room.players[player.id] = player;
    setSocketIndex(socket.id, room.code, player.id);
    updateHostIfNeeded(room);
    cb?.({ roomCode: room.code, playerId: player.id, resumeToken: player.resumeToken });
    broadcastRoom(room, io);
  });

  socket.on('resumePlayer', ({ roomCode, playerId, resumeToken }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.(errorResponse('Room not found', 'server.errors.roomNotFound'));
    const player = room.players[playerId];
    if (!player) return cb?.(errorResponse('Player not in room', 'server.errors.playerNotInRoom'));
    if (!player.resumeToken) {
      return cb?.(errorResponse('Invalid session', 'server.errors.invalidSession'));
    }
    if (!resumeToken || resumeToken !== player.resumeToken) {
      return cb?.(errorResponse('Invalid session', 'server.errors.invalidSession'));
    }

    // Only a validated resume may cancel the disconnect grace timer.
    cancelPendingDisconnect(playerId);
    const existingRef = getSocketIndex(socket.id);
    if (existingRef && (existingRef.roomCode !== roomCode || existingRef.playerId !== playerId)) {
      detachSocketFromRoom(io, socket.id, 'left the room');
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
    room.roleConfig = normalizeRoleConfig(config, room.roleConfig);
    if (config.passiveRoles) {
      room.passiveRoleConfig = normalizePassiveRoleConfig(
        config.passiveRoles,
        room.passiveRoleConfig
      );
    }
    if (typeof config.discussionTimerSeconds === 'number') {
      const clamped = Math.floor(config.discussionTimerSeconds);
      room.discussionTimerSeconds = Number.isFinite(clamped) && clamped >= 0 ? clamped : 0;
    }
    broadcastRoom(room, io);
  });

  socket.on('startGame', ({ roomCode, playerId }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.(errorResponse('Room missing', 'server.errors.roomMissing'));
    if (!getPlayerForSocket(room, playerId, socket.id)) {
      return cb?.(errorResponse('Player missing', 'server.errors.playerMissing'));
    }
    if (room.hostId !== playerId) {
      return cb?.(errorResponse('Only host can start', 'server.errors.onlyHostStart'));
    }
    if (room.phase !== 'lobby') {
      return cb?.(errorResponse('Already started', 'server.errors.alreadyStarted'));
    }
    const validation = validateCounts(room);
    if ('error' in validation) return cb?.(validation);
    assignRoles(room);
    room.phase = 'roleReveal';
    room.phaseStep = null;
    room.dayCount = 0;
    room.lastNightDeaths = [];
    room.voteState = createVoteState();
    cb?.({ ok: true });
    addLog(
      room,
      'Roles assigned. Secret information has been delivered.',
      null,
      localizedMessage('server.logs.rolesAssigned')
    );
    broadcastRoom(room, io);
  });

  socket.on('markReady', ({ roomCode, playerId }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.(errorResponse('Room missing', 'server.errors.roomMissing'));
    if (room.phase !== 'roleReveal') {
      return cb?.(errorResponse('Not in roleReveal phase', 'server.errors.notRoleReveal'));
    }
    const player = room.players[playerId];
    if (!player) return cb?.(errorResponse('Player missing', 'server.errors.playerMissing'));
    if (player.socketId !== socket.id) {
      return cb?.(errorResponse('Socket mismatch', 'server.errors.socketMismatch'));
    }
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
      `${target.name} has been appointed as the new Mayor.`,
      localizedMessage('server.logs.mayorSelected', {
        selector: player.name,
        successor: target.name,
      }),
      localizedMessage('server.logs.mayorSelectedPublic', {
        successor: target.name,
      })
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
      'The Lovers have been chosen.',
      localizedMessage('server.logs.loversChosen', { name: player.name }),
      localizedMessage('server.logs.loversChosenPublic')
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
        `${player.name} changed their wolf vote${votedPlayer ? ` to ${votedPlayer.name}` : ''}.`,
        null,
        votedPlayer
          ? localizedMessage('server.logs.wolfVoteChangedTarget', {
              name: player.name,
              target: votedPlayer.name,
            })
          : localizedMessage('server.logs.wolfVoteChanged', { name: player.name })
      );
    }
    if (!tryFinalizeWolfVote(room, (r) => broadcastRoom(r, io), io)) {
      broadcastRoom(room, io);
    }
  });

  socket.on('submitSeerInspect', ({ roomCode, playerId, targetId }, cb) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'seer') {
      return cb?.(errorResponse('Invalid room or phase', 'server.errors.invalidRoomOrPhase'));
    }
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'seer' || !player.alive) {
      return cb?.(errorResponse('Invalid player', 'server.errors.invalidPlayer'));
    }
    if (targetId === playerId) {
      return cb?.(errorResponse('Cannot inspect yourself', 'server.errors.cannotInspectSelf'));
    }
    const target = room.players[targetId];
    if (!target || !target.alive) {
      return cb?.(errorResponse('Invalid target', 'server.errors.invalidTarget'));
    }
    const result = target.role === 'werewolf' ? 'Werewolf' : 'Not Werewolf';
    player.seerResult = { name: target.name, result };
    cb?.({ ok: true, name: target.name, result });
    room.seerActed = true;
    room.seerAwaitingDismiss = true;
    addLog(
      room,
      `Seer inspected ${target.name} (${result}).`,
      null,
      localizedMessage('server.logs.seerInspected', { target: target.name, result }),
      null,
      true
    );
    broadcastRoom(room, io);
  });

  socket.on('seerContinue', ({ roomCode, playerId }) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'seer') return;
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'seer' || !player.alive) return;
    if (!room.seerAwaitingDismiss) return;
    room.seerAwaitingDismiss = false;
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
    if (!room || room.phase !== 'night' || room.phaseStep !== 'guard') {
      return cb?.(errorResponse('Invalid room or phase', 'server.errors.invalidRoomOrPhase'));
    }

    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'guard' || !player.alive) {
      return cb?.(errorResponse('Invalid player', 'server.errors.invalidPlayer'));
    }

    if (targetId === playerId) {
      return cb?.(errorResponse('Cannot protect yourself', 'server.errors.cannotProtectSelf'));
    }

    // Check consecutive protection rule
    if (room.lastGuardedTarget && room.lastGuardedTarget === targetId) {
      return cb?.(
        errorResponse(
          'Cannot protect the same player two nights in a row',
          'server.errors.cannotProtectSame'
        )
      );
    }

    const target = room.players[targetId];
    if (!target || !target.alive) {
      return cb?.(errorResponse('Invalid target', 'server.errors.invalidTarget'));
    }

    room.guardedTarget = targetId;
    room.guardActed = true;
    cb?.({ ok: true });
    addLog(
      room,
      `Guard protected ${target.name}.`,
      null,
      localizedMessage('server.logs.guardProtected', { target: target.name }),
      null,
      true
    );

    advanceNightStep(room, (r) => broadcastRoom(r, io), io);
  });

  socket.on('submitHarlotVisit', ({ roomCode, playerId, targetId }, cb) => {
    const room = getRoom(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'harlot') {
      return cb?.(errorResponse('Invalid room or phase', 'server.errors.invalidRoomOrPhase'));
    }

    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player || player.role !== 'harlot' || !player.alive) {
      return cb?.(errorResponse('Invalid player', 'server.errors.invalidPlayer'));
    }

    if (targetId === playerId) {
      return cb?.(errorResponse('Cannot visit yourself', 'server.errors.cannotVisitSelf'));
    }

    const target = room.players[targetId];
    if (!target || !target.alive) {
      return cb?.(errorResponse('Invalid target', 'server.errors.invalidTarget'));
    }

    room.harlotVisitedTarget = targetId;
    room.harlotActed = true;
    cb?.({ ok: true });
    addLog(
      room,
      `Harlot visited ${target.name}.`,
      null,
      localizedMessage('server.logs.harlotVisited', { target: target.name }),
      null,
      true
    );

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
        beginDay(room);
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
      addLog(
        room,
        'Armor selection skipped. Moving to night.',
        null,
        localizedMessage('server.logs.armorSkipped')
      );
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
      room.seerAwaitingDismiss = false;
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
    if (isDiscussionLocked(room)) return;
    const player = room.players[playerId];
    if (!player || !player.alive) return;
    if (player.socketId !== socket.id) return;
    if (room.voteState.votes[playerId] !== undefined) return;
    // Require explicit selection: targetId must be provided (string for player, null for abstain)
    // Reject undefined or an empty string which indicate no selection was made
    if (targetId === undefined || targetId === '') return;
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
    if (isDiscussionLocked(room)) return;
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
    room.seerAwaitingDismiss = false;
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
    room.lastDayMessageI18n = null;
    room.awaitingHunterShot = null;
    room.dayVoteResolved = false;
    room.discussionEndsAt = null;
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
    addLog(room, 'Game reset. Back to lobby.', null, localizedMessage('server.logs.gameReset'));
    broadcastRoom(room, io);
  });

  socket.on('kickPlayer', ({ roomCode, playerId, targetId }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.(errorResponse('Room not found', 'server.errors.roomNotFound'));
    if (room.phase !== 'lobby') {
      return cb?.(errorResponse('Can only kick during lobby', 'server.errors.canOnlyKickLobby'));
    }
    if (!getPlayerForSocket(room, playerId, socket.id)) {
      return cb?.(errorResponse('Player not found', 'server.errors.playerNotFound'));
    }
    if (room.hostId !== playerId) {
      return cb?.(errorResponse('Only host can kick players', 'server.errors.onlyHostKick'));
    }
    if (playerId === targetId) {
      return cb?.(errorResponse('Cannot kick yourself', 'server.errors.cannotKickSelf'));
    }
    const target = room.players[targetId];
    if (!target) return cb?.(errorResponse('Target not found', 'server.errors.targetNotFound'));

    addLog(
      room,
      `${target.name} was kicked from the room.`,
      null,
      localizedMessage('server.logs.kicked', { name: target.name })
    );
    // Disconnect the kicked player's socket
    if (target.socketId) {
      const targetSocket = io.sockets.get(target.socketId);
      deleteSocketIndex(target.socketId);
      if (targetSocket) {
        targetSocket.disconnect(true);
      }
    }
    delete room.players[targetId];
    updateHostIfNeeded(room);
    cb?.({ ok: true });
    broadcastRoom(room, io);
  });

  socket.on('leaveRoom', ({ roomCode, playerId }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.(errorResponse('Room not found', 'server.errors.roomNotFound'));
    const player = getPlayerForSocket(room, playerId, socket.id);
    if (!player) return cb?.(errorResponse('Player not found', 'server.errors.playerNotFound'));

    const wasAlive = player.alive;
    const playerRole = player.role;
    const playerPhaseStep = room.phaseStep;

    // Remove player completely from the room
    addLog(
      room,
      `${player.name} left the game.`,
      null,
      localizedMessage('server.logs.leftGame', { name: player.name })
    );
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
    let clearedPendingPlayerAction = false;

    // If the game hasn't started yet or already ended, just broadcast
    if (room.phase === 'lobby' || room.phase === 'ended') {
      broadcastRoom(room, io);
      cb?.({ ok: true });
      return;
    }

    // If no players remain, tear the empty room down immediately so it does
    // not linger in the admin room list. Notify admin observers and delete.
    if (!Object.keys(room.players).length) {
      notifyAdminObserversRoomClosed(room.code, io);
      deleteRoom(room.code);
      cb?.({ ok: true });
      return;
    }

    // Clear timers for awaiting actions that belonged to this player
    if (room.awaitingHunterShot === playerId) {
      clearedPendingPlayerAction = true;
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
      clearedPendingPlayerAction = true;
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

    // If a dead player was the final pending hunter/mayor prompt and no queued
    // prompt replaced it, continue the phase just like a completed prompt.
    if (clearedPendingPlayerAction && !room.awaitingHunterShot && !room.awaitingMayorSelection) {
      if (room.phase === 'day') {
        room.dayVoteResolved = true;
        holdDayToNightTransition(room, (r) => broadcastRoom(r, io));
      } else if (room.phase === 'night') {
        schedulePhaseTransition(room, 'nightToDay', (r) => broadcastRoom(r, io));
      }
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
          room.seerAwaitingDismiss = false;
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
        addLog(
          room,
          'Armor left the game. Skipping armor phase.',
          null,
          localizedMessage('server.logs.armorLeft')
        );
        schedulePhaseTransition(room, 'postArmor', (r) => broadcastRoom(r, io));
      }
    }

    broadcastRoom(room, io);
    cb?.({ ok: true });
  });

  socket.on('closeSession', ({ roomCode, playerId }, cb) => {
    const room = getRoom(roomCode);
    if (!room) return cb?.(errorResponse('Room not found', 'server.errors.roomNotFound'));
    if (!getPlayerForSocket(room, playerId, socket.id)) {
      return cb?.(errorResponse('Player not found', 'server.errors.playerNotFound'));
    }
    if (room.hostId !== playerId) {
      return cb?.(errorResponse('Only host can close the session', 'server.errors.onlyHostClose'));
    }

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

    // Also release any admin observers watching this room.
    notifyAdminObserversRoomClosed(roomCode, io);

    deleteRoom(roomCode);
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
    const ref = getSocketIndex(socket.id);
    if (!ref) return;
    // Remove the socket→player mapping immediately so no stale index persists.
    // The player state and broadcast are delayed to absorb brief mobile interruptions.
    deleteSocketIndex(socket.id);
    const { playerId, roomCode } = ref;
    const disconnectedSocketId = socket.id;
    cancelPendingDisconnect(playerId);
    const timer = setTimeout(() => {
      pendingDisconnects.delete(playerId);
      const room = getRoom(roomCode);
      if (!room) return;
      const player = room.players[playerId];
      // If the player reconnected in the meantime their socketId was updated — skip.
      if (!player || player.socketId !== disconnectedSocketId) return;
      player.connected = false;
      player.socketId = null;
      addLog(
        room,
        `${player.name} disconnected.`,
        null,
        localizedMessage('server.logs.disconnected', { name: player.name })
      );
      updateHostIfNeeded(room);
      if (
        room.phase === 'day' &&
        player.alive &&
        !room.phaseTransition &&
        !room.awaitingHunterShot
      ) {
        tryResolveDayVote(room, (r) => broadcastRoom(r, io), io);
      }
      if (room.phase === 'mayor' && player.alive) {
        tryResolveMayorVote(room, (r) => broadcastRoom(r, io));
      }
      if (
        room.phase === 'night' &&
        room.phaseStep === 'seer' &&
        room.seerAwaitingDismiss &&
        player.role === 'seer'
      ) {
        room.seerAwaitingDismiss = false;
        advanceNightStep(room, (r) => broadcastRoom(r, io), io);
        return;
      }
      broadcastRoom(room, io);
    }, RECONNECT_GRACE_MS);
    pendingDisconnects.set(playerId, timer);
  });
}

export { setupSocketHandlers };
