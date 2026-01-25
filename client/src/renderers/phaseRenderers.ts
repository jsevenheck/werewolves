import { ROLE_DETAILS, PASSIVE_ROLE_DETAILS } from '../config/constants';
import { MIN_PLAYERS, NIGHT_DELAY_MS } from '@shared/constants';
import { state } from '../state/gameState';
import { escapeHtml, getPlayerName } from '../utils/helpers';
import type { PassiveRole, RoomView, RoomViewSelf } from '@shared/types';

function renderRoleRevealList(room: RoomView) {
  const players = room?.players ?? [];
  const safeRoleDetails = ROLE_DETAILS || {};
  const rows = players.map((player) => `<div>${escapeHtml(player.name)} - ${safeRoleDetails[player.role || 'villager']?.name || player.role || 'Unknown'}</div>`).join('');
  return `<div style="margin-top:1rem;">${rows}</div>`;
}

function renderLobbySection(room: RoomView) {
  const totals = Object.values(room.roleConfig).reduce((sum, count) => sum + count, 0);
  const playersCount = room.players.length;
  const villagerSlots = Math.max(playersCount - totals, 0);
  const needsAdjust = totals > playersCount;
  const canStart = state.playerId === room.hostId;
  const minPlayers = room.minPlayers ?? MIN_PLAYERS;
  const safeRoleDetails = ROLE_DETAILS || {};
  const passiveRoleConfig = room.passiveRoleConfig || { mayor: true };
  const passiveRoleDetails = PASSIVE_ROLE_DETAILS || {};
  const roleInputs = Object.entries(room.roleConfig).map(([role, count]) => `
    <label class="role-row">
      <span>${safeRoleDetails[role as keyof typeof safeRoleDetails]?.name || role}</span>
      <input type="number" class="role-input" data-role="${role}" min="0" value="${count}" />
    </label>
  `).join('');
  const passiveRoleInputs = Object.entries(passiveRoleConfig).map(([role, enabled]) => {
    const detail = passiveRoleDetails[role as PassiveRole];
    const label = detail?.name || role;
    return `
      <label class="toggle">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" class="passive-role-input" data-passive-role="${role}" ${enabled ? 'checked' : ''} />
        <span class="toggle-track" aria-hidden="true"></span>
      </label>
    `;
  }).join('');
  return `
    <section class="panel">
      <h2>Lobby</h2>
      <p>Share this code so friends can join: <strong>${escapeHtml(room.code)}</strong></p>
      ${canStart ? `<form id="role-config" class="actions">
        ${roleInputs}
        <div class="passive-roles">
          <h3>Passive Roles</h3>
          <div class="passive-role-list">
            ${passiveRoleInputs}
          </div>
        </div>
      </form>` : '<p>Waiting for host to configure roles.</p>'}
      <p class="role-summary">Configured roles: ${totals} / ${playersCount}. Villagers auto-fill: ${villagerSlots}</p>
      <p>Minimum players to start: ${minPlayers}</p>
      ${needsAdjust ? '<p style="color:#fca5a5;">Too many roles for current players.</p>' : ''}
      <button id="start-game" ${!canStart ? 'disabled' : ''}>Start Game</button>
    </section>
  `;
}

function renderRoleRevealSection(room: RoomView) {
  const players = room?.players ?? [];
  const self = players.find((p) => p.id === state.playerId) || null;
  const info = self?.role && ROLE_DETAILS ? ROLE_DETAILS[self.role] : null;
  const readyCount = players.filter((p) => p.ready).length;
  const totalCount = players.filter((p) => p.connected).length;
  const isSelfReady = self?.ready;
  const isHost = room.hostId === state.playerId;
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

function renderMayorSection(room: RoomView) {
  const self = room.self;
  const yourVote = room.voteState?.yourVote;
  const voteForm = self?.alive
    ? yourVote !== undefined
      ? renderVoteConfirmation(room, yourVote)
      : renderMayorVoteForm(room)
    : '<p>You are dead and cannot vote.</p>';
  const hostControls = room.hostId === state.playerId
    ? '<div class="actions host-actions"><button id="end-mayor-vote-btn" type="button">End Mayor Voting</button></div>'
    : '';
  return `
    <section class="panel">
      <h2>Mayor Election</h2>
      <p>Vote for the first Mayor. The Mayor's vote will break ties during day voting.</p>
      ${voteForm}
      ${hostControls}
    </section>
  `;
}

function renderArmorSection(room: RoomView, self: RoomViewSelf | null) {
  const hostControls = room.hostId === state.playerId
    ? '<div class="actions host-actions"><button id="skip-armor" type="button">Skip armor step</button></div>'
    : '';
  if (self?.role === 'armor' && self.alive && !room.loversAssigned) {
    const alivePlayers = room.players.filter((p) => p.alive && p.id !== self.id);
    const options = alivePlayers.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join('');
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
        ${hostControls}
      </section>
    `;
  }
  return `
    <section class="panel">
      <h2>Armor is working</h2>
      <p>The Armor is selecting two Lovers in secret.</p>
      ${hostControls}
    </section>
  `;
}

function renderNightSection(room: RoomView, self: RoomViewSelf | null) {
  const stepLabel = room.phaseStep ? room.phaseStep.toUpperCase() : 'NIGHT';
  let content = '<p>You sleep peacefully.</p>';
  if (room.phaseStep === 'transition') {
    const nextLabel = room.nextNightStep ? room.nextNightStep.toUpperCase() : '...';
    const durationSeconds = Math.round(NIGHT_DELAY_MS / 1000);
    content = `<p>Transitioning... next: ${nextLabel}.</p><p>Duration: ${durationSeconds}s.</p>`;
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
  const hostControls = room.hostId === state.playerId && ['wolves', 'seer', 'witch', 'transition'].includes(room.phaseStep || '')
    ? '<div class="actions host-actions"><button id="skip-step" type="button">Skip current action</button></div>'
    : '';
  return `
    <section class="panel">
      <h2>Night Phase - ${stepLabel}</h2>
      ${content}
      ${hostControls}
    </section>
  `;
}

function renderDaySection(room: RoomView, self: RoomViewSelf | null) {
  const lastNightDeaths = room.lastNightDeaths ?? [];
  const safeRoleDetails = ROLE_DETAILS || {};
  const summary = lastNightDeaths.length
    ? `<ul>${lastNightDeaths.map((entry) => `<li>${escapeHtml(entry.name)} (${safeRoleDetails[entry.role || 'villager']?.name || entry.role})</li>`).join('')}</ul>`
    : '<p>No one died last night.</p>';
  const yourVote = room?.voteState?.yourVote;
  const voteForm = self?.alive
    ? yourVote !== undefined
      ? renderVoteConfirmation(room, yourVote)
      : renderVoteForm(room)
    : '<p>You are dead and cannot vote.</p>';
  const hostControls = room.hostId === state.playerId
    ? '<div class="actions host-actions"><button id="end-vote-btn" type="button">End Voting</button></div>'
    : '';
  return `
    <section class="panel">
      <h2>Day ${room.dayCount}</h2>
      <h3>Night Report</h3>
      ${summary}
      <h3>Vote to eliminate</h3>
      ${voteForm}
      ${hostControls}
    </section>
  `;
}

function renderWolfForm(room: RoomView) {
  if (!room || !Array.isArray(room.players)) {
    return '<p>No game data available.</p>';
  }
  const wolfIds = Object.keys(room.wolfVotes || {});
  const votesCast = Object.values(room.wolfVotes || {}).filter((value) => value !== undefined && value !== '').length;
  const aliveTargets = (room?.players ?? []).filter((p) => p.alive && !wolfIds.includes(p.id));
  if (!aliveTargets.length) {
    return '<p>No valid targets available.</p>';
  }
  const currentVote = room?.wolfVotes?.[state.playerId];
  const locked = currentVote !== undefined && currentVote !== '';
  const pendingVote = locked ? undefined : state.pendingWolfVote;
  const selectedVote = locked ? currentVote : pendingVote;
  const options = aliveTargets.map((p) => `<option value="${p.id}" ${selectedVote === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const peers = room.wolfPeers?.length ? `<p>Other wolves: ${room.wolfPeers.map((name) => escapeHtml(name)).join(', ')}</p>` : '';
  const voteEntries = Object.entries(room.wolfVotes || {}).filter(([, targetId]) => targetId);
  const targetVoteCounts = voteEntries.reduce<Record<string, number>>((acc, [, targetId]) => {
    if (!targetId) return acc;
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
  const voteStatus = locked
    ? `<p style="color:#4ade80;">Vote submitted${currentVote ? `: ${getPlayerName(room, currentVote)}` : ''}. Awaiting other wolves.</p>`
    : '';
  const voteControls = locked
    ? ''
    : `
      <label>
        <span>Select a victim</span>
        <select name="target" required>
          <option value="">Pick target</option>
          ${options}
        </select>
      </label>
      <button type="submit">Submit vote</button>
    `;
  return `
    <form id="wolf-form" class="actions">
      ${peers}
      ${voteSummary}
      ${voteStatus}
      ${voteControls}
      <small>${votesCast} / ${wolfIds.length || 1} votes submitted.</small>
    </form>
  `;
}

function renderSeerForm(room: RoomView) {
  if (!room) return '<p>Room data unavailable.</p>';
  const targets = (room?.players ?? []).filter((p) => p.alive && p.id !== state.playerId);
  if (!targets.length) return '<p>No one left to inspect.</p>';
  const options = targets.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  const result = room.seerResult ? `<p>Last vision: ${escapeHtml(room.seerResult.name)} is ${room.seerResult.result}.</p>` : '';
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

function renderWitchForm(room: RoomView) {
  const healedText = room?.wolfTarget ? `Wolves targeted ${getPlayerName(room, room.wolfTarget)}.` : 'Wolves have no target.';
  const aliveTargets = (room?.players ?? []).filter((p) => p && p.alive && p.id !== state.playerId);
  const options = aliveTargets.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  const witchState = room?.witchState ?? { healAvailable: false, poisonAvailable: false };
  const skipLabel = !witchState.healAvailable ? 'Continue' : 'Skip';
  return `
    <div class="actions">
      <p>${healedText}</p>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;">
        <button type="button" id="heal-btn" ${!witchState.healAvailable || !room?.wolfTarget ? 'disabled' : ''}>Use heal potion</button>
        <div style="flex:1;min-width:220px;">
          <label>
            <span>Poison target</span>
            <select id="poison-select" ${!witchState.poisonAvailable ? 'disabled' : ''}>
              <option value="">Choose player</option>
              ${options}
            </select>
          </label>
        </div>
        <button type="button" id="poison-btn" ${!witchState.poisonAvailable ? 'disabled' : ''}>Use poison</button>
      </div>
      <button type="button" id="skip-witch">${skipLabel}</button>
    </div>
  `;
}

function renderMayorVoteForm(room: RoomView) {
  const eligible = room.voteState.revoteFromTie
    ? room.players.filter((p) => room.voteState.revoteFromTie?.includes(p.id))
    : room.players.filter((p) => p.alive);
  const pendingVote = state.pendingMayorVote;
  const options = eligible
    .filter((player) => player.alive)
    .map((player) => `<option value="${player.id}" ${pendingVote === player.id ? 'selected' : ''}>${escapeHtml(player.name)}</option>`)
    .join('');
  const submitted = room.voteState.submitted || 0;
  const info = room.voteState.revoteFromTie ? '<p>Revote among tied candidates.</p>' : '';
  return `
    <form id="mayor-vote-form" class="actions">
      ${info}
      <label>
        <span>Choose the Mayor</span>
        <select name="target" required>
          <option value="">Select a player</option>
          ${options}
        </select>
      </label>
      <button type="submit" id="mayor-vote-submit" disabled>Submit vote</button>
      <small>${submitted} / ${room.voteState.required} votes submitted.</small>
    </form>
  `;
}

function renderVoteForm(room: RoomView) {
  const eligible = room.voteState.revoteFromTie
    ? room.players.filter((p) => room.voteState.revoteFromTie?.includes(p.id))
    : room.players.filter((p) => p.alive);
  const filtered = eligible.filter((player) => player.id !== state.playerId && player.alive);
  const pendingVote = state.pendingVote;
  const abstainSelected = pendingVote === null;
  const options = filtered
    .map((player) => `<option value="${player.id}" ${pendingVote === player.id ? 'selected' : ''}>${escapeHtml(player.name)}</option>`)
    .join('');
  const submitted = room.voteState.submitted || 0;
  const info = room.voteState.revoteFromTie ? '<p>Revote among tied players.</p>' : '';
  return `
    <form id="vote-form" class="actions">
      ${info}
      <label>
        <span>Choose someone to eliminate</span>
        <select name="target" required>
          <option value="">Select a player</option>
          <option value="__abstain__" ${abstainSelected ? 'selected' : ''}>Abstain</option>
          ${options}
        </select>
      </label>
      <button type="submit" id="vote-submit" disabled>Submit vote</button>
      <small>${submitted} / ${room.voteState.required} votes submitted.</small>
    </form>
  `;
}

function renderVoteConfirmation(room: RoomView, votedValue: string | null) {
  const submitted = room.voteState?.submitted ?? 0;
  const required = room.voteState?.required ?? 0;
  const countNote = `<small>${submitted} / ${required} votes submitted.</small>`;
  if (votedValue === null) {
    return `<p style="color:#4ade80;">Vote submitted: Abstain.</p>${countNote}`;
  }
  const name = getPlayerName(room, votedValue);
  return `<p style="color:#4ade80;">Vote submitted: ${name}.</p>${countNote}`;
}

function renderPendingActionsPanel(room: RoomView) {
  const isHost = room.hostId === state.playerId;
  const panels: string[] = [];

  if (room.mayorSelectionPending && !room.awaitingMayorSelection) {
    const skipButton = isHost
      ? '<button id="skip-mayor-selection" type="button">Skip Mayor Selection</button>'
      : '';
    panels.push(`
      <section class="panel">
        <h2>Awaiting Mayor Selection</h2>
        <p>The dying Mayor is selecting their successor...</p>
        ${skipButton}
      </section>
    `);
  }

  if (room.hunterShotPending && !room.awaitingHunterShot) {
    const skipButton = isHost
      ? '<button id="skip-hunter-shot" type="button">Skip Hunter Shot</button>'
      : '';
    panels.push(`
      <section class="panel">
        <h2>Awaiting Hunter's Shot</h2>
        <p>The Hunter is choosing their final target...</p>
        ${skipButton}
      </section>
    `);
  }

  return panels.join('');
}

export {
  renderLobbySection,
  renderRoleRevealSection,
  renderMayorSection,
  renderArmorSection,
  renderNightSection,
  renderDaySection,
  renderRoleRevealList,
  renderPendingActionsPanel
};
