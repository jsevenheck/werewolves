function broadcastRoom(room, io) {
  Object.values(room.players).forEach((player) => sendStateToPlayer(room, player, io));
}

function sendStateToPlayer(room, player, io) {
  if (!player.socketId) return;
  const socket = io.sockets.sockets.get(player.socketId);
  if (!socket) return;
  socket.emit('roomUpdate', sanitizeRoom(room, player.id));
}

function sanitizeRoom(room, viewerId) {
  const viewer = room.players[viewerId];
  const players = Object.values(room.players).map((player) => ({
    id: player.id,
    name: player.name,
    alive: player.alive,
    connected: player.connected,
    isHost: player.isHost,
    role: player.id === viewerId || room.phase === 'ended' ? player.role : null,
    ...(room.phase === 'roleReveal' ? { ready: player.ready } : {})
  }));
  const viewerAlive = viewer ? viewer.alive : false;
  const logs = room.logs.slice(-8).map((log) => ({
    ts: log.ts,
    text: viewerAlive && log.publicText ? log.publicText : log.text
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
    loversKnown: room.lovers && (room.lovers.aId === viewerId || room.lovers.bId === viewerId),
    loversAssigned: !!room.lovers,
    loverName: room.lovers
      ? (room.lovers.aId === viewerId ? room.players[room.lovers.bId]?.name : room.lovers.bId === viewerId ? room.players[room.lovers.aId]?.name : null)
      : null,
    witchState: viewer?.role === 'witch' ? room.witchState : { healAvailable: null, poisonAvailable: null },
    wolfVotes: viewer?.role === 'werewolf' ? room.wolfVotes : null,
    wolfTarget: viewer?.role === 'witch' || viewer?.role === 'werewolf' ? room.wolfTarget : null,
    wolfPeers: viewer?.role === 'werewolf'
      ? Object.values(room.players)
          .filter((p) => p.role === 'werewolf' && p.id !== viewerId && p.alive)
          .map((p) => p.name)
      : null,
    nextNightStep: room.phaseStep === 'transition' ? room.nextNightStep : null,
    phaseTransition: room.phaseTransition,
    seerResult: viewer?.role === 'seer' ? viewer.seerResult : null,
    voteState: {
      revoteFromTie: room.voteState.revoteFromTie,
      submitted: Object.values(room.voteState.votes).filter((value) => value !== undefined).length,
      required: Object.values(room.players).filter((p) => p.alive).length,
      yourVote: room.voteState.votes[viewerId]
    },
    lastNightDeaths: room.lastNightDeaths,
    awaitingHunterShot: room.awaitingHunterShot === viewerId,
    winner: room.winner,
    logs,
    self: viewer ? {
      id: viewer.id,
      role: viewer.role,
      team: viewer.team,
      alive: viewer.alive,
      ready: room.phase === 'roleReveal' ? viewer.ready : undefined
    } : null
  };
}

module.exports = {
  broadcastRoom,
  sendStateToPlayer,
  sanitizeRoom
};
