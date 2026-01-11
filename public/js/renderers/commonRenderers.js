import { ROLE_DETAILS } from '../config/constants.js';
import { state } from '../state/gameState.js';
import { formatPhase } from '../utils/helpers.js';

function renderHeader() {
  if (!state.room) return '';
  
  const room = state.room;
  const self = room.self;
  const detail = self?.role ? ROLE_DETAILS[self.role] : null;
  const loverNote = room.loverName ? `<p>Lover: ${room.loverName}</p>` : '';
  
  const seerResult = room.seerResult;
  const seerNote = self?.role === 'seer' && seerResult
    ? `<p>Last vision: ${seerResult.name} is ${seerResult.result}.</p>`
    : '';
  
  const roleBlock = self?.role && state.roleVisible
    ? `<div class="role-card" style="border-color:${detail?.color || '#f8fafc'};color:${detail?.color || '#f8fafc'}">
        <strong>${detail?.name || self.role}</strong>
        <p>${detail?.description || ''}</p>
        ${loverNote}
        ${seerNote}
      </div>`
    : '';
  const roleToggle = self?.role
    ? `<button id="toggle-role" type="button">${state?.roleVisible ? 'Hide Role' : 'Reveal Role'}</button>`
    : '';
  return `
    <section class="panel">
      <div style="display:flex;flex-direction:column;gap:.5rem;">
        <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between;">
          <div>
            <h1>Room ${room.code}</h1>
            <p>Phase: ${formatPhase(room)}</p>
          </div>
          <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">
            <span class="tag">You: ${state?.playerName || 'Unknown'}</span>
            ${self?.alive ? '<span class="tag" style="border-color:#4ade80;color:#4ade80;">Alive</span>' : '<span class="tag" style="border-color:#ef4444;color:#ef4444;">Dead</span>'}
            ${roleToggle}
            <button id="leave-room" type="button">Leave Game</button>
          </div>
        </div>
        ${roleBlock}
      </div>
    </section>
  `;
}

function renderPlayersPanel() {
  if (!state.room) return '';
  
  const room = state.room;
  const players = Array.isArray(room.players) ? room.players : [];
  
  const cards = players.map((player) => `
    <div class="player-card ${player.alive ? '' : 'dead'}">
      <strong>${player.name}</strong>
      <div style="margin-top:.35rem;font-size:.9rem;display:flex;flex-wrap:wrap;gap:.35rem;">
        ${player.isHost ? '<span class="tag">Host</span>' : ''}
        ${!player.connected ? '<span class="tag" style="border-color:#fbbf24;color:#fbbf24;">Disconnected</span>' : ''}
        ${room.phase === 'ended' && player.role ? `<span class="tag" style="border-color:#38bdf8;color:#38bdf8;">${ROLE_DETAILS[player.role]?.name || player.role}</span>` : ''}
      </div>
    </div>
  `).join('');
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
  const logs = (room.logs || []).map((log) => `<div>${new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${log.text}</div>`).join('') || '';
  
  return `
    <section class="panel">
      <h2>Events</h2>
      <div class="logs">${logs || '<p>No events yet.</p>'}</div>
    </section>
  `;
}

export { renderHeader, renderPlayersPanel, renderLogsPanel };
