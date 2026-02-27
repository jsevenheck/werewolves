import type { RoleConfig, PassiveRoleConfig, RoomView, StoredSession } from './types';

export type ErrorResponse = { error: string };
export type OkResponse = { ok: true };

export interface ClientToServerEvents {
  createRoom: (
    payload: { name: string },
    cb?: (
      response: { roomCode?: string; playerId?: string; resumeToken?: string } | ErrorResponse
    ) => void
  ) => void;
  joinRoom: (
    payload: { name: string; code: string },
    cb?: (
      response: { roomCode?: string; playerId?: string; resumeToken?: string } | ErrorResponse
    ) => void
  ) => void;
  autoJoinRoom: (
    payload: { sessionId: string; playerId: string; name: string },
    cb?: (
      response: { roomCode?: string; playerId?: string; resumeToken?: string } | ErrorResponse
    ) => void
  ) => void;
  resumePlayer: (
    payload: StoredSession,
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  updateRoleConfig: (payload: {
    roomCode: string;
    playerId: string;
    config: Partial<RoleConfig> & { passiveRoles?: Partial<PassiveRoleConfig> };
  }) => void;
  startGame: (
    payload: { roomCode: string; playerId: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  markReady: (
    payload: { roomCode: string; playerId: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  continueAfterReveal: (payload: { roomCode: string; playerId: string }) => void;
  submitMayorVote: (payload: { roomCode: string; playerId: string; targetId: string }) => void;
  hostFinalizeMayorVote: (payload: { roomCode: string; playerId: string }) => void;
  selectMayor: (payload: { roomCode: string; playerId: string; targetId: string }) => void;
  submitArmor: (payload: { roomCode: string; playerId: string; targets: [string, string] }) => void;
  submitWolfVote: (payload: {
    roomCode: string;
    playerId: string;
    targetId?: string | null;
  }) => void;
  submitSeerInspect: (
    payload: { roomCode: string; playerId: string; targetId: string },
    cb?: (response: { ok?: true; name?: string; result?: string } | ErrorResponse) => void
  ) => void;
  submitWitchDecision: (payload: {
    roomCode: string;
    playerId: string;
    action: 'heal' | 'poison' | 'skip';
    targetId?: string | null;
  }) => void;
  submitGuardProtection: (
    payload: { roomCode: string; playerId: string; targetId: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  submitHarlotVisit: (
    payload: { roomCode: string; playerId: string; targetId: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  hostSkipStep: (payload: { roomCode: string; playerId: string }) => void;
  hostFinalizeDayVote: (payload: { roomCode: string; playerId: string }) => void;
  hostProceedToNight: (payload: { roomCode: string; playerId: string }) => void;
  submitDayVote: (payload: {
    roomCode: string;
    playerId: string;
    targetId?: string | null;
  }) => void;
  hunterShoot: (payload: { roomCode: string; playerId: string; targetId: string }) => void;
  kickPlayer: (
    payload: { roomCode: string; playerId: string; targetId: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  leaveRoom: (
    payload: { roomCode: string; playerId: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  restartGame: (payload: { roomCode: string; playerId: string }) => void;
  requestState: (payload: { roomCode: string; playerId: string }) => void;
}

export interface ServerToClientEvents {
  roomUpdate: (room: RoomView) => void;
  hunterPrompt: (payload: { roomCode: string }) => void;
  mayorPrompt: (payload: { roomCode: string }) => void;
  wolfVoteRejected: (payload: { reason: 'already_voted' }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
}
