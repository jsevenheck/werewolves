import type { Server } from 'socket.io';
import {
  NIGHT_DELAY_MS,
  PHASE_DELAY_MS,
  POST_ARMOR_DELAY_MS,
  POST_MAYOR_DELAY_MS,
  POST_REVEAL_DELAY_MS
} from '../config/constants';
import { createVoteState, addLog, clearRoomTimers } from '../utils/helpers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/events';
import type { NightStep, PhaseTransition, Room } from '../../shared/types';

function startNight(room: Room) {
  room.phase = 'night';
  room.phaseStep = 'wolves';
  room.nextNightStep = null;
  room.phaseTransition = null;
  clearRoomTimers(room);
  room.hunterShotQueue = [];
  room.mayorSelectionQueue = [];
  room.wolfVotes = {};
  // Don't pre-initialize wolf votes - leave them undefined until wolves actually vote
  room.wolfTarget = null;
  room.seerActed = false;
  room.pendingDeaths = [];
  room.lastNightDeaths = [];
  room.lastDayDeaths = [];
  room.lastDayMessage = null;
  room.voteState = createVoteState();
  room.awaitingHunterShot = null;
  room.awaitingMayorSelection = null;
  room.dayVoteResolved = false;
}

function scheduleNightStep(
  room: Room,
  nextStep: NightStep,
  broadcastRoom: (room: Room) => void,
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  const resolvedStep = resolveNightStep(room, nextStep);
  clearRoomTimers(room);
  room.phaseStep = 'transition';
  room.nextNightStep = resolvedStep;
  room.phaseTransition = null;
  broadcastRoom(room);
  room.transitionTimer = setTimeout(() => {
    room.transitionTimer = null;
    if (room.phase !== 'night') return;
    room.phaseStep = resolvedStep;
    room.nextNightStep = null;
    if (resolvedStep === 'resolve') {
      const { resolveNight } = require('./nightManager');
      resolveNight(room, broadcastRoom, io);
    } else if (resolvedStep === 'seer' || resolvedStep === 'witch') {
      const { advanceNightStep } = require('./nightManager');
      advanceNightStep(room, broadcastRoom, io);
    } else {
      broadcastRoom(room);
    }
  }, NIGHT_DELAY_MS);
}

function schedulePhaseTransition(
  room: Room,
  kind: PhaseTransition,
  broadcastRoom: (room: Room) => void
) {
  clearRoomTimers(room);
  room.phaseTransition = kind;
  room.nextNightStep = null;
  if (room.phase === 'night') {
    room.phaseStep = 'transition';
  }
  broadcastRoom(room);
  const delayMs =
    kind === 'postReveal' ? POST_REVEAL_DELAY_MS :
    kind === 'postMayor' ? POST_MAYOR_DELAY_MS :
    kind === 'postArmor' ? POST_ARMOR_DELAY_MS :
    PHASE_DELAY_MS;
  room.phaseTimer = setTimeout(() => {
    room.phaseTimer = null;
    if (room.winner) return;
    room.phaseTransition = null;
    if (kind === 'postReveal') {
      advanceFromReveal(room, broadcastRoom);
      return;
    }
    if (kind === 'postMayor') {
      advanceFromMayor(room, broadcastRoom);
      return;
    }
    if (kind === 'postArmor') {
      startNight(room);
      room.phaseStep = 'transition';
      room.nextNightStep = 'wolves';
      broadcastRoom(room);
      room.transitionTimer = setTimeout(() => {
        room.transitionTimer = null;
        if (room.phase !== 'night' || room.phaseStep !== 'transition') return;
        room.phaseStep = 'wolves';
        room.nextNightStep = null;
        broadcastRoom(room);
      }, NIGHT_DELAY_MS);
      return;
    }
    if (kind === 'nightToDay') {
      room.dayCount += 1;
      room.phase = 'day';
      room.phaseStep = null;
      room.nextNightStep = null;
      room.voteState = createVoteState();
      room.dayVoteResolved = false;
      addLog(room, `Day ${room.dayCount} has begun.`);
      broadcastRoom(room);
      return;
    }
    if (kind === 'dayToNight') {
      startNight(room);
      broadcastRoom(room);
    }
  }, delayMs);
}

function holdDayToNightTransition(room: Room, broadcastRoom: (room: Room) => void) {
  schedulePhaseTransition(room, 'dayToNight', broadcastRoom);
}

function resolveNightStep(room: Room, nextStep: NightStep): NightStep {
  if (nextStep === 'seer') {
    const seerAlive = Object.values(room.players).some((p) => p.role === 'seer' && p.alive);
    if (!seerAlive) {
      return resolveNightStep(room, 'witch');
    }
  }
  if (nextStep === 'witch') {
    const witchAlive = Object.values(room.players).some((p) => p.role === 'witch' && p.alive);
    if (!witchAlive) {
      return 'resolve';
    }
  }
  return nextStep;
}

function advanceFromReveal(room: Room, broadcastRoom: (room: Room) => void) {
  const mayorEnabled = room.passiveRoleConfig?.mayor !== false;
  room.phaseStep = null;
  room.mayorId = null;
  room.voteState = createVoteState();
  if (mayorEnabled) {
    room.phase = 'mayor';
    addLog(room, 'Mayor election begins.');
    broadcastRoom(room);
    return;
  }
  addLog(room, 'Mayor role disabled. Skipping election.');
  if (room.roleConfig.armor > 0 && Object.values(room.players).some((p) => p.role === 'armor' && p.alive)) {
    room.phase = 'armor';
  } else {
    startNight(room);
  }
  broadcastRoom(room);
}

function advanceFromMayor(room: Room, broadcastRoom: (room: Room) => void) {
  if (room.roleConfig.armor > 0 && Object.values(room.players).some((p) => p.role === 'armor' && p.alive)) {
    room.phase = 'armor';
    room.phaseStep = null;
  } else {
    startNight(room);
  }
  broadcastRoom(room);
}

function notifyLovers(room: Room) {
  if (!room.lovers) return;
  const loverA = room.players[room.lovers.aId];
  const loverB = room.players[room.lovers.bId];
  if (loverA && loverB) {
    addLog(room, `${loverA.name} and ${loverB.name} are now Lovers.`, 'Two players are now Lovers.');
  }
}

export {
  startNight,
  scheduleNightStep,
  schedulePhaseTransition,
  holdDayToNightTransition,
  advanceFromReveal,
  advanceFromMayor,
  notifyLovers
};
