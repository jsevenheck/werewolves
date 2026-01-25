import { ROLE_DETAILS } from '../config/constants';
import { state } from '../state/gameState';
import { escapeHtml, formatPhase } from '../utils/helpers';
import { narrator } from '../utils/narrator';

function renderHeader() {
  if (!state.room) return '';

  const room = state.room;
  const self = room.self;
  const detail = self?.role ? ROLE_DETAILS[self.role] : null;
  const loverNote = room.loverName ? `<p>Lover: ${escapeHtml(room.loverName)}</p>` : '';
  const hostPlayer = room.players.find((player) => player.id === room.hostId);
  const hostLabel = hostPlayer
    ? `<span class="tag">Host: ${escapeHtml(hostPlayer.name)}${hostPlayer.connected ? '' : ' (offline)'}</span>`
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
            ${hostLabel}
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

  const cards = players.map((player) => {
    if (!player) return '';

    const roleKey = player.role;
    const roleDetail = roleKey ? ROLE_DETAILS[roleKey] : undefined;
    const roleLabel = roleDetail?.name || (roleKey || '');
    const isMayor = room.mayorId === player.id;

    return `
    <div class="player-card ${player.alive ? '' : 'dead'}">
      <strong>${escapeHtml(player.name)}</strong>
      <div style="margin-top:.35rem;font-size:.9rem;display:flex;flex-wrap:wrap;gap:.35rem;">
        ${player.isHost ? '<span class="tag">Host</span>' : ''}
        ${isMayor ? '<span class="tag" style="border-color:#fbbf24;color:#fbbf24;">Mayor</span>' : ''}
        ${!player.connected ? '<span class="tag" style="border-color:#fbbf24;color:#fbbf24;">Disconnected</span>' : ''}
        ${(!player.alive || room.phase === 'ended') && roleKey ? `<span class="tag" style="border-color:#38bdf8;color:#38bdf8;">${roleLabel}</span>` : ''}
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

function renderLogsPanel() {
  if (!state.room) return '';

  const room = state.room;
  const logs = (room.logs || [])
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
