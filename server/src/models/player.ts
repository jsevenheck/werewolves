import { PLAYER_ID, RESUME_TOKEN } from '../config/constants';
import type { Player } from '../../../core/src/types';

const socketIndex = new Map<string, { roomCode: string; playerId: string }>();

function createPlayer(name: string, socketId: string, isHost: boolean): Player {
  return {
    id: PLAYER_ID(),
    name,
    role: null,
    team: null,
    alive: true,
    connected: true,
    socketId,
    resumeToken: RESUME_TOKEN(),
    isHost: !!isHost,
    ready: false,
    seerResult: null,
  };
}

function setSocketIndex(socketId: string, roomCode: string, playerId: string): void {
  socketIndex.set(socketId, { roomCode, playerId });
}

function getSocketIndex(socketId: string) {
  return socketIndex.get(socketId);
}

function deleteSocketIndex(socketId: string): void {
  socketIndex.delete(socketId);
}

export { createPlayer, setSocketIndex, getSocketIndex, deleteSocketIndex };
