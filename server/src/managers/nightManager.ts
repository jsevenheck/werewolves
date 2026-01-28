import type { Namespace } from 'socket.io';
import { NIGHT_RESOLVE_DELAY_MS } from '../config/constants';
import { scheduleNightStep, schedulePhaseTransition } from './phaseManager';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../core/src/events';
import type { Room } from '../../../core/src/types';

function tryFinalizeWolfVote(
  room: Room,
  broadcastRoom: (room: Room) => void,
  io: Namespace<ClientToServerEvents, ServerToClientEvents>
) {
  const wolves = Object.values(room.players).filter((p) => p.role === 'werewolf' && p.alive);
  if (!wolves.length) {
    scheduleNightStep(room, 'seer', broadcastRoom, io);
    return;
  }
  const pending = wolves.some(
    (wolf) => room.wolfVotes[wolf.id] === undefined
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

function advanceNightStep(room: Room, broadcastRoom: (room: Room) => void, io: Namespace<ClientToServerEvents, ServerToClientEvents>) {
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
      scheduleNightStep(room, 'guard', broadcastRoom, io);
      return;
    }
    broadcastRoom(room);
    return;
  }
  if (room.phaseStep === 'guard') {
    const guardAlive = Object.values(room.players).some((p) => p.role === 'guard' && p.alive);
    if (!guardAlive || room.guardActed) {
      room.guardActed = false;
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
  io: Namespace<ClientToServerEvents, ServerToClientEvents>
) {
  // Handle skip action - advance to guard step immediately
  if (action === 'skip') {
    scheduleNightStep(room, 'guard', broadcastRoom, io);
    return;
  }

  // Apply heal action if valid
  if (action === 'heal') {
    if (!room.witchState.healAvailable) return;
    if (!room.wolfTarget) return;
    const target = room.players[room.wolfTarget];
    if (!target || !target.alive) return;
    room.witchState.healAvailable = false;
    room.healedTarget = room.wolfTarget;
  }

  // Apply poison action if valid
  if (action === 'poison') {
    if (!room.witchState.poisonAvailable) return;
    const target = targetId ? room.players[targetId] : null;
    if (!target || !target.alive) return;
    room.witchState.poisonAvailable = false;
    room.poisonTarget = targetId;
  }

  // Check if witch can still perform actions after applying the current action
  const targetPlayer = room.wolfTarget ? room.players[room.wolfTarget] : null;
  const canHeal =
    room.witchState.healAvailable &&
    !!room.wolfTarget &&
    !!targetPlayer &&
    targetPlayer.alive;

  const alivePlayers = Object.values(room.players).filter((p) => p.alive);
  const actingWitch = playerId ? room.players[playerId] : null;
  const canPoison =
    room.witchState.poisonAvailable &&
    // Only allow poison when a real witch is acting; host skips pass null.
    !!actingWitch &&
    actingWitch.role === 'witch' &&
    actingWitch.alive &&
    alivePlayers.some((p) => p.id !== playerId);

  // If no more actions available, advance to guard step
  if (!canHeal && !canPoison) {
    scheduleNightStep(room, 'guard', broadcastRoom, io);
    return;
  }

  // Witch can still act, broadcast updated state
  broadcastRoom(room);
}

function resolveNight(room: Room, broadcastRoom: (room: Room) => void, io: Namespace<ClientToServerEvents, ServerToClientEvents>) {
  const { queueDeath, resolveDeaths } = require('./deathManager');
  // Wolf kill - blocked by heal OR guard protection
  if (room.wolfTarget && room.healedTarget !== room.wolfTarget && room.guardedTarget !== room.wolfTarget) {
    queueDeath(room, room.wolfTarget, 'eaten by Werewolves');
  }
  // Poison - blocked by guard protection
  if (room.poisonTarget && room.guardedTarget !== room.poisonTarget) {
    queueDeath(room, room.poisonTarget, 'poisoned by Witch');
  }
  // Save guard state for next night's restriction
  room.lastGuardedTarget = room.guardedTarget;
  room.guardedTarget = null;
  room.healedTarget = null;
  room.poisonTarget = null;
  resolveDeaths(room, 'night', broadcastRoom, io);
  if (!room.winner && !room.awaitingHunterShot && !room.awaitingMayorSelection) {
    if (NIGHT_RESOLVE_DELAY_MS <= 0) {
      schedulePhaseTransition(room, 'nightToDay', broadcastRoom);
      return;
    }
    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
      room.phaseTimer = null;
    }
    room.phaseTimer = setTimeout(() => {
      room.phaseTimer = null;
      if (room.winner || room.awaitingHunterShot) return;
      if (room.phase !== 'night' || room.phaseStep !== 'resolve') return;
      schedulePhaseTransition(room, 'nightToDay', broadcastRoom);
    }, NIGHT_RESOLVE_DELAY_MS);
  }
}

export {
  tryFinalizeWolfVote,
  advanceNightStep,
  handleWitchDecision,
  resolveNight
};
