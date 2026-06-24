import type {
  LocalizedMessage,
  RoleConfig,
  PassiveRoleConfig,
  RoomSummary,
  RoomView,
  StoredSession,
} from './types';

export type ErrorResponse = { error: string; message: LocalizedMessage };
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
  seerContinue: (payload: { roomCode: string; playerId: string }) => void;
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
  closeSession: (
    payload: { roomCode: string; playerId: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  requestState: (payload: { roomCode: string; playerId: string }) => void;

  /**
   * ADMIN-ONLY events. The server validates `auth.adminToken` on the socket
   * against `process.env.WEREWOLVES_ADMIN_TOKEN` for every action. Regular
   * clients (with no/invalid admin token) cannot use these events.
   *
   * The existing `kickPlayer` event is unchanged: it remains the host-only,
   * lobby-only in-game kick used by PlayersPanel.vue.
   */
  adminListRooms: (
    payload: Record<string, never>,
    cb?: (response: { rooms: RoomSummary[] } | ErrorResponse) => void
  ) => void;
  adminJoinRoom: (
    payload: { roomCode: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  adminLeaveRoom: (
    payload: { roomCode: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  /**
   * Global admin kick. Works in ANY phase. The target may be ANY player in
   * the room (not the admin socket itself, since admins are observers).
   */
  adminKickPlayer: (
    payload: { roomCode: string; targetId: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
  /**
   * Host mid-game kick. The acting socket MUST be the current host of the
   * lobby AND must have presented a valid admin token on connect (this lets
   * the host use the elevated mid-game kick that bypasses the lobby-only
   * restriction of `kickPlayer`).
   */
  hostMidGameKickPlayer: (
    payload: { roomCode: string; playerId: string; targetId: string },
    cb?: (response: OkResponse | ErrorResponse) => void
  ) => void;
}

export interface ServerToClientEvents {
  roomUpdate: (room: RoomView) => void;
  hunterPrompt: (payload: { roomCode: string }) => void;
  mayorPrompt: (payload: { roomCode: string }) => void;
  roomClosed: () => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
  /**
   * True when the socket presented a valid `WEREWOLVES_ADMIN_TOKEN` during the
   * Socket.IO handshake. The server's `io.use` middleware sets this once and
   * admin-only handlers check it before doing privileged work.
   *
   * Always false / undefined for regular player sockets.
   */
  adminToken?: boolean;
}
