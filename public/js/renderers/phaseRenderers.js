import { ROLE_DETAILS } from '../config/constants.js';
import { state } from '../state/gameState.js';
import { getPlayerName } from '../utils/helpers.js';

function renderRoleRevealList(room) {
  const players = room?.players ?? [];
  const safeRoleDetails = ROLE_DETAILS || {};
  const rows = players.map((player) => `<div>${player.name} - ${safeRoleDetails[player.role]?.name || player.role || 'Unknown'}</div>`).join('');
  return `<div style="margin-top:1rem;">${rows}</div>`;
}

function renderLobbySection(room) {
  const totals = Object.values(room.roleConfig).reduce((sum, count) => sum + count, 0);
  const playersCount = room.players.length;
  const villagerSlots = Math.max(playersCount - totals, 0);
  const needsAdjust = totals > playersCount;
  const canStart = state?.playerId === room.hostId;
  const safeRoleDetails = ROLE_DETAILS || {};
  const roleInputs = Object.entries(room.roleConfig).map(([role, count]) => `
    <label>
      <span>${safeRoleDetails[role]?.name || role}</span>
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
  const players = room?.players ?? [];
  const self = players.find((p) => p.id === state?.playerId) || null;
  const info = self?.role && ROLE_DETAILS ? ROLE_DETAILS[self.role] : null;
  const readyCount = players.filter((p) => p.ready).length;
  const totalCount = players.filter((p) => p.connected).length;
  const isSelfReady = self?.ready;
  const isHost = room.hostId === state?.playerId;
  const allReady = readyCount === totalCount;
  
  let actionButton = '';
  if (isHost && !isSelfReady) {
    actionButton = '<button id="ready-btn">I\'m Ready</button>';
  } else if (isHost) {
    actionButton = `<button id="continue-btn" ${!allReady ? 'disabled' : ''}>Continue</button>`;
  } else if (!isSelfReady) {
    actionButton = '<button id="ready-btn">I\'m Ready</button>';
  } else {
    actionButton = '<p style="color:#4ade80;">You are ready. Waiting for others...</p>';
  }
  
  return `
    <section class="panel">
      <h2>Your Role</h2>
      ${info ? '<p>Tap "Reveal Role" to view your role.</p>' : '<p>Waiting for assignment...</p>'}
      ${actionButton}
      <p>Players ready: ${readyCount} / ${totalCount}</p>
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
  if (room.phaseStep === 'transition') {
    const nextLabel = room.nextNightStep ? room.nextNightStep.toUpperCase() : '...';
    content = `<p>Transitioning... next: ${nextLabel}.</p>`;
  } else if (self?.alive) {
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
  const hostControls = room && state && room.hostId === state.playerId && ['wolves', 'seer', 'witch', 'transition'].includes(room.phaseStep || '')
    ? '<div class="actions"><button id="skip-step" type="button">Skip current action</button></div>'
    : '';
  return `
    <section class="panel">
      <h2>Night Phase - ${stepLabel}</h2>
      ${content}
      ${hostControls}
    </section>
  `;
}

function renderDaySection(room, self) {
  const lastNightDeaths = room.lastNightDeaths ?? [];
  const summary = lastNightDeaths.length
    ? `<ul>${lastNightDeaths.map((entry) => `<li>${entry.name} (${ROLE_DETAILS[entry.role]?.name || entry.role})</li>`).join('')}</ul>`
    : '<p>No one died last night.</p>';
  const yourVote = room?.voteState?.yourVote;
  const votedValue = yourVote !== undefined ? yourVote : state?.pendingVote;
  const voteForm = self?.alive
    ? votedValue !== undefined
      ? renderVoteConfirmation(room, votedValue)
      : renderVoteForm(room)
    : '<p>You are dead and cannot vote.</p>';
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

function renderWolfForm(room) {
  const wolfIds = Object.keys(room.wolfVotes || {});
  const votesCast = Object.values(room.wolfVotes || {}).filter(Boolean).length;
  const aliveTargets = (room?.players ?? []).filter((p) => p.alive && p.id !== state.playerId);
  if (!aliveTargets.length) {
    return '<p>No valid targets available.</p>';
  }
  const currentVote = room.wolfVotes?.[state.playerId] || '';
  const options = aliveTargets.map((p) => `<option value="${p.id}" ${currentVote === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
  const peers = room.wolfPeers?.length ? `<p>Other wolves: ${room.wolfPeers.join(', ')}</p>` : '';
  const voteEntries = Object.entries(room.wolfVotes || {}).filter(([, targetId]) => targetId);
  const targetVoteCounts = voteEntries.reduce((acc, [, targetId]) => {
    acc[targetId] = (acc[targetId] || 0) + 1;
    return acc;
  }, {});
  const voteSummary = Object.keys(targetVoteCounts).length
    ? `<p>Wolf votes: ${
        Object.entries(targetVoteCounts)
          .map(([targetId, count]) => `${getPlayerName(room, targetId)} (${count} vote${count > 1 ? 's' : ''})`)
          .join(', ')
      }</p>`
    : '';
  return `
    <form id="wolf-form" class="actions">
      ${peers}
      ${voteSummary}
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
  const targets = (room?.players ?? []).filter((p) => p.alive && p.id !== state.playerId);
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
        <span>Choose someone to eliminate</span>
        <select name="target" required>
          <option value="">Select a player</option>
          <option value="__abstain__">Abstain</option>
          ${options}
        </select>
      </label>
      <button type="submit" id="vote-submit" disabled>Submit vote</button>
      <small>${submitted} / ${room.voteState.required} votes submitted.</small>
    </form>
  `;
}

function renderVoteConfirmation(room, votedValue) {
  if (votedValue === null) {
    return '<p style="color:#4ade80;">Vote submitted: Abstain.</p>';
  }
  const name = getPlayerName(room, votedValue);
  return `<p style="color:#4ade80;">Vote submitted: ${name}.</p>`;
}

export {
  renderLobbySection,
  renderRoleRevealSection,
  renderArmorSection,
  renderNightSection,
  renderDaySection,
  renderRoleRevealList
};
