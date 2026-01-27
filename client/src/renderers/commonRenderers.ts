import { ROLE_DETAILS, PASSIVE_ROLE_DETAILS } from '../config/constants';
import { state } from '../state/gameState';
import { escapeHtml, formatPhase } from '../utils/helpers';
import { narrator } from '../utils/narrator';

function renderHeader() {
  if (!state.room) return '';

  const room = state.room;
  const self = room.self;
  const detail = self?.role ? ROLE_DETAILS[self.role] : null;
  const loverNote = room.loverName ? `<p>Lover: ${escapeHtml(room.loverName)}</p>` : '';
  const passiveRoles: string[] = [];
  if (room.mayorId && self?.id === room.mayorId) {
    passiveRoles.push(PASSIVE_ROLE_DETAILS.mayor?.name || 'Mayor');
  }
  const passiveRoleTags = passiveRoles.length
    ? passiveRoles
        .map((role) => `<span class="tag" style="border-color:#fbbf24;color:#fbbf24;">${escapeHtml(role)}</span>`)
        .join('')
    : '';
  const passiveRoleNote = passiveRoles.length
    ? `<p class="passive-role-note">Passive role${passiveRoles.length > 1 ? 's' : ''}: ${passiveRoles.map((role) => escapeHtml(role)).join(', ')}</p>`
    : '';

  const seerResult = room.seerResult;
  const seerNote = self?.role === 'seer' && seerResult
    ? `<p>Last vision: ${escapeHtml(seerResult.name)} is ${seerResult.result}.</p>`
    : '';

  const roleBlock = self?.role && state.roleVisible
    ? `<div class="role-card" style="border-color:${detail?.color || '#f8fafc'};color:${detail?.color || '#f8fafc'}">
        <strong>${escapeHtml(detail?.name || self.role)}</strong>
        <p>${escapeHtml(detail?.description || '')}</p>
        ${loverNote}
        ${seerNote}
        ${passiveRoleNote}
      </div>`
    : '';
  const roleToggle = self?.role
    ? `<button id="toggle-role" type="button">${state.roleVisible ? 'Hide Role' : 'Reveal Role'}</button>`
    : '';
  const narratorLabel = narrator.isEnabled()
    ? (narrator.isUnlocked() ? 'On' : 'Tap to enable audio')
    : 'Off';
  const narratorToggle = `<button id="toggle-narrator" type="button">Narrator: ${narratorLabel}</button>`;
  return `
    <section class="panel">
      <div style="display:flex;flex-direction:column;gap:.5rem;">
          <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between;">
          <div>
            <h1>Room ${escapeHtml(room.code)}</h1>
            <p>Phase: ${formatPhase(room)}</p>
          </div>
          <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">
            <span class="tag">You: ${escapeHtml(state.playerName || 'Unknown')}</span>
            ${passiveRoleTags}
            ${self?.alive ? '<span class="tag" style="border-color:#4ade80;color:#4ade80;">Alive</span>' : '<span class="tag" style="border-color:#ef4444;color:#ef4444;">Dead</span>'}
            ${roleToggle}
            ${narratorToggle}
            <button id="leave-room" type="button">Leave Game</button>
          </div>
        </div>
        ${roleBlock}
      </div>
    </section>
  `;
}

function renderPlayersPanel() {
  const room = state.room;
  if (!room) return '';

  const players = Array.isArray(room.players) ? room.players : [];
  const hideDeathsDuringTransition =
    room.phaseTransition === 'nightToDay' ||
    (room.phase === 'night' && room.phaseStep === 'resolve');
  const newlyDeadIds = state.newlyDeadIds instanceof Set ? state.newlyDeadIds : new Set<string>();

  const cards = players.map((player) => {
    if (!player) return '';

    const roleKey = player.role;
    const roleDetail = roleKey ? ROLE_DETAILS[roleKey] : undefined;
    const roleLabel = roleDetail?.name || (roleKey || '');
    const isMayor = room.mayorId === player.id;
    const isNewlyDead = newlyDeadIds.has(player.id);
    const hideNewDeath = hideDeathsDuringTransition && isNewlyDead;
    const showDeadStyling = !hideNewDeath && !player.alive;
    const showRoleTag = (room.phase === 'ended' || (!hideNewDeath && !player.alive)) && roleKey;

    return `
    <div class="player-card ${showDeadStyling ? 'dead' : ''}">
      <strong>${escapeHtml(player.name)}</strong>
      <div style="margin-top:.35rem;font-size:.9rem;display:flex;flex-wrap:wrap;gap:.35rem;">
        ${player.isHost ? '<span class="tag">Host</span>' : ''}
        ${isMayor ? '<span class="tag" style="border-color:#fbbf24;color:#fbbf24;">Mayor</span>' : ''}
        ${!player.connected ? '<span class="tag" style="border-color:#fbbf24;color:#fbbf24;">Disconnected</span>' : ''}
        ${showRoleTag ? `<span class="tag" style="border-color:#38bdf8;color:#38bdf8;">${roleLabel}</span>` : ''}
      </div>
    </div>
  `;
  }).join('');
  return `
    <section class="panel">
      <h2>Players (${players.length})</h2>
      <div class="players-list">${cards}</div>
    </section>
  `;
}

function isDeathLogForName(logText: string, name: string) {
  return logText.startsWith(`${name} died`) || logText.startsWith(`${name} was voted out`);
}

function renderLogsPanel() {
  if (!state.room) return '';

  const room = state.room;
  const hideNewDeaths =
    room.phaseTransition === 'nightToDay' ||
    (room.phase === 'night' && room.phaseStep === 'resolve');
  const newlyDeadIds = state.newlyDeadIds instanceof Set ? state.newlyDeadIds : new Set<string>();
  const newlyDeadNames = hideNewDeaths
    ? room.players.filter((player) => newlyDeadIds.has(player.id)).map((player) => player.name)
    : [];
  const logs = (room.logs || [])
    .filter((log) => {
      if (!hideNewDeaths || !newlyDeadNames.length) return true;
      return !newlyDeadNames.some((name) => isDeathLogForName(log.text, name));
    })
    .map((log) => `<div>${new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${escapeHtml(log.text)}</div>`)
    .join('') || '';

  return `
    <section class="panel" id="logs-panel">
      <h2>Events</h2>
      <div class="logs">${logs || '<p>No events yet.</p>'}</div>
    </section>
  `;
}

export { renderHeader, renderPlayersPanel, renderLogsPanel };
