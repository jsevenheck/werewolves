import type { Server } from 'socket.io';
import { NIGHT_DELAY_MS, PHASE_DELAY_MS } from '../config/constants';
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
  room.wolfVotes = {};
  Object.values(room.players).forEach((player) => {
    if (player.role === 'werewolf' && player.alive) {
      room.wolfVotes[player.id] = '';
    }
  });
  room.wolfTarget = null;
  room.seerActed = false;
  room.pendingDeaths = [];
  room.lastNightDeaths = [];
  room.lastDayDeaths = [];
  room.lastDayMessage = null;
  room.voteState = createVoteState();
  room.awaitingHunterShot = null;
}

function scheduleNightStep(
  room: Room,
  nextStep: NightStep,
  broadcastRoom: (room: Room) => void,
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  clearRoomTimers(room);
  room.phaseStep = 'transition';
  room.nextNightStep = nextStep;
  room.phaseTransition = null;
  broadcastRoom(room);
  room.transitionTimer = setTimeout(() => {
    room.transitionTimer = null;
    if (room.phase !== 'night') return;
    room.phaseStep = nextStep;
    room.nextNightStep = null;
    if (nextStep === 'resolve') {
      const { resolveNight } = require('./nightManager');
      resolveNight(room, broadcastRoom, io);
    } else if (nextStep === 'seer' || nextStep === 'witch') {
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
  room.phaseTimer = setTimeout(() => {
    room.phaseTimer = null;
    if (room.winner) return;
    room.phaseTransition = null;
    if (kind === 'postReveal') {
      advanceFromReveal(room, broadcastRoom);
      return;
    }
    if (kind === 'postArmor') {
      startNight(room);
      broadcastRoom(room);
      return;
    }
    if (kind === 'nightToDay') {
      room.dayCount += 1;
      room.phase = 'day';
      room.phaseStep = null;
      room.nextNightStep = null;
      room.voteState = createVoteState();
      addLog(room, `Day ${room.dayCount} has begun.`);
      broadcastRoom(room);
      return;
    }
    if (kind === 'dayToNight') {
      startNight(room);
      broadcastRoom(room);
    }
  }, PHASE_DELAY_MS);
}

function advanceFromReveal(room: Room, broadcastRoom: (room: Room) => void) {
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
  advanceFromReveal,
  notifyLovers
};
