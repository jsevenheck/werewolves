const { ROLE_INFO } = require('../config/constants');
const { addLog, clearRoomTimers } = require('../utils/helpers');
const { schedulePhaseTransition } = require('./phaseManager');

function tryResolveDayVote(room, broadcastRoom) {
  const alivePlayers = Object.values(room.players).filter((p) => p.alive);
  const everyoneVoted = alivePlayers.every((p) => room.voteState.votes[p.id] !== undefined);
  if (!everyoneVoted) return;
  const tallies = {};
  const votes = Object.values(room.voteState.votes);
  const abstainCount = votes.filter((value) => value === null).length;
  votes.forEach((targetId) => {
    if (!targetId) return;
    tallies[targetId] = (tallies[targetId] || 0) + 1;
  });
  const entries = Object.entries(tallies);
  if (!entries.length) {
    addLog(room, 'Vote skipped. No one eliminated.', 'Vote skipped. No one eliminated.');
    schedulePhaseTransition(room, 'dayToNight', broadcastRoom);
    return;
  }
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  // If a strict majority (> 50%) of alive players abstain (vote null),
  // the vote is considered skipped. The case where everyone abstains is
  // already handled above when entries.length === 0.
  if (abstainCount > alivePlayers.length / 2) {
    addLog(room, 'Majority abstained. No one eliminated.', 'Majority abstained. No one eliminated.');
    schedulePhaseTransition(room, 'dayToNight', broadcastRoom);
    return;
  }
  const tied = entries.filter(([, count]) => count === top[1]).map(([id]) => id);
  if (tied.length > 1) {
    if (!room.voteState.revoteFromTie) {
      room.voteState.revoteFromTie = tied;
      room.voteState.votes = {};
      addLog(room, 'Vote tied. Revote among highlighted players.');
      broadcastRoom(room);
      return;
    }
    const randomPick = tied[Math.floor(Math.random() * tied.length)];
    resolveDayKill(room, randomPick, broadcastRoom);
  } else {
    resolveDayKill(room, top[0], broadcastRoom);
  }
}

function resolveDayKill(room, targetId, broadcastRoom) {
  const target = room.players[targetId];
  if (!target || !target.alive) return;
  addLog(
    room,
    `${target.name} was voted out. Role: ${ROLE_INFO[target.role]?.label || target.role}.`,
    `${target.name} was voted out. Role: ${ROLE_INFO[target.role]?.label || target.role}.`
  );
  if (target.role === 'joker') {
    room.winner = { team: 'joker', reason: 'Joker was voted out and laughs last!' };
    room.phase = 'ended';
    room.phaseStep = null;
    room.nextNightStep = null;
    room.phaseTransition = null;
    clearRoomTimers(room);
    broadcastRoom(room);
    return;
  }
  const { queueDeath, resolveDeaths } = require('./deathManager');
  queueDeath(room, targetId, 'executed by vote');
  resolveDeaths(room, 'day', broadcastRoom);
  if (!room.winner && !room.awaitingHunterShot) {
    schedulePhaseTransition(room, 'dayToNight', broadcastRoom);
  }
}

module.exports = {
  tryResolveDayVote,
  resolveDayKill
};
