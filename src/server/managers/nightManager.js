const { scheduleNightStep, schedulePhaseTransition } = require('./phaseManager');

function tryFinalizeWolfVote(room, broadcastRoom, io) {
  const wolves = Object.values(room.players).filter((p) => p.role === 'werewolf' && p.alive);
  if (!wolves.length) {
    scheduleNightStep(room, 'seer', broadcastRoom, io);
    return;
  }
  const pending = wolves.some(
    (wolf) => room.wolfVotes[wolf.id] === undefined || room.wolfVotes[wolf.id] === ''
  );
  if (pending) return;
  const tally = {};
  Object.values(room.wolfVotes).forEach((targetId) => {
    if (!targetId) return;
    tally[targetId] = (tally[targetId] || 0) + 1;
  });
  let chosen = null;
  let max = 0;
  let tied = [];
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

function advanceNightStep(room, broadcastRoom, io) {
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

function handleWitchDecision(room, action, targetId, broadcastRoom, io) {
  if (action === 'heal') {
    if (!room.witchState.healAvailable) return;
    if (!room.wolfTarget) return;
    room.witchState.healAvailable = false;
    room.healedTarget = room.wolfTarget;
  } else if (action === 'poison') {
    if (!room.witchState.poisonAvailable) return;
    const target = room.players[targetId];
    if (!target || !target.alive) return;
    room.witchState.poisonAvailable = false;
    room.poisonTarget = targetId;
  }
  // skip action uses neither potion
  scheduleNightStep(room, 'resolve', broadcastRoom, io);
}

function resolveNight(room, broadcastRoom, io) {
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

module.exports = {
  tryFinalizeWolfVote,
  advanceNightStep,
  handleWitchDecision,
  resolveNight
};
