import type { RoleConfig, RoomView, StoredSession } from './types';

export type ErrorResponse = { error: string };
export type OkResponse = { ok: true };

export interface ClientToServerEvents {
  createRoom: (payload: { name: string }, cb?: (response: { roomCode?: string; playerId?: string } | ErrorResponse) => void) => void;
  joinRoom: (payload: { name: string; code: string }, cb?: (response: { roomCode?: string; playerId?: string } | ErrorResponse) => void) => void;
  resumePlayer: (payload: StoredSession, cb?: (response: OkResponse | ErrorResponse) => void) => void;
  updateRoleConfig: (payload: { roomCode: string; playerId: string; config: Partial<RoleConfig> & { minPlayers?: number } }) => void;
  startGame: (payload: { roomCode: string; playerId: string }, cb?: (response: OkResponse | ErrorResponse) => void) => void;
  markReady: (payload: { roomCode: string; playerId: string }, cb?: (response: OkResponse | ErrorResponse) => void) => void;
  continueAfterReveal: (payload: { roomCode: string; playerId: string }) => void;
  submitArmor: (payload: { roomCode: string; playerId: string; targets: [string, string] }) => void;
  submitWolfVote: (payload: { roomCode: string; playerId: string; targetId?: string | null }) => void;
  submitSeerInspect: (
    payload: { roomCode: string; playerId: string; targetId: string },
    cb?: (response: { ok?: true; name?: string; result?: string } | ErrorResponse) => void
  ) => void;
  submitWitchDecision: (payload: { roomCode: string; playerId: string; action: 'heal' | 'poison' | 'skip'; targetId?: string | null }) => void;
  hostSkipStep: (payload: { roomCode: string; playerId: string }) => void;
  hostFinalizeDayVote: (payload: { roomCode: string; playerId: string }) => void;
  submitDayVote: (payload: { roomCode: string; playerId: string; targetId?: string | null }) => void;
  hunterShoot: (payload: { roomCode: string; playerId: string; targetId: string }) => void;
  restartGame: (payload: { roomCode: string; playerId: string }) => void;
  requestState: (payload: { roomCode: string; playerId: string }) => void;
}

export interface ServerToClientEvents {
  roomUpdate: (room: RoomView) => void;
  hunterPrompt: (payload: { roomCode: string }) => void;
  wolfVoteRejected: (payload: { reason: 'already_voted' }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
}
