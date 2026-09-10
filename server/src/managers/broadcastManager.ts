import type { Namespace } from 'socket.io';
import { localizedMessage } from '../utils/helpers';
import { updateRoomActivity } from '../models/room';
import { MAX_VISIBLE_LOGS } from '../config/constants';
import { getAdminObserversForRoom, removeAdminObserver } from '../managers/adminManager';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../core/src/events';
import type { LocalizedMessage, Room, RoomView, Player, Winner } from '../../../core/src/types';

function broadcastRoom(room: Room, io: Namespace<ClientToServerEvents, ServerToClientEvents>) {
  updateRoomActivity(room);
  Object.values(room.players).forEach((player) => sendStateToPlayer(room, player, io));
}

/**
 * Notify every admin observer of a room that the room is being closed, then
 * drop them from the observer registry. Called when a room is deleted
 * (host closeSession, admin closeRoom, or the last player leaving/kicked).
 * Emits `roomClosed` so the AdminPage can return to the room list.
 */
function notifyAdminObserversRoomClosed(
  roomCode: string,
  io: Namespace<ClientToServerEvents, ServerToClientEvents>
) {
  for (const socketId of getAdminObserversForRoom(roomCode)) {
    const socket = io.sockets.get(socketId);
    if (socket) {
      socket.emit('roomClosed');
    }
    removeAdminObserver(socketId);
  }
}

/**
 * Build a sanitized room view for an admin observer.
 *
 * Differences from `sanitizeRoom(viewerId)`:
 *   - `self` is `null` (the admin is not a player).
 *   - Every player's `role` is `null` so admins never see secret roles.
 *   - `awaitingMayorSelection`, `awaitingHunterShot` and `hunterShotEndsAt`
 *     are scrubbed of identity (kept as the boolean `*Pending` flags only).
 *   - All role-specific fields (seerResult, witchState, wolfVotes, etc.) are
 *     zeroed so admins see game state but no role secrets.
 *   - `loversKnown` is always false (admins don't learn who the lovers are).
 */
function buildAdminRoomView(room: Room): RoomView {
  const players = Object.values(room.players).map((player) => ({
    id: player.id,
    name: player.name,
    alive: player.alive,
    connected: player.connected,
    isHost: player.id === room.hostId,
    role: null,
    ...(room.phase === 'roleReveal' ? { ready: player.ready } : {}),
  }));
  return {
    code: room.code,
    phase: room.phase,
    phaseStep: room.phaseStep,
    dayCount: room.dayCount,
    players,
    hostId: room.hostId,
    minPlayers: room.minPlayers,
    roleConfig: room.roleConfig,
    passiveRoleConfig: room.passiveRoleConfig,
    discussionTimerSeconds: room.discussionTimerSeconds,
    discussionEndsAt: room.discussionEndsAt,
    mayorId: null,
    awaitingMayorSelection: false,
    mayorSelectionPending: !!room.awaitingMayorSelection,
    loversKnown: false,
    loversAssigned: !!room.lovers,
    loverName: null,
    witchState: { healAvailable: null, poisonAvailable: null },
    wolfVotes: null,
    wolfVoteState: null,
    wolfTarget: null,
    wolfPeers: [],
    wolfIds: [],
    guardedTarget: null,
    lastGuardedTarget: null,
    harlotVisitedTarget: null,
    nextNightStep: room.phaseStep === 'transition' ? room.nextNightStep : null,
    phaseTransition: room.phaseTransition,
    seerResult: null,
    voteState: {
      revoteFromTie: null,
      submitted: Object.values(room.voteState.votes).filter((v) => v !== undefined).length,
      required: Object.values(room.players).filter((p) => p.alive).length,
      yourVote: undefined,
    },
    lastNightDeaths: room.lastNightDeaths,
    lastDayDeaths: room.lastDayDeaths,
    lastDayMessage: room.lastDayMessageI18n?.key ?? room.lastDayMessage,
    lastDayMessageI18n: room.lastDayMessageI18n ?? null,
    awaitingHunterShot: false,
    hunterShotPending: !!room.awaitingHunterShot,
    hunterShotEndsAt: null,
    dayVoteResolved: room.dayVoteResolved,
    winner: localizeWinner(room.winner),
    logs: room.logs.slice(-MAX_VISIBLE_LOGS).map((log) => ({
      ts: log.ts,
      text: log.text,
      message: log.message ?? null,
    })),
    self: null,
  };
}

/**
 * Push the latest room view to all admin observers of `room`.
 *
 * Callers MUST already have mutated `room` to a coherent state. We do not
 * update `lastActivityAt` here — that is only bumped when a regular player
 * does something (`broadcastRoom` does it).
 */
function broadcastRoomToAdmins(
  room: Room,
  io: Namespace<ClientToServerEvents, ServerToClientEvents>,
  observerSocketIds: string[]
) {
  if (observerSocketIds.length === 0) return;
  const view = buildAdminRoomView(room);
  for (const socketId of observerSocketIds) {
    const socket = io.sockets.get(socketId);
    if (socket) {
      socket.emit('roomUpdate', view);
    }
  }
}

function sendStateToPlayer(
  room: Room,
  player: Player,
  io: Namespace<ClientToServerEvents, ServerToClientEvents>
) {
  if (!player.socketId) return;
  const socket = io.sockets.get(player.socketId);
  if (!socket) return;
  socket.emit('roomUpdate', sanitizeRoom(room, player.id));
}

function getWinnerReasonMessage(winner: Winner | null): LocalizedMessage | null {
  switch (winner?.reason) {
    case 'All Werewolves are dead.':
      return localizedMessage('server.winnerReasons.allWerewolvesDead');
    case 'Werewolves have the majority.':
      return localizedMessage('server.winnerReasons.wolvesMajority');
    case 'Witch can heal and poison to break parity.':
      return localizedMessage('server.winnerReasons.witchBreakParity');
    case 'Werewolves reached parity.':
      return localizedMessage('server.winnerReasons.wolvesParity');
    case 'No players remain; Werewolves win.':
      return localizedMessage('server.winnerReasons.noPlayersRemainWolvesWin');
    case 'Joker was voted out and laughs last!':
      return localizedMessage('server.winnerReasons.jokerVotedOut');
    default:
      return null;
  }
}

function localizeWinner(winner: Winner | null): Winner | null {
  if (!winner) return null;
  const reasonMessage = winner.reasonMessage ?? getWinnerReasonMessage(winner);
  return {
    ...winner,
    reason: reasonMessage?.key ?? winner.reason,
    reasonMessage,
  };
}

function sanitizeRoom(room: Room, viewerId: string): RoomView {
  const viewer = room.players[viewerId];
  const gameEnded = room.phase === 'ended';
  const players = Object.values(room.players).map((player) => ({
    id: player.id,
    name: player.name,
    alive: player.alive,
    connected: player.connected,
    isHost: player.id === room.hostId,
    role: player.id === viewerId || !player.alive || gameEnded ? player.role : null,
    ...(room.phase === 'roleReveal' ? { ready: player.ready } : {}),
  }));
  const viewerAlive = viewer ? viewer.alive : false;
  const logs = room.logs
    .slice(-MAX_VISIBLE_LOGS)
    .filter((log) => {
      // deadOnly logs are hidden from alive viewers until the game ends.
      if (log.deadOnly && viewerAlive && !gameEnded) return false;
      return true;
    })
    .map((log) => {
      const usePublic = viewerAlive && !gameEnded && !!log.publicText;
      const message = usePublic ? (log.publicMessage ?? null) : (log.message ?? null);
      return {
        ts: log.ts,
        text: message?.key ?? (usePublic ? log.publicText! : log.text),
        message,
      };
    });
  return {
    code: room.code,
    phase: room.phase,
    phaseStep: room.phaseStep,
    dayCount: room.dayCount,
    players,
    hostId: room.hostId,
    minPlayers: room.minPlayers,
    roleConfig: room.roleConfig,
    passiveRoleConfig: room.passiveRoleConfig,
    discussionTimerSeconds: room.discussionTimerSeconds,
    discussionEndsAt: room.discussionEndsAt,
    mayorId: room.mayorId,
    awaitingMayorSelection: room.awaitingMayorSelection === viewerId,
    mayorSelectionPending: !!room.awaitingMayorSelection,
    loversKnown: !!room.lovers && (room.lovers.aId === viewerId || room.lovers.bId === viewerId),
    loversAssigned: !!room.lovers,
    loverName: room.lovers
      ? room.lovers.aId === viewerId
        ? (room.players[room.lovers.bId]?.name ?? null)
        : room.lovers.bId === viewerId
          ? (room.players[room.lovers.aId]?.name ?? null)
          : null
      : null,
    witchState:
      viewer?.role === 'witch' ? room.witchState : { healAvailable: null, poisonAvailable: null },
    wolfVotes: viewer?.role === 'werewolf' ? room.wolfVotes : null,
    wolfVoteState:
      viewer?.role === 'werewolf'
        ? {
            submitted: Object.values(room.wolfVotes).filter((value) => value !== undefined).length,
            required: Object.values(room.players).filter((p) => p.role === 'werewolf' && p.alive)
              .length,
            yourVote: room.wolfVotes[viewerId],
          }
        : null,
    wolfTarget: viewer?.role === 'witch' || viewer?.role === 'werewolf' ? room.wolfTarget : null,
    wolfPeers:
      viewer?.role === 'werewolf'
        ? Object.values(room.players)
            .filter((p) => p.role === 'werewolf' && p.id !== viewerId && p.alive)
            .map((p) => p.name)
        : [],
    wolfIds:
      viewer?.role === 'werewolf'
        ? Object.values(room.players)
            .filter((p) => p.role === 'werewolf' && p.alive)
            .map((p) => p.id)
        : [],
    guardedTarget: viewer?.role === 'guard' ? room.guardedTarget : null,
    lastGuardedTarget: viewer?.role === 'guard' ? room.lastGuardedTarget : null,
    harlotVisitedTarget: viewer?.role === 'harlot' ? room.harlotVisitedTarget : null,
    nextNightStep: room.phaseStep === 'transition' ? room.nextNightStep : null,
    phaseTransition: room.phaseTransition,
    seerResult: viewer?.role === 'seer' ? viewer.seerResult : null,
    voteState: {
      revoteFromTie: room.voteState.revoteFromTie,
      submitted: Object.values(room.voteState.votes).filter((value) => value !== undefined).length,
      required: Object.values(room.players).filter((p) => p.alive).length,
      yourVote: room.voteState.votes[viewerId],
    },
    lastNightDeaths: room.lastNightDeaths,
    lastDayDeaths: room.lastDayDeaths,
    lastDayMessage: room.lastDayMessageI18n?.key ?? room.lastDayMessage,
    lastDayMessageI18n: room.lastDayMessageI18n ?? null,
    awaitingHunterShot: room.awaitingHunterShot === viewerId,
    hunterShotPending: !!room.awaitingHunterShot,
    hunterShotEndsAt: room.awaitingHunterShot === viewerId ? room.hunterShotEndsAt : null,
    dayVoteResolved: room.dayVoteResolved,
    winner: localizeWinner(room.winner),
    logs,
    self: viewer
      ? {
          id: viewer.id,
          role: viewer.role,
          team: viewer.team,
          alive: viewer.alive,
          ready: room.phase === 'roleReveal' ? viewer.ready : undefined,
        }
      : null,
  };
}

export {
  broadcastRoom,
  sendStateToPlayer,
  sanitizeRoom,
  buildAdminRoomView,
  broadcastRoomToAdmins,
  notifyAdminObserversRoomClosed,
};
