import type { Namespace } from 'socket.io';
import { addLog, clearRoomTimers, getPlayerRoleLabel, localizedMessage } from '../utils/helpers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../core/src/events';
import type { Room } from '../../../core/src/types';
import { queueDeath, resolveDeaths } from './deathManager';

function tryResolveDayVote(
  room: Room,
  broadcastRoom: (room: Room) => void,
  io: Namespace<ClientToServerEvents, ServerToClientEvents>,
  options: { allowEarly?: boolean } = {}
): boolean {
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
    if (!everyoneVoted) return false;
  } else {
    const everyoneVoted = alivePlayers.every((p) => room.voteState.votes[p.id] !== undefined);
    if (!everyoneVoted) {
      // A host may only force-resolve an incomplete vote when the missing
      // submissions themselves form a strict majority of the living players.
      // Otherwise a small lead (e.g. 2 of 3 votes) must wait for the remaining
      // player instead of silently becoming an elimination.
      const missingVotes = alivePlayers.filter(
        (p) => room.voteState.votes[p.id] === undefined
      ).length;
      if (missingVotes <= alivePlayers.length / 2) return false;
    }
  }

  const tallies: Record<string, number> = {};
  const votes = Object.values(room.voteState.votes);
  // Ending the vote early must not turn players who have not voted yet into
  // invisible voters. They count as abstentions for the majority-abstention
  // rule, so 3 abstentions and 2 actual votes cannot eliminate anyone.
  const effectiveVotes = allowEarly
    ? alivePlayers.map((player) => room.voteState.votes[player.id] ?? null)
    : votes;
  const abstainCount = effectiveVotes.filter((value) => value === null).length;
  const countedVotes = effectiveVotes.filter((value) => value !== null && value !== undefined);
  effectiveVotes.forEach((targetId) => {
    if (!targetId) return;
    tallies[targetId] = (tallies[targetId] || 0) + 1;
  });

  // If the day-vote tally is tied and the mayor voted for one of the
  // tied candidates, the mayor's vote counts DOUBLE — i.e. their chosen
  // candidate gets +1 extra vote — instead of acting as an outright
  // tiebreaker. This means the mayor can lift their candidate out of a
  // tie, but if even the doubled tally does not reach a simple majority
  // the day is still skipped.
  const mayorAlive = room.mayorId && room.players[room.mayorId]?.alive;
  const mayorVote = mayorAlive ? room.voteState.votes[room.mayorId!] : undefined;

  const entries = Object.entries(tallies);
  if (!effectiveVotes.length || !entries.length) {
    addLog(
      room,
      'Vote skipped. No one eliminated.',
      'Vote skipped. No one eliminated.',
      localizedMessage('server.logs.voteSkipped'),
      localizedMessage('server.logs.voteSkipped')
    );
    room.lastDayDeaths = [];
    room.lastDayMessage = 'No one was eliminated.';
    room.lastDayMessageI18n = localizedMessage('server.dayResults.noElimination');
    room.dayVoteResolved = true;
    broadcastRoom(room);
    return true;
  }
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  if (!top) return true;
  const participantCount = alivePlayers.length;
  // If a strict majority (> 50%) of alive players abstain (vote null),
  // the vote is considered skipped. The case where everyone abstains is
  // already handled above when entries.length === 0.
  if (abstainCount > participantCount / 2) {
    addLog(
      room,
      'Majority abstained. No one eliminated.',
      'Majority abstained. No one eliminated.',
      localizedMessage('server.logs.majorityAbstained'),
      localizedMessage('server.logs.majorityAbstained')
    );
    room.lastDayDeaths = [];
    room.lastDayMessage = 'No one was eliminated.';
    room.lastDayMessageI18n = localizedMessage('server.dayResults.noElimination');
    room.dayVoteResolved = true;
    broadcastRoom(room);
    return true;
  }
  // First tie check: do we have multiple candidates at the top?
  const initiallyTied = entries.filter(([, count]) => count === top[1]).map(([id]) => id);
  let mayorDoubled = false;
  let workingEntries: [string, number][] = entries;
  if (initiallyTied.length > 1 && mayorAlive && mayorVote && initiallyTied.includes(mayorVote)) {
    // The mayor's vote counts double: +1 to their candidate. Recompute
    // the tally and look for a clear winner.
    tallies[mayorVote] = tallies[mayorVote] + 1;
    mayorDoubled = true;
    workingEntries = Object.entries(tallies).sort((a, b) => b[1] - a[1]);
  }
  const newTop = workingEntries[0];
  if (!newTop) return true;
  const tied = workingEntries.filter(([, count]) => count === newTop[1]).map(([id]) => id);
  if (tied.length > 1) {
    // Tie persists (e.g. 3-way tie becomes 2-way tie, or 2-way tie stays
    // tied because the mayor did not vote for either tied candidate).
    if (mayorDoubled) {
      addLog(
        room,
        `Vote still tied after Mayor's doubled vote.`,
        `Vote still tied after Mayor's doubled vote.`,
        localizedMessage('server.logs.voteStillTiedAfterMayorDouble'),
        localizedMessage('server.logs.voteStillTiedAfterMayorDouble')
      );
    }
    if (!room.voteState.revoteFromTie) {
      room.voteState.revoteFromTie = tied;
      room.voteState.votes = {};
      addLog(
        room,
        'Vote tied. Revote among highlighted players.',
        null,
        localizedMessage('server.logs.voteTiedRevote')
      );
      broadcastRoom(room);
      return true;
    }
    // On revote tie, pick a random tied candidate.
    const randomPick = tied[Math.floor(Math.random() * tied.length)];
    if (!randomPick) return true;
    const randomPlayer = room.players[randomPick];
    const selectionMessage = randomPlayer
      ? `Vote tied again. Randomly selected ${randomPlayer.name}.`
      : 'Vote tied again. Randomly selected a player.';
    addLog(
      room,
      selectionMessage,
      selectionMessage,
      randomPlayer
        ? localizedMessage('server.logs.voteTiedRandom', { name: randomPlayer.name })
        : localizedMessage('server.logs.voteTiedRandomFallback'),
      randomPlayer
        ? localizedMessage('server.logs.voteTiedRandom', { name: randomPlayer.name })
        : localizedMessage('server.logs.voteTiedRandomFallback')
    );
    resolveDayKill(room, randomPick, broadcastRoom, io);
    return true;
  }
  // Single leader after the tie / mayor handling above (or never tied).
  // Require a simple majority of the non-abstaining votes; explicit
  // abstentions do not count toward either side of that majority. Early
  // resolution only permits a strict majority of missing votes to be treated
  // as abstentions; it never waives the majority requirement.
  // A 2-1-1 result therefore eliminates the 2-vote leader: two of the
  // three counted votes form a simple majority.
  const majorityThreshold = Math.floor(countedVotes.length / 2) + 1;
  if (newTop[1] < majorityThreshold) {
    addLog(
      room,
      'Vote skipped. No one eliminated.',
      'Vote skipped. No one eliminated.',
      localizedMessage('server.logs.voteSkipped'),
      localizedMessage('server.logs.voteSkipped')
    );
    room.lastDayDeaths = [];
    room.lastDayMessage = 'No one was eliminated.';
    room.lastDayMessageI18n = localizedMessage('server.dayResults.noElimination');
    room.dayVoteResolved = true;
    broadcastRoom(room);
    return true;
  }
  if (mayorDoubled) {
    addLog(
      room,
      `Vote tied. Mayor's vote counted double and decided the outcome.`,
      `Vote tied. Mayor's vote counted double and decided the outcome.`,
      localizedMessage('server.logs.voteTieMayorDouble'),
      localizedMessage('server.logs.voteTieMayorDouble')
    );
  }
  resolveDayKill(room, newTop[0], broadcastRoom, io);
  return true;
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
  room.lastDayMessageI18n = null;
  const roleLabel = getPlayerRoleLabel(target);
  addLog(
    room,
    `${target.name} was voted out. Role: ${roleLabel}.`,
    `${target.name} was voted out. Role: ${roleLabel}.`,
    localizedMessage('server.logs.votedOut', {
      name: target.name,
      role: target.role ?? 'villager',
    }),
    localizedMessage('server.logs.votedOut', { name: target.name, role: target.role ?? 'villager' })
  );
  if (target.role === 'joker') {
    // Process joker's death properly so lover heartbreak triggers
    queueDeath(room, targetId, 'executed by vote');
    resolveDeaths(room, 'day', broadcastRoom, io);
    // After resolving deaths (including potential lover heartbreak),
    // set joker as winner. The game ends regardless of other deaths.
    room.awaitingHunterShot = null;
    room.hunterShotQueue = [];
    room.awaitingMayorSelection = null;
    room.mayorSelectionQueue = [];
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
