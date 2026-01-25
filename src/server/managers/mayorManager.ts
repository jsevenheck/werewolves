import type { Server } from 'socket.io';
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

export {
  startMayorSelection,
  startNextMayorSelection
};
