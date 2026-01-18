import { io, type Socket } from 'socket.io-client';
import { state, initializeState, saveSession, clearSession, loadSession } from './state/gameState';
import { renderLanding } from './renderers/landingRenderer';
import { renderHeader, renderPlayersPanel, renderLogsPanel } from './renderers/commonRenderers';
import {
  renderLobbySection,
  renderRoleRevealSection,
  renderArmorSection,
  renderNightSection,
  renderDaySection,
  renderRoleRevealList
} from './renderers/phaseRenderers';
import { bindCommonHandlers, updateHunterOverlay } from './handlers/commonHandlers';
import { bindLandingHandlers, enterRoom } from './handlers/landingHandlers';
import { bindPhaseHandlers } from './handlers/phaseHandlers';
import { notify } from './utils/helpers';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
import type { RoomView, StoredSession } from '@shared/types';
import './style.css';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
const appEl = document.getElementById('app');

if (!appEl) {
  throw new Error('Missing app root element');
}

initializeState();

if (state.storedSession) {
  attemptResume(state.storedSession);
} else {
  renderLandingPage();
}

socket.on('connect', () => {
  if (state.playerId && state.roomCode) {
    attemptResume({ roomCode: state.roomCode, playerId: state.playerId, name: state.playerName || '' });
  }
});

socket.on('roomUpdate', (room) => {
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
  if (room.phase === 'lobby') {
    state.roleVisible = false;
  }
  renderApp();
});

socket.on('hunterPrompt', () => {
  state.hunterPrompt = true;
  renderApp();
});

function renderLandingPage() {
  appEl.innerHTML = renderLanding();
  const saved = loadSession();
  const enterRoomWithSocket = (params: { name: string; code: string }) => {
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
  if (state.room.phase !== 'day') {
    state.pendingVote = undefined;
  }
  const sections = [
    renderHeader(),
    renderPhaseSection(state.room),
    renderPlayersPanel(),
    renderLogsPanel()
  ].filter(Boolean);
  appEl.innerHTML = sections.join('');
  bindCommonHandlers(renderApp, renderLandingPage, clearSession);
  bindPhaseHandlers(socket, renderApp);
  updateHunterOverlay(socket);
}

function renderPhaseSection(room: RoomView) {
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

  if (room.phaseTransition) {
    const transitionMessages: Record<string, string> = {
      postReveal: 'Preparing for next phase...',
      postArmor: 'Starting the first night...',
      nightToDay: 'Dawn is breaking. Day phase begins soon...',
      dayToNight: 'Night falls. Close your eyes...'
    };
    const message = transitionMessages[room.phaseTransition] || 'Next phase in a few seconds. Close your eyes if needed.';
    const hostSkipButtonHtml = self && self.isHost
      ? '<button id="host-skip-btn" type="button">Skip transition</button>'
      : '';
    return `
      <section class="panel">
        <h2>Transitioning...</h2>
        <p>${message}</p>
        ${hostSkipButtonHtml}
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

function attemptResume(saved: StoredSession) {
  socket.emit('resumePlayer', saved, (res) => {
    if (res && 'error' in res && res.error) {
      notify(res.error);
      clearSession();
      renderLandingPage();
    } else {
      state.playerId = saved.playerId;
      state.roomCode = saved.roomCode;
      state.playerName = saved.name;
      saveSession();
      socket.emit('requestState', { roomCode: saved.roomCode, playerId: saved.playerId });
    }
  });
}
