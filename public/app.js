const socket = io();
const appEl = document.getElementById('app');
const storageKey = 'werewolves.session';

const ROLE_DETAILS = {
  werewolf: {
    name: 'Werewolf',
    description: 'Coordinate at night to eat one villager.',
    color: '#f97316'
  },
  seer: {
    name: 'Seer',
    description: 'Inspect a player each night to learn if they are a Werewolf.',
    color: '#22d3ee'
  },
  hunter: {
    name: 'Hunter',
    description: 'When you die, immediately shoot someone else.',
    color: '#f87171'
  },
  witch: {
    name: 'Witch',
    description: 'Single-use heal & poison potions. At most one per night.',
    color: '#a855f7'
  },
  armor: {
    name: 'Armor',
    description: 'Before the first night, link two Lovers forever.',
    color: '#38bdf8'
  },
  joker: {
    name: 'Joker',
    description: 'Get voted out during the day to win instantly.',
    color: '#facc15'
  },
  villager: {
    name: 'Villager',
    description: 'Use your wits during the day. No special powers.',
    color: '#cbd5f5'
  }
};

const state = {
  room: null,
  roomCode: '',
  playerId: '',
  playerName: '',
  hunterPrompt: false,
  storedSession: loadSession()
};

if (state.storedSession) {
  attemptResume(state.storedSession);
} else {
  renderLanding();
}

socket.on('connect', () => {
  if (state.playerId && state.roomCode) {
    socket.emit('requestState', { roomCode: state.roomCode, playerId: state.playerId });
  }
});

socket.on('roomUpdate', (room) => {
  state.room = room;
  state.roomCode = room.code;
  if (!state.playerId && room.self) {
    state.playerId = room.self.id;
  }
  if (room.self?.id === state.playerId) {
    state.playerName = room.players.find((p) => p.id === room.self.id)?.name || state.playerName;
    saveSession();
  }
  renderApp();
});

socket.on('hunterPrompt', () => {
  state.hunterPrompt = true;
  renderApp();
});

function renderLanding() {
  const saved = loadSession();
  const resumeBlock = saved
    ? `<button id="resume-btn">Resume ${saved.roomCode} as ${saved.name}</button>`
    : '';
  appEl.innerHTML = `
    <section class="panel">
      <h1>Werewolves</h1>
      <p>Host or join a moderator-free social deduction match.</p>
      <form id="create-form">
        <label>
          <span>Your name</span>
          <input name="name" required maxlength="20" placeholder="e.g. Alex" />
        </label>
        <button type="submit">Create Lobby</button>
      </form>
    </section>
    <section class="panel">
      <h2>Join a Lobby</h2>
      <form id="join-form">
        <label>
          <span>Your name</span>
          <input name="name" required maxlength="20" />
        </label>
        <label>
          <span>Room code</span>
          <input name="code" required maxlength="4" placeholder="ABCD" style="text-transform:uppercase" />
        </label>
        <button type="submit">Join Game</button>
      </form>
      ${resumeBlock ? `<div style="margin-top:1rem;display:flex;flex-direction:column;gap:.5rem;">${resumeBlock}</div>` : ''}
    </section>
  `;
  const createForm = document.getElementById('create-form');
  const joinForm = document.getElementById('join-form');
  createForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(createForm);
    const name = (formData.get('name') || '').toString().trim();
    if (!name) return;
    socket.emit('createRoom', { name }, (payload) => {
      if (payload?.error) {
        pushNotification(payload.error);
        renderLanding();
        return;
      }
      enterRoom({ roomCode: payload.roomCode, playerId: payload.playerId, name });
    });
  });
  joinForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(joinForm);
    const name = (formData.get('name') || '').toString().trim();
    const code = (formData.get('code') || '').toString().trim().toUpperCase();
    if (!name || code.length !== 4) return;
    socket.emit('joinRoom', { name, code }, (payload) => {
      if (payload?.error) {
        pushNotification(payload.error);
        renderLanding();
        return;
      }
      enterRoom({ roomCode: payload.roomCode, playerId: payload.playerId, name });
    });
  });
  document.getElementById('resume-btn')?.addEventListener('click', () => {
    if (saved) {
      attemptResume(saved);
    }
  });
}

function renderApp() {
  if (!state.room) {
    renderLanding();
    return;
  }
  state.hunterPrompt = !!state.room.awaitingHunterShot;
  const sections = [
    renderHeader(),
    renderPhaseSection(),
    renderPlayersPanel(),
    renderLogsPanel()
  ].filter(Boolean);
  appEl.innerHTML = sections.join('');
  bindCommonHandlers();
  bindPhaseHandlers();
  updateHunterOverlay();
}

function renderHeader() {
  const self = state.room.self;
  const detail = self?.role ? ROLE_DETAILS[self.role] : null;
  const loverNote = state.room.loverName ? `<p>Lover: ${state.room.loverName}</p>` : '';
  const roleBlock = self?.role
    ? `<div class="role-card" style="border-color:${detail?.color || '#f8fafc'};color:${detail?.color || '#f8fafc'}">
        <strong>${detail?.name || self.role}</strong>
        <p>${detail?.description || ''}</p>
        ${loverNote}
      </div>`
    : '';
  return `
    <section class="panel">
      <div style="display:flex;flex-direction:column;gap:.5rem;">
        <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between;">
          <div>
            <h1>Room ${state.room.code}</h1>
            <p>Phase: ${formatPhase(state.room)}</p>
          </div>
          <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">
            <span class="tag">You: ${state.playerName || 'Unknown'}</span>
            ${self?.alive ? '<span class="tag" style="border-color:#4ade80;color:#4ade80;">Alive</span>' : '<span class="tag" style="border-color:#ef4444;color:#ef4444;">Dead</span>'}
            <button id="leave-room" type="button">Leave Game</button>
          </div>
        </div>
        ${roleBlock}
      </div>
    </section>
  `;
}

function renderPhaseSection() {
  const room = state.room;
  const self = room.self;
  if (room.winner) {
    return `
      <section class="panel">
        <h2>Game Over</h2>
        <p>${room.winner.reason}</p>
        <p><strong>Winner:</strong> ${room.winner.team.toUpperCase()}</p>
        <button id="restart-btn" type="button">Return to lobby</button>
        ${renderRoleRevealList(room)}
      </section>
    `;
  }
  switch (room.phase) {
    case 'lobby':
      return renderLobbySection(room);
    case 'roleReveal':
      return renderRoleRevealSection(room);
    case 'armor':
      return renderArmorSection(room, self);
    case 'night':
      return renderNightSection(room, self);
    case 'day':
      return renderDaySection(room, self);
    default:
      return '';
  }
}

function renderLobbySection(room) {
  const totals = Object.values(room.roleConfig).reduce((sum, count) => sum + count, 0);
  const playersCount = room.players.length;
  const villagerSlots = Math.max(playersCount - totals, 0);
  const needsAdjust = totals > playersCount;
  const canStart = state.playerId === room.hostId;
  const roleInputs = Object.entries(room.roleConfig).map(([role, count]) => `
    <label>
      <span>${ROLE_DETAILS[role]?.name || role}</span>
      <input type="number" class="role-input" data-role="${role}" min="0" value="${count}" />
    </label>
  `).join('');
  return `
    <section class="panel">
      <h2>Lobby</h2>
      <p>Share this code so friends can join: <strong>${room.code}</strong></p>
      ${canStart ? `<form id="role-config" class="actions">
        ${roleInputs}
        <label>
          <span>Minimum players required</span>
          <input type="number" id="min-players" min="3" value="${room.minPlayers || 5}" />
        </label>
      </form>` : '<p>Waiting for host to configure roles.</p>'}
      <p>Configured roles: ${totals} / ${playersCount}. Villagers auto-fill: ${villagerSlots}</p>
      <p>Minimum players to start: ${room.minPlayers || 5}</p>
      ${needsAdjust ? '<p style="color:#fca5a5;">Too many roles for current players.</p>' : ''}
      <button id="start-game" ${!canStart ? 'disabled' : ''}>Start Game</button>
    </section>
  `;
}

function renderRoleRevealSection(room) {
  const self = room.self;
  const info = self?.role ? ROLE_DETAILS[self.role] : null;
  const readyCount = room.players.filter((p) => p.ready).length;
  const totalCount = room.players.length;
  const isReady = self?.ready;
  const isHost = room.hostId === state.playerId;
  const allReady = readyCount === totalCount;
  
  let actionButton = '';
  if (isHost) {
    actionButton = `<button id="continue-btn" ${!allReady ? 'disabled' : ''}>Continue</button>`;
  } else if (!isReady) {
    actionButton = '<button id="ready-btn">I\'m Ready</button>';
  } else {
    actionButton = '<p style="color:#4ade80;">✓ You are ready. Waiting for others...</p>';
  }
  
  return `
    <section class="panel">
      <h2>Your Role</h2>
      ${info ? `<p style="color:${info.color};font-size:1.2rem;">${info.name}</p><p>${info.description}</p>` : '<p>Waiting for assignment...</p>'}
      <p>Players ready: ${readyCount} / ${totalCount}</p>
      ${actionButton}
    </section>
  `;
}

function renderArmorSection(room, self) {
  if (self?.role === 'armor' && self.alive && !room.loversAssigned) {
    const alivePlayers = room.players.filter((p) => p.alive && p.id !== self.id);
    const options = alivePlayers.map((player) => `<option value="${player.id}">${player.name}</option>`).join('');
    return `
      <section class="panel">
        <h2>Choose Lovers</h2>
        <form id="armor-form" class="actions">
          <label>
            <span>Lover A</span>
            <select name="loverA" required>
              <option value="">Select player</option>
              ${options}
            </select>
          </label>
          <label>
            <span>Lover B</span>
            <select name="loverB" required>
              <option value="">Select player</option>
              ${options}
            </select>
          </label>
          <button type="submit">Link Lovers</button>
        </form>
      </section>
    `;
  }
  return `
    <section class="panel">
      <h2>Armor is working</h2>
      <p>The Armor is selecting two Lovers in secret.</p>
    </section>
  `;
}

function renderNightSection(room, self) {
  const stepLabel = room.phaseStep ? room.phaseStep.toUpperCase() : 'NIGHT';
  let content = '<p>You sleep peacefully.</p>';
  if (self?.alive) {
    if (room.phaseStep === 'wolves' && self.role === 'werewolf') {
      content = renderWolfForm(room);
    } else if (room.phaseStep === 'seer' && self.role === 'seer') {
      content = renderSeerForm(room);
    } else if (room.phaseStep === 'witch' && self.role === 'witch') {
      content = renderWitchForm(room);
    }
  } else {
    content = '<p>You are dead. Spectating only.</p>';
  }
  return `
    <section class="panel">
      <h2>Night Phase – ${stepLabel}</h2>
      ${content}
    </section>
  `;
}

function renderDaySection(room, self) {
  const summary = room.lastNightDeaths?.length
    ? `<ul>${room.lastNightDeaths.map((entry) => `<li>${entry.name} (${ROLE_DETAILS[entry.role]?.name || entry.role})</li>`).join('')}</ul>`
    : '<p>No one died last night.</p>';
  const voteForm = self?.alive ? renderVoteForm(room) : '<p>You are dead and cannot vote.</p>';
  return `
    <section class="panel">
      <h2>Day ${room.dayCount}</h2>
      <h3>Night Report</h3>
      ${summary}
      <h3>Vote to eliminate</h3>
      ${voteForm}
    </section>
  `;
}

function renderPlayersPanel() {
  const cards = state.room.players.map((player) => `
    <div class="player-card ${player.alive ? '' : 'dead'}">
      <strong>${player.name}</strong>
      <div style="margin-top:.35rem;font-size:.9rem;display:flex;flex-wrap:wrap;gap:.35rem;">
        ${player.isHost ? '<span class="tag">Host</span>' : ''}
        ${!player.connected ? '<span class="tag" style="border-color:#fbbf24;color:#fbbf24;">Disconnected</span>' : ''}
        ${state.room.phase === 'ended' && player.role ? `<span class="tag" style="border-color:#38bdf8;color:#38bdf8;">${ROLE_DETAILS[player.role]?.name || player.role}</span>` : ''}
      </div>
    </div>
  `).join('');
  return `
    <section class="panel">
      <h2>Players (${state.room.players.length})</h2>
      <div class="players-list">${cards}</div>
    </section>
  `;
}

function renderLogsPanel() {
  const logs = state.room.logs?.map((log) => `<div>${new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${log.text}</div>`).join('') || '';
  return `
    <section class="panel">
      <h2>Events</h2>
      <div class="logs">${logs || '<p>No events yet.</p>'}</div>
    </section>
  `;
}

function renderWolfForm(room) {
  const wolfIds = Object.keys(room.wolfVotes || {});
  const votesCast = Object.values(room.wolfVotes || {}).filter(Boolean).length;
  const aliveTargets = room.players.filter((p) => p.alive && p.id !== state.playerId);
  if (!aliveTargets.length) {
    return '<p>No valid targets available.</p>';
  }
  const currentVote = room.wolfVotes?.[state.playerId] || '';
  const options = aliveTargets.map((p) => `<option value="${p.id}" ${currentVote === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
  const peers = room.wolfPeers?.length ? `<p>Other wolves: ${room.wolfPeers.join(', ')}</p>` : '';
  return `
    <form id="wolf-form" class="actions">
      ${peers}
      <label>
        <span>Select a victim</span>
        <select name="target" required>
          <option value="">Pick target</option>
          ${options}
        </select>
      </label>
      <button type="submit">Submit vote</button>
      <small>${votesCast} / ${wolfIds.length || 1} votes submitted.</small>
    </form>
  `;
}

function renderSeerForm(room) {
  const targets = room.players.filter((p) => p.alive && p.id !== state.playerId);
  if (!targets.length) return '<p>No one left to inspect.</p>';
  const options = targets.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  const result = room.seerResult ? `<p>Last vision: ${room.seerResult.name} is ${room.seerResult.result}.</p>` : '';
  return `
    <form id="seer-form" class="actions">
      <label>
        <span>Inspect someone</span>
        <select name="target" required>
          <option value="">Select target</option>
          ${options}
        </select>
      </label>
      <button type="submit">Reveal alignment</button>
      ${result}
    </form>
  `;
}

function renderWitchForm(room) {
  const healedText = room.wolfTarget ? `Wolves targeted ${getPlayerName(room, room.wolfTarget)}.` : 'Wolves have no target.';
  const aliveTargets = room.players.filter((p) => p.alive && p.id !== state.playerId);
  const options = aliveTargets.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  return `
    <div class="actions">
      <p>${healedText}</p>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;">
        <button type="button" id="heal-btn" ${!room.witchState.healAvailable || !room.wolfTarget ? 'disabled' : ''}>Use heal potion</button>
        <div style="flex:1;min-width:220px;">
          <label>
            <span>Poison target</span>
            <select id="poison-select" ${!room.witchState.poisonAvailable ? 'disabled' : ''}>
              <option value="">Choose player</option>
              ${options}
            </select>
          </label>
        </div>
        <button type="button" id="poison-btn" ${!room.witchState.poisonAvailable ? 'disabled' : ''}>Use poison</button>
      </div>
      <button type="button" id="skip-witch">Skip</button>
    </div>
  `;
}

function renderVoteForm(room) {
  const eligible = room.voteState.revoteFromTie
    ? room.players.filter((p) => room.voteState.revoteFromTie.includes(p.id))
    : room.players.filter((p) => p.alive);
  const filtered = eligible.filter((player) => player.id !== state.playerId && player.alive);
  const options = filtered.map((player) => `<option value="${player.id}">${player.name}</option>`).join('');
  const submitted = room.voteState.submitted || 0;
  const info = room.voteState.revoteFromTie ? `<p>Revote among tied players.</p>` : '';
  return `
    <form id="vote-form" class="actions">
      ${info}
      <label>
        <span>Choose someone to eliminate (or leave blank to abstain)</span>
        <select name="target">
          <option value="">Abstain</option>
          ${options}
        </select>
      </label>
      <button type="submit">Submit vote</button>
      <small>${submitted} / ${room.voteState.required} votes submitted.</small>
    </form>
  `;
}

function renderRoleRevealList(room) {
  const rows = room.players.map((player) => `<div>${player.name} – ${ROLE_DETAILS[player.role]?.name || player.role || 'Unknown'}</div>`).join('');
  return `<div style="margin-top:1rem;">${rows}</div>`;
}

function bindCommonHandlers() {
  document.getElementById('leave-room')?.addEventListener('click', () => {
    state.room = null;
    state.roomCode = '';
    state.playerId = '';
    state.playerName = '';
    state.hunterPrompt = false;
    clearSession();
    renderLanding();
  });
  document.getElementById('restart-btn')?.addEventListener('click', () => {
    state.room = null;
    renderLanding();
  });
}

function bindPhaseHandlers() {
  const room = state.room;
  if (!room) return;
  if (room.phase === 'lobby' && room.hostId === state.playerId) {
    document.querySelectorAll('.role-input').forEach((input) => {
      input.addEventListener('change', () => {
        const config = {};
        document.querySelectorAll('.role-input').forEach((field) => {
          config[field.dataset.role] = Number(field.value);
        });
        const minPlayersInput = document.getElementById('min-players');
        if (minPlayersInput) {
          config.minPlayers = Number(minPlayersInput.value);
        }
        socket.emit('updateRoleConfig', { roomCode: room.code, playerId: state.playerId, config });
      });
    });
    document.getElementById('min-players')?.addEventListener('change', (event) => {
      const value = Number(event.target.value);
      const config = { minPlayers: value };
      socket.emit('updateRoleConfig', { roomCode: room.code, playerId: state.playerId, config });
    });
    document.getElementById('start-game')?.addEventListener('click', () => {
      socket.emit('startGame', { roomCode: room.code, playerId: state.playerId }, (res) => {
        if (res?.error) notify(res.error);
      });
    });
  }
  if (room.phase === 'roleReveal') {
    if (room.hostId === state.playerId) {
      document.getElementById('continue-btn')?.addEventListener('click', () => {
        socket.emit('continueAfterReveal', { roomCode: room.code, playerId: state.playerId });
      });
    } else {
      document.getElementById('ready-btn')?.addEventListener('click', () => {
        socket.emit('markReady', { roomCode: room.code, playerId: state.playerId });
      });
    }
  }
  if (room.phase === 'armor' && room.self?.role === 'armor' && room.self.alive) {
    const armorForm = document.getElementById('armor-form');
    armorForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(armorForm);
      const targets = [data.get('loverA'), data.get('loverB')];
      if (!targets[0] || !targets[1] || targets[0] === targets[1]) {
        notify('Choose two distinct Lovers.');
        return;
      }
      socket.emit('submitArmor', { roomCode: room.code, playerId: state.playerId, targets });
    });
  }
  if (room.phase === 'night') {
    if (room.phaseStep === 'wolves' && room.self?.role === 'werewolf' && room.self.alive) {
      const wolfForm = document.getElementById('wolf-form');
      wolfForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(wolfForm);
        const targetId = data.get('target');
        if (!targetId) return;
        socket.emit('submitWolfVote', { roomCode: room.code, playerId: state.playerId, targetId });
      });
    }
    if (room.phaseStep === 'seer' && room.self?.role === 'seer' && room.self.alive) {
      const seerForm = document.getElementById('seer-form');
      seerForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(seerForm);
        const targetId = data.get('target');
        if (!targetId) return;
        socket.emit('submitSeerInspect', { roomCode: room.code, playerId: state.playerId, targetId });
      });
    }
    if (room.phaseStep === 'witch' && room.self?.role === 'witch' && room.self.alive) {
      document.getElementById('heal-btn')?.addEventListener('click', () => {
        socket.emit('submitWitchDecision', { roomCode: room.code, playerId: state.playerId, action: 'heal' });
      });
      document.getElementById('poison-btn')?.addEventListener('click', () => {
        const select = document.getElementById('poison-select');
        const target = select?.value;
        if (!target) return;
        socket.emit('submitWitchDecision', { roomCode: room.code, playerId: state.playerId, action: 'poison', targetId: target });
      });
      document.getElementById('skip-witch')?.addEventListener('click', () => {
        socket.emit('submitWitchDecision', { roomCode: room.code, playerId: state.playerId, action: 'skip' });
      });
    }
  }
  if (room.phase === 'day' && room.self?.alive) {
    const voteForm = document.getElementById('vote-form');
    voteForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(voteForm);
      const targetId = data.get('target');
      socket.emit('submitDayVote', { roomCode: room.code, playerId: state.playerId, targetId: targetId || null });
    });
  }
}

function updateHunterOverlay() {
  const existing = document.getElementById('hunter-overlay');
  if (!state.room?.awaitingHunterShot) {
    existing?.remove();
    state.hunterPrompt = false;
    return;
  }
  if (!state.hunterPrompt) return;
  existing?.remove();
  const wrapper = document.createElement('div');
  wrapper.id = 'hunter-overlay';
  wrapper.className = 'hunter-overlay';
  const targets = state.room.players.filter((player) => player.alive);
  const options = targets.map((player) => `<option value="${player.id}">${player.name}</option>`).join('');
  wrapper.innerHTML = `
    <div class="panel">
      <h2>Hunter's Last Shot</h2>
      <form id="hunter-form" class="actions">
        <label>
          <span>Choose who to shoot</span>
          <select name="target" required>
            <option value="">Select player</option>
            ${options}
          </select>
        </label>
        <button type="submit">Fire</button>
      </form>
    </div>
  `;
  document.body.appendChild(wrapper);
  const form = document.getElementById('hunter-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const targetId = data.get('target');
    if (!targetId) return;
    socket.emit('hunterShoot', { roomCode: state.room.code, playerId: state.playerId, targetId });
    state.hunterPrompt = false;
    wrapper.remove();
  });
}

function enterRoom({ roomCode, playerId, name }) {
  state.playerId = playerId;
  state.roomCode = roomCode;
  state.playerName = name;
  saveSession();
  socket.emit('requestState', { roomCode, playerId });
}

function attemptResume(saved) {
  socket.emit('resumePlayer', saved, (res) => {
    if (res?.error) {
      notify(res.error);
      clearSession();
      renderLanding();
    } else {
      state.playerId = saved.playerId;
      state.roomCode = saved.roomCode;
      state.playerName = saved.name;
      saveSession();
      socket.emit('requestState', { roomCode: saved.roomCode, playerId: saved.playerId });
    }
  });
}

function saveSession() {
  if (!state.playerId || !state.roomCode) return;
  const payload = { playerId: state.playerId, roomCode: state.roomCode, name: state.playerName };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function clearSession() {
  localStorage.removeItem(storageKey);
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || 'null');
  } catch {
    return null;
  }
}

function pushNotification(text) {
  notify(text);
}

function notify(text) {
  if (!text) return;
  window.alert(text);
}

function getPlayerName(room, id) {
  return room.players.find((p) => p.id === id)?.name || 'Unknown';
}

function formatPhase(room) {
  if (room.winner) return 'Ended';
  if (room.phase === 'night' && room.phaseStep) {
    return `${capitalize(room.phase)} (${capitalize(room.phaseStep)})`;
  }
  return capitalize(room.phase);
}

function capitalize(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
