import { io, type Socket } from 'socket.io-client';
import { state, initializeState, saveSession, clearSession, loadSession } from './state/gameState';
import { renderLanding } from './renderers/landingRenderer';
import { renderHeader, renderPlayersPanel, renderLogsPanel } from './renderers/commonRenderers';
import {
  renderLobbySection,
  renderRoleRevealSection,
  renderMayorSection,
  renderArmorSection,
  renderNightSection,
  renderDaySection,
  renderRoleRevealList
} from './renderers/phaseRenderers';
import { bindCommonHandlers, updateHunterOverlay, updateMayorOverlay } from './handlers/commonHandlers';
import { bindLandingHandlers, enterRoom } from './handlers/landingHandlers';
import { bindPhaseHandlers } from './handlers/phaseHandlers';
import { escapeHtml, notify } from './utils/helpers';
import { ROLE_DETAILS } from './config/constants';
import { narrator } from './utils/narrator';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
import type { RoomView, StoredSession } from '@shared/types';
import {
  PHASE_DELAY_MS,
  POST_REVEAL_DELAY_MS,
  POST_MAYOR_DELAY_MS,
  POST_ARMOR_DELAY_MS
} from '@shared/constants';
import type { EnterRoomParams } from './handlers/landingHandlers';
import './style.css';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
const appElCandidate = document.getElementById('app');

if (!appElCandidate) {
  throw new Error('Missing app root element');
}
const appEl = appElCandidate;

initializeState();
narrator.initFromStorage();

let previousRoom: RoomView | null = null;

if (state.storedSession) {
  attemptResume(state.storedSession);
} else {
  renderLandingPage();
}

socket.on('connect', () => {
  if (state.playerId && state.roomCode && state.resumeToken) {
    attemptResume({
      roomCode: state.roomCode,
      playerId: state.playerId,
      name: state.playerName || '',
      resumeToken: state.resumeToken
    });
  }
});

socket.on('roomUpdate', (room) => {
  narrator.handleRoomUpdate(previousRoom, room);
  previousRoom = room;
  state.room = room;
  state.roomCode = room.code;
  if (!state.playerId && room.self) {
    state.playerId = room.self.id;
  }
  if (room.self?.id === state.playerId) {
    state.playerName = room.players.find((p) => p.id === room.self?.id)?.name || state.playerName;
    saveSession();
  }
  if (room.voteState?.yourVote !== undefined) {
    state.pendingVote = undefined;
  }
  const currentWolfVote = state.playerId ? room.wolfVotes?.[state.playerId] : undefined;
  if (currentWolfVote !== undefined && currentWolfVote !== '') {
    state.pendingWolfVote = undefined;
  }
  if (room.phase === 'lobby') {
    state.roleVisible = false;
  }
  if (shouldDeferRoomRender(room)) {
    return;
  }
  renderApp();
});

socket.on('hunterPrompt', () => {
  state.hunterPrompt = true;
  renderApp();
});

socket.on('mayorPrompt', () => {
  state.mayorPrompt = true;
  renderApp();
});

socket.on('wolfVoteRejected', (payload) => {
  if (payload.reason === 'already_voted') {
    notify('You already voted.');
  }
});
function renderLandingPage() {
  appEl.innerHTML = renderLanding();
  const saved = loadSession();
  const enterRoomWithSocket = (params: EnterRoomParams) => {
    return enterRoom(params, socket);
  };
  bindLandingHandlers(
    socket,
    renderLandingPage,
    enterRoomWithSocket,
    attemptResume,
    saved
  );
}

function renderApp() {
  if (!state.room) {
    renderLandingPage();
    return;
  }
  state.hunterPrompt = !!state.room.awaitingHunterShot;
  state.mayorPrompt = !!state.room.awaitingMayorSelection;
  if (state.room.phase !== 'day') {
    state.pendingVote = undefined;
  }
  if (state.room.phase !== 'night' || state.room.phaseStep !== 'wolves') {
    state.pendingWolfVote = undefined;
  }
  const sections = [
    renderHeader(),
    renderPhaseSection(state.room),
    renderPlayersPanel(),
    renderLogsPanel()
  ].filter(Boolean);
  appEl.innerHTML = sections.join('');
  bindCommonHandlers(socket, renderApp, renderLandingPage, clearSession);
  bindPhaseHandlers(socket, renderApp);
  updateHunterOverlay(socket);
  updateMayorOverlay(socket);
}

function shouldDeferRoomRender(room: RoomView) {
  const active = document.activeElement;
  if (!(active instanceof HTMLSelectElement)) {
    return false;
  }

  if (room.phase === 'day') {
    const isVoteSelect = !!active.closest('#vote-form');
    return isVoteSelect && room.voteState?.yourVote === undefined;
  }

  if (room.phase === 'night' && room.phaseStep === 'wolves') {
    const isWolfSelect = !!active.closest('#wolf-form');
    if (!isWolfSelect || !state.playerId) {
      return false;
    }
    const currentVote = room.wolfVotes?.[state.playerId];
    const locked = currentVote !== undefined && currentVote !== '';
    return !locked;
  }

  return false;
}

function renderPhaseSection(room: RoomView) {
  const self = room.self;

  if (room.winner) {
    return `
      <section class="panel">
        <h2>Game Over</h2>
        <p>${escapeHtml(room.winner.reason)}</p>
        <p><strong>Winner:</strong> ${escapeHtml(room.winner.team.toUpperCase())}</p>
        ${room.hostId === self?.id ? '<button id="restart-btn" type="button">Return to lobby</button>' : ''}
        ${renderRoleRevealList(room)}
      </section>
    `;
  }

  if (room.phaseTransition) {
    const transitionMessages: Record<string, string> = {
      postReveal: 'The village falls asleep.',
      postArmor: 'Starting the first night...',
      nightToDay: 'Dawn is breaking. Day phase begins soon...',
      dayToNight: 'Night falls. Close your eyes...'
    };
    const transitionDurations: Record<string, number> = {
      postReveal: POST_REVEAL_DELAY_MS,
      postArmor: POST_ARMOR_DELAY_MS,
      nightToDay: PHASE_DELAY_MS,
      dayToNight: PHASE_DELAY_MS
    };
    const message = transitionMessages[room.phaseTransition] || 'Next phase in a few seconds. Close your eyes if needed.';
    const durationMs = transitionDurations[room.phaseTransition] ?? PHASE_DELAY_MS;
    const durationSeconds = Math.round(durationMs / 1000);
    const durationNote = `<p>Duration: ${durationSeconds}s.</p>`;
    const roleDetails = ROLE_DETAILS || {};
    const dayResults = room.phaseTransition === 'dayToNight'
      ? (() => {
          if (room.lastDayDeaths.length) {
            const items = room.lastDayDeaths
              .map((entry) => `<li>${escapeHtml(entry.name)} (${roleDetails[entry.role || 'villager']?.name || entry.role || 'Unknown'})</li>`)
              .join('');
            return `<h3>Vote Results</h3><ul>${items}</ul>`;
          }
          return `<h3>Vote Results</h3><p>${escapeHtml(room.lastDayMessage || 'No one was eliminated.')}</p>`;
        })()
      : '';
    const hostSkipLabel = room.phaseTransition === 'dayToNight' ? 'Start next round' : 'Skip transition';
    const hostSkipButtonHtml = room.hostId === self?.id
      ? `<button id="host-skip-btn" type="button">${hostSkipLabel}</button>`
      : '';
    return `
      <section class="panel">
        <h2>Transitioning...</h2>
        <p>${message}</p>
        ${durationNote}
        ${dayResults}
        ${hostSkipButtonHtml}
      </section>
    `;
  }

  switch (room.phase) {
    case 'lobby':
      return renderLobbySection(room);
    case 'roleReveal':
      return renderRoleRevealSection(room);
    case 'mayor':
      return renderMayorSection(room);
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

function attemptResume(saved: StoredSession) {
  if (!saved.resumeToken) {
    notify('Saved session expired. Please rejoin the room.');
    clearSession();
    renderLandingPage();
    return;
  }
  socket.emit('resumePlayer', saved, (res) => {
    if (res && 'error' in res && res.error) {
      notify(res.error);
      clearSession();
      renderLandingPage();
    } else {
      state.playerId = saved.playerId;
      state.roomCode = saved.roomCode;
      state.playerName = saved.name;
      state.resumeToken = saved.resumeToken;
      saveSession();
      socket.emit('requestState', { roomCode: saved.roomCode, playerId: saved.playerId });
    }
  });
}
