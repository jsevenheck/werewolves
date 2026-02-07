import type { Namespace } from 'socket.io';
import { addLog, clearRoomTimers, getPlayerRoleLabel } from '../utils/helpers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../core/src/events';
import type { Room } from '../../../core/src/types';
import { queueDeath, resolveDeaths } from './deathManager';

function tryResolveDayVote(
  room: Room,
  broadcastRoom: (room: Room) => void,
  io: Namespace<ClientToServerEvents, ServerToClientEvents>,
  options: { allowEarly?: boolean } = {}
) {
  const allowEarly = !!options.allowEarly;
  const alivePlayers = Object.values(room.players).filter((p) => p.alive);
  const connectedAlive = alivePlayers.filter((p) => p.connected);
  const disconnectedAlive = alivePlayers.filter((p) => !p.connected);
  if (!allowEarly) {
    const everyoneConnectedVoted = connectedAlive.every(
      (p) => room.voteState.votes[p.id] !== undefined
    );
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

  // Mayor tie-breaking mechanics:
  // The mayor's vote is counted in the initial tally like everyone else.
  // If there's a tie, the mayor's vote ALSO acts as a tie-breaker IF the mayor
  // voted for one of the tied candidates. This means the mayor has additional
  // power: their vote both counts normally AND can break ties.
  // This is intentional game design to give the mayor meaningful authority.
  const mayorAlive = room.mayorId && room.players[room.mayorId]?.alive;
  const mayorVote = mayorAlive ? room.voteState.votes[room.mayorId!] : undefined;

  const entries = Object.entries(tallies);
  if (!effectiveVotes.length || !entries.length) {
    addLog(room, 'Vote skipped. No one eliminated.', 'Vote skipped. No one eliminated.');
    room.lastDayDeaths = [];
    room.lastDayMessage = 'No one was eliminated.';
    room.dayVoteResolved = true;
    broadcastRoom(room);
    return;
  }
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  if (!top) return;
  const participantCount = allowEarly ? effectiveVotes.length : alivePlayers.length;
  // If a strict majority (> 50%) of alive players abstain (vote null),
  // the vote is considered skipped. The case where everyone abstains is
  // already handled above when entries.length === 0.
  if (abstainCount > participantCount / 2) {
    addLog(
      room,
      'Majority abstained. No one eliminated.',
      'Majority abstained. No one eliminated.'
    );
    room.lastDayDeaths = [];
    room.lastDayMessage = 'No one was eliminated.';
    room.dayVoteResolved = true;
    broadcastRoom(room);
    return;
  }
  const tied = entries.filter(([, count]) => count === top[1]).map(([id]) => id);
  if (tied.length > 1) {
    // Check if mayor voted for one of the tied candidates
    if (mayorAlive && mayorVote && tied.includes(mayorVote)) {
      // Mayor's vote breaks the tie
      addLog(
        room,
        `Vote tied. Mayor's vote decided the outcome.`,
        `Vote tied. Mayor's vote decided the outcome.`
      );
      resolveDayKill(room, mayorVote, broadcastRoom, io);
      return;
    }

    if (!room.voteState.revoteFromTie) {
      room.voteState.revoteFromTie = tied;
      room.voteState.votes = {};
      addLog(room, 'Vote tied. Revote among highlighted players.');
      broadcastRoom(room);
      return;
    }
    // On revote, also check if mayor can break the tie
    if (mayorAlive && mayorVote && tied.includes(mayorVote)) {
      addLog(
        room,
        `Revote tied. Mayor's vote decided the outcome.`,
        `Revote tied. Mayor's vote decided the outcome.`
      );
      resolveDayKill(room, mayorVote, broadcastRoom, io);
      return;
    }
    const randomPick = tied[Math.floor(Math.random() * tied.length)];
    if (!randomPick) return;
    const randomPlayer = room.players[randomPick];
    const selectionMessage = randomPlayer
      ? `Vote tied again. Randomly selected ${randomPlayer.name}.`
      : 'Vote tied again. Randomly selected a player.';
    addLog(room, selectionMessage, selectionMessage);
    resolveDayKill(room, randomPick, broadcastRoom, io);
  } else {
    resolveDayKill(room, top[0], broadcastRoom, io);
  }
}

function resolveDayKill(
  room: Room,
  targetId: string,
  broadcastRoom: (room: Room) => void,
  io: Namespace<ClientToServerEvents, ServerToClientEvents>
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
  queueDeath(room, targetId, 'executed by vote');
  resolveDeaths(room, 'day', broadcastRoom, io);
}

export { tryResolveDayVote, resolveDayKill };
