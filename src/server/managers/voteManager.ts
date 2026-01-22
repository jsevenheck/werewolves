import type { Server } from 'socket.io';
import { addLog, clearRoomTimers, getPlayerRoleLabel } from '../utils/helpers';
import { holdDayToNightTransition } from './phaseManager';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/events';
import type { Room } from '../../shared/types';

function tryResolveDayVote(
  room: Room,
  broadcastRoom: (room: Room) => void,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  options: { allowEarly?: boolean } = {}
) {
  const allowEarly = !!options.allowEarly;
  const alivePlayers = Object.values(room.players).filter((p) => p.alive);
  const connectedAlive = alivePlayers.filter((p) => p.connected);
  const disconnectedAlive = alivePlayers.filter((p) => !p.connected);
  if (!allowEarly) {
    const everyoneConnectedVoted = connectedAlive.every((p) => room.voteState.votes[p.id] !== undefined);
    if (connectedAlive.length > 0 && everyoneConnectedVoted && disconnectedAlive.length) {
      disconnectedAlive.forEach((player) => {
        if (room.voteState.votes[player.id] === undefined) {
          room.voteState.votes[player.id] = null;
        }
      });
    }
    const everyoneVoted = alivePlayers.every((p) => room.voteState.votes[p.id] !== undefined);
    if (!everyoneVoted) return;
  }

  const tallies: Record<string, number> = {};
  const votes = Object.values(room.voteState.votes);
  const effectiveVotes = allowEarly ? votes.filter((value) => value !== undefined) : votes;
  const abstainCount = effectiveVotes.filter((value) => value === null).length;
  effectiveVotes.forEach((targetId) => {
    if (!targetId) return;
    tallies[targetId] = (tallies[targetId] || 0) + 1;
  });
  const entries = Object.entries(tallies);
  if (!effectiveVotes.length || !entries.length) {
    addLog(room, 'Vote skipped. No one eliminated.', 'Vote skipped. No one eliminated.');
    room.lastDayDeaths = [];
    room.lastDayMessage = 'No one was eliminated.';
    holdDayToNightTransition(room, broadcastRoom);
    return;
  }
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const participantCount = allowEarly ? effectiveVotes.length : alivePlayers.length;
  // If a strict majority (> 50%) of alive players abstain (vote null),
  // the vote is considered skipped. The case where everyone abstains is
  // already handled above when entries.length === 0.
  if (abstainCount > participantCount / 2) {
    addLog(room, 'Majority abstained. No one eliminated.', 'Majority abstained. No one eliminated.');
    room.lastDayDeaths = [];
    room.lastDayMessage = 'No one was eliminated.';
    holdDayToNightTransition(room, broadcastRoom);
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
    resolveDayKill(room, randomPick, broadcastRoom, io);
  } else {
    resolveDayKill(room, top[0], broadcastRoom, io);
  }
}

function resolveDayKill(
  room: Room,
  targetId: string,
  broadcastRoom: (room: Room) => void,
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  const target = room.players[targetId];
  if (!target || !target.alive) return;
  room.lastDayMessage = null;
  const roleLabel = getPlayerRoleLabel(target);
  addLog(
    room,
    `${target.name} was voted out. Role: ${roleLabel}.`,
    `${target.name} was voted out. Role: ${roleLabel}.`
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
  resolveDeaths(room, 'day', broadcastRoom, io);
  if (!room.winner && !room.awaitingHunterShot) {
    holdDayToNightTransition(room, broadcastRoom);
  }
}

export {
  tryResolveDayVote,
  resolveDayKill
};
