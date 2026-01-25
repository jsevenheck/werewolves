import type { Server } from 'socket.io';
import { addLog, createVoteState } from '../utils/helpers';
import { schedulePhaseTransition } from './phaseManager';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/events';
import type { Room } from '../../shared/types';

function shiftNextValidMayorSelector(room: Room) {
  while (room.mayorSelectionQueue.length) {
    const nextId = room.mayorSelectionQueue.shift();
    if (!nextId) continue;
    const dyingMayor = room.players[nextId];
    if (dyingMayor && !dyingMayor.alive) {
      return nextId;
    }
  }
  return null;
}

function startMayorSelection(
  room: Room,
  dyingMayorId: string,
  broadcastRoom: (room: Room) => void,
  io?: Server<ClientToServerEvents, ServerToClientEvents>,
  shouldBroadcast = true
) {
  room.awaitingMayorSelection = dyingMayorId;
  if (room.mayorSelectionTimer) {
    clearTimeout(room.mayorSelectionTimer);
    room.mayorSelectionTimer = null;
  }
  const dyingMayor = room.players[dyingMayorId];
  const socket = io && dyingMayor?.socketId && io.sockets?.sockets?.get(dyingMayor.socketId);
  if (socket && dyingMayor?.connected) {
    socket.emit('mayorPrompt', { roomCode: room.code });
  }
  if (shouldBroadcast) {
    broadcastRoom(room);
  }
}

function startNextMayorSelection(
  room: Room,
  broadcastRoom: (room: Room) => void,
  io?: Server<ClientToServerEvents, ServerToClientEvents>
) {
  if (room.awaitingMayorSelection || !room.mayorSelectionQueue || !room.mayorSelectionQueue.length) {
    return false;
  }
  const nextId = shiftNextValidMayorSelector(room);
  if (!nextId) {
    return false;
  }
  startMayorSelection(room, nextId, broadcastRoom, io, true);
  return true;
}

function finalizeMayorVote(
  room: Room,
  mayorId: string,
  broadcastRoom: (room: Room) => void
) {
  const mayor = room.players[mayorId];
  if (!mayor || !mayor.alive) {
    return false;
  }
  room.mayorId = mayorId;
  room.voteState = createVoteState();
  addLog(
    room,
    `${mayor.name} has been elected as the Mayor.`,
    `${mayor.name} has been elected as the Mayor.`
  );
  schedulePhaseTransition(room, 'postMayor', broadcastRoom);
  return true;
}

function tryResolveMayorVote(
  room: Room,
  broadcastRoom: (room: Room) => void,
  options: { allowEarly?: boolean } = {}
) {
  if (room.phase !== 'mayor') return false;
  if (room.mayorId) return false;
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
    const everyoneVoted = alivePlayers.every(
      (p) => room.voteState.votes[p.id] !== undefined
    );
    if (!everyoneVoted) return false;
  }

  const votes = Object.values(room.voteState.votes);
  const effectiveVotes = allowEarly ? votes.filter((value) => value !== undefined) : votes;
  const tallies: Record<string, number> = {};
  effectiveVotes.forEach((targetId) => {
    if (!targetId) return;
    tallies[targetId] = (tallies[targetId] || 0) + 1;
  });

  const entries = Object.entries(tallies);
  if (!effectiveVotes.length || !entries.length) {
    return false;
  }

  entries.sort((a, b) => b[1] - a[1]);
  const topCount = entries[0][1];
  const tied = entries.filter(([, count]) => count === topCount).map(([id]) => id);
  if (tied.length > 1) {
    if (!room.voteState.revoteFromTie) {
      room.voteState.revoteFromTie = tied;
      room.voteState.votes = {};
      addLog(room, 'Mayor vote tied. Revote among highlighted players.');
      broadcastRoom(room);
      return false;
    }
    // Second tie after a revote resolves by random pick among tied candidates.
    const randomPick = tied[Math.floor(Math.random() * tied.length)];
    return finalizeMayorVote(room, randomPick, broadcastRoom);
  }

  return finalizeMayorVote(room, entries[0][0], broadcastRoom);
}

export {
  startMayorSelection,
  startNextMayorSelection,
  tryResolveMayorVote
};
