const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { customAlphabet } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const PORT = process.env.PORT || 3001;
const NIGHT_DELAY_MS = 3000;
const PHASE_DELAY_MS = 3000;
const ROOM_CODE = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);
const PLAYER_ID = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

const ROLE_INFO = {
  werewolf: {
    label: 'Werewolf',
    team: 'wolves',
    description: 'Work with other wolves to eliminate the village. At night vote on a target to devour.'
  },
  seer: {
    label: 'Seer',
    team: 'village',
    description: 'Each night inspect one player to learn if they are a Werewolf.'
  },
  hunter: {
    label: 'Hunter',
    team: 'village',
    description: 'If you die, instantly shoot one player to take down with you.'
  },
  witch: {
    label: 'Witch',
    team: 'village',
    description: 'You have one heal potion and one poison potion for the whole game. You may use at most one per night.'
  },
  armor: {
    label: 'Armor',
    team: 'village',
    description: 'On the first night choose two players to be Lovers. If one Lover dies, the other dies too.'
  },
  joker: {
    label: 'Joker',
    team: 'neutral',
    description: 'If you are voted out during the day, you instantly win.'
  },
  villager: {
    label: 'Villager',
    team: 'village',
    description: 'No special powers. Find and eliminate the Werewolves.'
  }
};

const DEFAULT_ROLE_CONFIG = {
  werewolf: 2,
  seer: 1,
  hunter: 1,
  witch: 1,
  armor: 1,
  joker: 0
};

const rooms = new Map();
const socketIndex = new Map(); // socketId -> {roomCode, playerId}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.json({ ok: true }));

server.listen(PORT, () => {
  console.log(`Werewolves server running on http://localhost:${PORT}`);
});

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on('createRoom', ({ name }, cb) => {
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.({ error: 'Name required' });
    const { room, player } = createRoom(cleanName, socket.id);
    cb?.({ roomCode: room.code, playerId: player.id });
    broadcastRoom(room);
  });

  socket.on('joinRoom', ({ name, code }, cb) => {
    const cleanName = sanitizeName(name);
    if (!cleanName) return cb?.({ error: 'Name required' });
    const room = rooms.get(code?.toUpperCase());
    if (!room) return cb?.({ error: 'Room not found' });
    if (room.phase !== 'lobby') return cb?.({ error: 'Game already started' });
    const player = createPlayer(cleanName, socket.id, false);
    room.players[player.id] = player;
    socketIndex.set(socket.id, { roomCode: room.code, playerId: player.id });
    cb?.({ roomCode: room.code, playerId: player.id });
    broadcastRoom(room);
  });

  socket.on('resumePlayer', ({ roomCode, playerId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ error: 'Room not found' });
    const player = room.players[playerId];
    if (!player) return cb?.({ error: 'Player not in room' });
    player.socketId = socket.id;
    player.connected = true;
    socketIndex.set(socket.id, { roomCode, playerId });
    cb?.({ ok: true });
    sendStateToPlayer(room, player);
  });

  socket.on('updateRoleConfig', ({ roomCode, playerId, config }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.hostId !== playerId) return;
    if (room.phase !== 'lobby') return;
    room.roleConfig = normalizeRoleConfig(config);
    if (config?.minPlayers !== undefined) {
      const rawMin = Number(config.minPlayers);
      if (Number.isFinite(rawMin) && rawMin >= 3) {
        room.minPlayers = Math.floor(rawMin);
      }
    }
    broadcastRoom(room);
  });

  socket.on('startGame', ({ roomCode, playerId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ error: 'Room missing' });
    if (room.hostId !== playerId) return cb?.({ error: 'Only host can start' });
    if (room.phase !== 'lobby') return cb?.({ error: 'Already started' });
    const validation = validateCounts(room);
    if (validation.error) return cb?.(validation);
    assignRoles(room);
    room.phase = 'roleReveal';
    room.phaseStep = null;
    room.dayCount = 0;
    room.lastNightDeaths = [];
    room.voteState = createVoteState();
    cb?.({ ok: true });
    addLog(room, 'Roles assigned. Secret information has been delivered.');
    broadcastRoom(room);
  });

  socket.on('markReady', ({ roomCode, playerId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ error: 'Room missing' });
    if (room.phase !== 'roleReveal') return cb?.({ error: 'Not in roleReveal phase' });
    const player = room.players[playerId];
    if (!player) return cb?.({ error: 'Player missing' });
    if (player.socketId !== socket.id) return cb?.({ error: 'Socket mismatch' });
    player.ready = true;
    broadcastRoom(room);
    cb?.({ ok: true });
  });

  socket.on('continueAfterReveal', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return;
    if (room.phase !== 'roleReveal') return;
    // Note: Disconnected players are treated as "ready" here via `!p.connected || p.ready`.
    // If a player marked ready, disconnected during roleReveal, and then reconnects,
    // their previous `ready` status may persist until explicitly changed elsewhere.
    const allReady = Object.values(room.players).every((p) => !p.connected || p.ready);
    if (!allReady) return;
    schedulePhaseTransition(room, 'postReveal');
  });

  socket.on('submitArmor', ({ roomCode, playerId, targets }) => {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== 'armor') return;
    const player = room.players[playerId];
    if (!player || player.role !== 'armor' || !player.alive) return;
    if (!Array.isArray(targets) || targets.length !== 2) return;
    const [a, b] = targets;
    if (a === b) return;
    const targetA = room.players[a];
    const targetB = room.players[b];
    if (!targetA || !targetB || !targetA.alive || !targetB.alive) return;
    room.lovers = { aId: a, bId: b };
    notifyLovers(room);
    addLog(room, `${player.name} linked two souls together as Lovers.`, 'The Lovers have been chosen.');
    schedulePhaseTransition(room, 'postArmor');
  });

  socket.on('submitWolfVote', ({ roomCode, playerId, targetId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'wolves') return;
    const player = room.players[playerId];
    if (!player || player.role !== 'werewolf' || !player.alive) return;
    if (targetId && !room.players[targetId]?.alive) return;
    room.wolfVotes[playerId] = targetId || null;
    tryFinalizeWolfVote(room);
    broadcastRoom(room);
  });

  socket.on('submitSeerInspect', ({ roomCode, playerId, targetId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'seer') return;
    const player = room.players[playerId];
    if (!player || player.role !== 'seer' || !player.alive) return;
    const target = room.players[targetId];
    if (!target) return;
    const result = target.role === 'werewolf' ? 'Werewolf' : 'Not Werewolf';
    player.seerResult = { name: target.name, result };
    cb?.({ ok: true, name: target.name, result });
    room.seerActed = true;
    advanceNightStep(room);
  });

  socket.on('submitWitchDecision', ({ roomCode, playerId, action, targetId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== 'night' || room.phaseStep !== 'witch') return;
    const player = room.players[playerId];
    if (!player || player.role !== 'witch' || !player.alive) return;
    handleWitchDecision(room, action, targetId);
  });

  socket.on('hostSkipStep', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return;
    if (room.phase !== 'night' && !room.phaseTransition) return;
    if (room.phaseStep === 'transition' && room.nextNightStep) {
      if (room.transitionTimer) {
        clearTimeout(room.transitionTimer);
        room.transitionTimer = null;
      }
      const step = room.nextNightStep;
      room.phaseStep = step;
      room.nextNightStep = null;
      if (step === 'resolve') {
        resolveNight(room);
      } else {
        broadcastRoom(room);
      }
      return;
    }
    if (room.phaseTransition) {
      if (room.phaseTimer) {
        clearTimeout(room.phaseTimer);
        room.phaseTimer = null;
      }
      const kind = room.phaseTransition;
      room.phaseTransition = null;
      if (kind === 'nightToDay') {
        room.dayCount += 1;
        room.phase = 'day';
        room.phaseStep = null;
        room.nextNightStep = null;
        room.voteState = createVoteState();
        addLog(room, `Day ${room.dayCount} has begun.`);
        broadcastRoom(room);
        return;
      }
      if (kind === 'dayToNight') {
        startNight(room);
        return;
      }
      if (kind === 'postReveal') {
        advanceFromReveal(room);
        return;
      }
      if (kind === 'postArmor') {
        startNight(room);
        return;
      }
      return;
    }
    if (room.phaseStep === 'wolves') {
      // Only allow skip if no living werewolves are present
      const livingWolves = Object.values(room.players).filter((p) => p.role === 'werewolf' && p.alive);
      if (livingWolves.length === 0) {
        room.wolfTarget = null;
        scheduleNightStep(room, 'seer');
      }
      return;
    }
    if (room.phaseStep === 'seer') {
      // Only allow skip if no living seer is present
      const livingSeer = Object.values(room.players).find((p) => p.role === 'seer' && p.alive);
      if (!livingSeer) {
        room.seerActed = true;
        scheduleNightStep(room, 'witch');
      }
      return;
    }
    if (room.phaseStep === 'witch') {
      // Only allow skip if no living witch is present
      const livingWitch = Object.values(room.players).find((p) => p.role === 'witch' && p.alive);
      if (!livingWitch) {
        handleWitchDecision(room, 'skip');
      }
    }
  });

  socket.on('submitDayVote', ({ roomCode, playerId, targetId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== 'day') return;
    const player = room.players[playerId];
    if (!player || !player.alive) return;
    if (room.voteState.revoteFromTie && targetId && !room.voteState.revoteFromTie.includes(targetId)) {
      return;
    }
    if (targetId && !room.players[targetId]?.alive) return;
    room.voteState.votes[playerId] = targetId || null;
    tryResolveDayVote(room);
    broadcastRoom(room);
  });

  socket.on('hunterShoot', ({ roomCode, playerId, targetId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.awaitingHunterShot !== playerId) return;
    const target = room.players[targetId];
    if (!target || !target.alive) return;
    queueDeath(room, targetId, 'shot by Hunter');
    room.awaitingHunterShot = null;
    resolveDeaths(room);
  });

  socket.on('requestState', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players[playerId];
    if (!player) return;
    sendStateToPlayer(room, player);
  });

  socket.on('disconnect', () => {
    const ref = socketIndex.get(socket.id);
    if (!ref) return;
    socketIndex.delete(socket.id);
    const room = rooms.get(ref.roomCode);
    if (!room) return;
    const player = room.players[ref.playerId];
    if (!player) return;
    player.connected = false;
    addLog(room, `${player.name} disconnected.`);
    broadcastRoom(room);
  });
});

function sanitizeName(name) {
  return (name || '').trim().slice(0, 20);
}

function createRoom(hostName, socketId) {
  let code;
  do {
    code = ROOM_CODE();
  } while (rooms.has(code));
  const room = {
    code,
    hostId: null,
    phase: 'lobby',
    phaseStep: null,
    dayCount: 0,
    players: {},
    minPlayers: 5,
    roleConfig: { ...DEFAULT_ROLE_CONFIG },
    lovers: null,
    witchState: { healAvailable: true, poisonAvailable: true },
    wolfVotes: {},
    voteState: createVoteState(),
    pendingDeaths: [],
    winner: null,
    lastNightDeaths: [],
    awaitingHunterShot: null,
    logs: [],
    nextNightStep: null,
    transitionTimer: null,
    phaseTransition: null,
    phaseTimer: null
  };
  const player = createPlayer(hostName, socketId, true);
  room.players[player.id] = player;
  room.hostId = player.id;
  rooms.set(code, room);
  socketIndex.set(socketId, { roomCode: code, playerId: player.id });
  return { room, player };
}

function createPlayer(name, socketId, isHost) {
  return {
    id: PLAYER_ID(),
    name,
    role: null,
    team: null,
    alive: true,
    connected: true,
    socketId,
    isHost: !!isHost,
    voteTarget: null,
    nightAction: null,
    ready: false,
    seerResult: null
  };
}

function normalizeRoleConfig(config = {}) {
  const normalized = { ...DEFAULT_ROLE_CONFIG };
  for (const key of Object.keys(DEFAULT_ROLE_CONFIG)) {
    const raw = Number(config[key]);
    normalized[key] = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_ROLE_CONFIG[key];
  }
  return normalized;
}

function validateCounts(room) {
  const players = Object.values(room.players);
  if (players.length < room.minPlayers) {
    return { error: `Need at least ${room.minPlayers} players` };
  }
  const configured = Object.entries(room.roleConfig).reduce((sum, [, count]) => sum + count, 0);
  if (configured > players.length) {
    return { error: 'Role count exceeds players' };
  }
  if (room.roleConfig.werewolf < 1) {
    return { error: 'Need at least 1 Werewolf' };
  }
  return { ok: true };
}

function assignRoles(room) {
  const players = shuffle(Object.values(room.players));
  const deck = [];
  for (const [role, count] of Object.entries(room.roleConfig)) {
    for (let i = 0; i < count; i += 1) {
      deck.push(role);
    }
  }
  while (deck.length < players.length) {
    deck.push('villager');
  }
  shuffle(deck);
  players.forEach((player, index) => {
    const role = deck[index];
    player.role = role;
    player.team = ROLE_INFO[role]?.team ?? 'village';
    player.ready = false;
    player.seerResult = null;
    if (role === 'werewolf') {
      player.nightAction = { vote: null };
    } else {
      player.nightAction = null;
    }
  });
}

function broadcastRoom(room) {
  Object.values(room.players).forEach((player) => sendStateToPlayer(room, player));
}

function sendStateToPlayer(room, player) {
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

function advanceFromReveal(room) {
  if (room.roleConfig.armor > 0 && Object.values(room.players).some((p) => p.role === 'armor' && p.alive)) {
    room.phase = 'armor';
    room.phaseStep = null;
  } else {
    startNight(room);
  }
  broadcastRoom(room);
}

function startNight(room) {
  room.phase = 'night';
  room.phaseStep = 'wolves';
  room.nextNightStep = null;
  room.phaseTransition = null;
  if (room.transitionTimer) {
    clearTimeout(room.transitionTimer);
    room.transitionTimer = null;
  }
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  room.wolfVotes = {};
  Object.values(room.players).forEach((player) => {
    if (player.role === 'werewolf' && player.alive) {
      room.wolfVotes[player.id] = null;
    }
  });
  room.wolfTarget = null;
  room.seerActed = false;
  room.pendingDeaths = [];
  room.lastNightDeaths = [];
  room.voteState = createVoteState();
  room.awaitingHunterShot = null;
  broadcastRoom(room);
}

function tryFinalizeWolfVote(room) {
  const wolves = Object.values(room.players).filter((p) => p.role === 'werewolf' && p.alive);
  if (!wolves.length) {
    scheduleNightStep(room, 'seer');
    return;
  }
  const pending = wolves.some((wolf) => room.wolfVotes[wolf.id] == null);
  if (pending) return;
  const tally = {};
  Object.values(room.wolfVotes).forEach((targetId) => {
    if (!targetId) return;
    tally[targetId] = (tally[targetId] || 0) + 1;
  });
  let chosen = null;
  let max = 0;
  let tied = [];
  Object.entries(tally).forEach(([targetId, count]) => {
    if (count > max) {
      max = count;
      chosen = targetId;
      tied = [targetId];
    } else if (count === max) {
      tied.push(targetId);
    }
  });
  if (tied.length > 1) {
    chosen = tied[Math.floor(Math.random() * tied.length)];
  }
  if (!chosen && wolves.length) {
    const aliveNonWolves = Object.values(room.players).filter((p) => p.alive && p.role !== 'werewolf');
    if (aliveNonWolves.length) {
      chosen = aliveNonWolves[Math.floor(Math.random() * aliveNonWolves.length)].id;
    }
  }
  room.wolfTarget = chosen;
  scheduleNightStep(room, 'seer');
}

function advanceNightStep(room) {
  if (room.phaseStep === 'seer') {
    const seerAlive = Object.values(room.players).some((p) => p.role === 'seer' && p.alive);
    if (!seerAlive || room.seerActed) {
      room.seerActed = false;
      scheduleNightStep(room, 'witch');
      return;
    }
    broadcastRoom(room);
    return;
  }
  if (room.phaseStep === 'witch') {
    const witchAlive = Object.values(room.players).some((p) => p.role === 'witch' && p.alive);
    if (!witchAlive) {
      scheduleNightStep(room, 'resolve');
      return;
    }
    broadcastRoom(room);
    return;
  }
}

function handleWitchDecision(room, action, targetId) {
  if (action === 'heal') {
    if (!room.witchState.healAvailable) return;
    if (!room.wolfTarget) return;
    room.witchState.healAvailable = false;
    room.healedTarget = room.wolfTarget;
  } else if (action === 'poison') {
    if (!room.witchState.poisonAvailable) return;
    const target = room.players[targetId];
    if (!target || !target.alive) return;
    room.witchState.poisonAvailable = false;
    room.poisonTarget = targetId;
  }
  // skip action uses neither potion
  scheduleNightStep(room, 'resolve');
}

function resolveNight(room) {
  if (room.wolfTarget && room.healedTarget !== room.wolfTarget) {
    queueDeath(room, room.wolfTarget, 'eaten by Werewolves');
  }
  if (room.poisonTarget) {
    queueDeath(room, room.poisonTarget, 'poisoned by Witch');
  }
  room.healedTarget = null;
  room.poisonTarget = null;
  resolveDeaths(room, 'night');
  if (!room.winner && !room.awaitingHunterShot) {
    schedulePhaseTransition(room, 'nightToDay');
  }
}

function queueDeath(room, playerId, reason) {
  room.pendingDeaths.push({ playerId, reason });
}

function resolveDeaths(room, context = 'general') {
  const announced = [];
  while (room.pendingDeaths.length) {
    const { playerId, reason } = room.pendingDeaths.shift();
    const player = room.players[playerId];
    if (!player || !player.alive) continue;
    player.alive = false;
    player.voteTarget = null;
    announced.push({ name: player.name, role: player.role });
    addLog(
      room,
      `${player.name} died (${reason}). Role: ${ROLE_INFO[player.role]?.label || player.role}.`,
      `${player.name} died. Role: ${ROLE_INFO[player.role]?.label || player.role}.`
    );
    if (player.role === 'hunter') {
      const socket = player.socketId && io.sockets.sockets.get(player.socketId);
      if (socket && player.connected) {
        room.awaitingHunterShot = player.id;
        socket.emit('hunterPrompt', { roomCode: room.code });
      }
    }
    if (room.lovers && (room.lovers.aId === playerId || room.lovers.bId === playerId)) {
      const otherId = room.lovers.aId === playerId ? room.lovers.bId : room.lovers.aId;
      const other = room.players[otherId];
      if (other && other.alive) {
        queueDeath(room, otherId, 'died of heartbreak');
      }
    }
  }
  if (announced.length && context === 'night') {
    room.lastNightDeaths = announced;
  }
  if (!room.awaitingHunterShot) {
    checkWinners(room);
  }
  broadcastRoom(room);
}

function tryResolveDayVote(room) {
  const alivePlayers = Object.values(room.players).filter((p) => p.alive);
  const everyoneVoted = alivePlayers.every((p) => room.voteState.votes[p.id] !== undefined);
  if (!everyoneVoted) return;
  const tallies = {};
  const votes = Object.values(room.voteState.votes);
  const abstainCount = votes.filter((value) => value === null).length;
  votes.forEach((targetId) => {
    if (!targetId) return;
    tallies[targetId] = (tallies[targetId] || 0) + 1;
  });
  const entries = Object.entries(tallies);
  if (!entries.length) {
    addLog(room, 'Vote skipped. No one eliminated.', 'Vote skipped. No one eliminated.');
    schedulePhaseTransition(room, 'dayToNight');
    return;
  }
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  // If a strict majority (> 50%) of alive players abstain (vote null),
  // the vote is considered skipped. The case where everyone abstains is
  // already handled above when entries.length === 0.
  if (abstainCount > alivePlayers.length / 2) {
    addLog(room, 'Majority abstained. No one eliminated.', 'Majority abstained. No one eliminated.');
    schedulePhaseTransition(room, 'dayToNight');
    return;
  }
  const tied = entries.filter(([, count]) => count === top[1]).map(([id]) => id);
  if (tied.length > 1) {
    if (!room.voteState.revoteFromTie) {
      room.voteState.revoteFromTie = tied;
      room.voteState.votes = {};
      addLog(room, 'Vote tied. Revote among highlighted players.');
      broadcastRoom(room);
      return;
    }
    const randomPick = tied[Math.floor(Math.random() * tied.length)];
    resolveDayKill(room, randomPick);
  } else {
    resolveDayKill(room, top[0]);
  }
}

function resolveDayKill(room, targetId) {
  const target = room.players[targetId];
  if (!target || !target.alive) return;
  addLog(
    room,
    `${target.name} was voted out. Role: ${ROLE_INFO[target.role]?.label || target.role}.`,
    `${target.name} was voted out. Role: ${ROLE_INFO[target.role]?.label || target.role}.`
  );
  if (target.role === 'joker') {
    room.winner = { team: 'joker', reason: 'Joker was voted out and laughs last!' };
    room.phase = 'ended';
    room.phaseStep = null;
    room.nextNightStep = null;
    room.phaseTransition = null;
    if (room.transitionTimer) {
      clearTimeout(room.transitionTimer);
      room.transitionTimer = null;
    }
    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
      room.phaseTimer = null;
    }
    broadcastRoom(room);
    return;
  }
  queueDeath(room, targetId, 'executed by vote');
  resolveDeaths(room, 'day');
  if (!room.winner && !room.awaitingHunterShot) {
    schedulePhaseTransition(room, 'dayToNight');
  }
}

function checkWinners(room) {
  if (room.winner) return;
  const alive = Object.values(room.players).filter((p) => p.alive);
  const wolves = alive.filter((p) => p.role === 'werewolf');
  if (!wolves.length) {
    room.winner = { team: 'village', reason: 'All Werewolves are dead.' };
    room.phase = 'ended';
    room.phaseStep = null;
    room.nextNightStep = null;
    room.phaseTransition = null;
    if (room.transitionTimer) {
      clearTimeout(room.transitionTimer);
      room.transitionTimer = null;
    }
    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
      room.phaseTimer = null;
    }
    return;
  }
  const others = alive.length - wolves.length;
  if (wolves.length >= others) {
    room.winner = { team: 'wolves', reason: 'Werewolves reached parity.' };
    room.phase = 'ended';
    room.phaseStep = null;
    room.nextNightStep = null;
    room.phaseTransition = null;
    if (room.transitionTimer) {
      clearTimeout(room.transitionTimer);
      room.transitionTimer = null;
    }
    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
      room.phaseTimer = null;
    }
  }
}

function scheduleNightStep(room, nextStep) {
  if (room.transitionTimer) {
    clearTimeout(room.transitionTimer);
    room.transitionTimer = null;
  }
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  room.phaseStep = 'transition';
  room.nextNightStep = nextStep;
  room.phaseTransition = null;
  broadcastRoom(room);
  room.transitionTimer = setTimeout(() => {
    if (room.phase !== 'night') return;
    room.phaseStep = nextStep;
    room.nextNightStep = null;
    if (nextStep === 'resolve') {
      resolveNight(room);
    } else {
      broadcastRoom(room);
    }
  }, NIGHT_DELAY_MS);
}

function schedulePhaseTransition(room, kind) {
  if (room.transitionTimer) {
    clearTimeout(room.transitionTimer);
    room.transitionTimer = null;
  }
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  room.phaseTransition = kind;
  room.nextNightStep = null;
  if (room.phase === 'night') {
    room.phaseStep = 'transition';
  }
  broadcastRoom(room);
  room.phaseTimer = setTimeout(() => {
    if (room.winner) return;
    room.phaseTransition = null;
    if (kind === 'postReveal') {
      advanceFromReveal(room);
      return;
    }
    if (kind === 'postArmor') {
      startNight(room);
      return;
    }
    if (kind === 'nightToDay') {
      room.dayCount += 1;
      room.phase = 'day';
      room.phaseStep = null;
      room.nextNightStep = null;
      room.voteState = createVoteState();
      addLog(room, `Day ${room.dayCount} has begun.`);
      broadcastRoom(room);
      return;
    }
    if (kind === 'dayToNight') {
      startNight(room);
    }
  }, PHASE_DELAY_MS);
}

function notifyLovers(room) {
  if (!room.lovers) return;
  const loverA = room.players[room.lovers.aId];
  const loverB = room.players[room.lovers.bId];
  if (loverA && loverB) {
    addLog(room, `${loverA.name} and ${loverB.name} are now Lovers.`, 'Two players are now Lovers.');
  }
}

function createVoteState() {
  return {
    votes: {},
    revoteFromTie: null
  };
}

function addLog(room, text, publicText = null) {
  room.logs.push({ ts: Date.now(), text, publicText });
}

function shuffle(arr) {
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
