import type { Server } from 'socket.io';
import { scheduleNightStep, schedulePhaseTransition } from './phaseManager';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/events';
import type { Room } from '../../shared/types';

function tryFinalizeWolfVote(
  room: Room,
  broadcastRoom: (room: Room) => void,
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  const wolves = Object.values(room.players).filter((p) => p.role === 'werewolf' && p.alive);
  if (!wolves.length) {
    scheduleNightStep(room, 'seer', broadcastRoom, io);
    return;
  }
  const pending = wolves.some(
    (wolf) => room.wolfVotes[wolf.id] == null || room.wolfVotes[wolf.id] === ''
  );
  if (pending) return;
  const tally: Record<string, number> = {};
  Object.values(room.wolfVotes).forEach((targetId) => {
    if (!targetId) return;
    tally[targetId] = (tally[targetId] || 0) + 1;
  });
  let chosen: string | null = null;
  let max = 0;
  let tied: string[] = [];
  Object.entries(tally).forEach(([targetId, count]) => {
    if (count > max) {
      max = count;
      chosen = targetId;
      tied = [targetId];
    } else if (count === max) {
      tied.push(targetId);
    }
  });
  if (tied.length > 1) {
    chosen = tied[Math.floor(Math.random() * tied.length)];
  }
  if (!chosen && wolves.length) {
    const aliveNonWolves = Object.values(room.players).filter((p) => p.alive && p.role !== 'werewolf');
    if (aliveNonWolves.length) {
      chosen = aliveNonWolves[Math.floor(Math.random() * aliveNonWolves.length)].id;
    }
  }
  room.wolfTarget = chosen;
  scheduleNightStep(room, 'seer', broadcastRoom, io);
}

function advanceNightStep(room: Room, broadcastRoom: (room: Room) => void, io: Server<ClientToServerEvents, ServerToClientEvents>) {
  if (room.phaseStep === 'seer') {
    const seerAlive = Object.values(room.players).some((p) => p.role === 'seer' && p.alive);
    if (!seerAlive || room.seerActed) {
      room.seerActed = false;
      scheduleNightStep(room, 'witch', broadcastRoom, io);
      return;
    }
    broadcastRoom(room);
    return;
  }
  if (room.phaseStep === 'witch') {
    const witchAlive = Object.values(room.players).some((p) => p.role === 'witch' && p.alive);
    if (!witchAlive) {
      scheduleNightStep(room, 'resolve', broadcastRoom, io);
      return;
    }
    broadcastRoom(room);
    return;
  }
}

function handleWitchDecision(
  room: Room,
  playerId: string | null,
  action: 'heal' | 'poison' | 'skip',
  targetId: string | null,
  broadcastRoom: (room: Room) => void,
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  if (action === 'heal') {
    if (!room.witchState.healAvailable) return;
    if (!room.wolfTarget) return;
    room.witchState.healAvailable = false;
    room.healedTarget = room.wolfTarget;
  } else if (action === 'poison') {
    if (!room.witchState.poisonAvailable) return;
    const target = targetId ? room.players[targetId] : null;
    if (!target || !target.alive) return;
    room.witchState.poisonAvailable = false;
    room.poisonTarget = targetId;
  }
  if (action === 'skip') {
    scheduleNightStep(room, 'resolve', broadcastRoom, io);
    return;
  }
  const canHeal = room.witchState.healAvailable && !!room.wolfTarget;
  const canPoison = room.witchState.poisonAvailable
    && Object.values(room.players).some((p) => p.alive && p.id !== playerId);
  if (!canHeal && !canPoison) {
    scheduleNightStep(room, 'resolve', broadcastRoom, io);
    return;
  }
  broadcastRoom(room);
}

function resolveNight(room: Room, broadcastRoom: (room: Room) => void, io: Server<ClientToServerEvents, ServerToClientEvents>) {
  const { queueDeath, resolveDeaths } = require('./deathManager');
  if (room.wolfTarget && room.healedTarget !== room.wolfTarget) {
    queueDeath(room, room.wolfTarget, 'eaten by Werewolves');
  }
  if (room.poisonTarget) {
    queueDeath(room, room.poisonTarget, 'poisoned by Witch');
  }
  room.healedTarget = null;
  room.poisonTarget = null;
  resolveDeaths(room, 'night', broadcastRoom, io);
  if (!room.winner && !room.awaitingHunterShot) {
    schedulePhaseTransition(room, 'nightToDay', broadcastRoom);
  }
}

export {
  tryFinalizeWolfVote,
  advanceNightStep,
  handleWitchDecision,
  resolveNight
};
