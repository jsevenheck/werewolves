import type { Namespace } from 'socket.io';
import { updateRoomActivity } from '../models/room';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../core/src/events';
import type { Room, RoomView, Player } from '../../../core/src/types';

function broadcastRoom(room: Room, io: Namespace<ClientToServerEvents, ServerToClientEvents>) {
  updateRoomActivity(room);
  Object.values(room.players).forEach((player) => sendStateToPlayer(room, player, io));
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

function sanitizeRoom(room: Room, viewerId: string): RoomView {
  const viewer = room.players[viewerId];
  const players = Object.values(room.players).map((player) => ({
    id: player.id,
    name: player.name,
    alive: player.alive,
    connected: player.connected,
    isHost: player.id === room.hostId,
    role: player.id === viewerId || room.phase === 'ended' || !player.alive ? player.role : null,
    ...(room.phase === 'roleReveal' ? { ready: player.ready } : {}),
  }));
  const viewerAlive = viewer ? viewer.alive : false;
  const logs = room.logs.slice(-8).map((log) => ({
    ts: log.ts,
    text: viewerAlive && log.publicText ? log.publicText : log.text,
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
    lastDayMessage: room.lastDayMessage,
    awaitingHunterShot: room.awaitingHunterShot === viewerId,
    hunterShotPending: !!room.awaitingHunterShot,
    hunterShotEndsAt: room.awaitingHunterShot === viewerId ? room.hunterShotEndsAt : null,
    dayVoteResolved: room.dayVoteResolved,
    winner: room.winner,
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

export { broadcastRoom, sendStateToPlayer, sanitizeRoom };
