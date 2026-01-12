import { state, initializeState, saveSession, clearSession, loadSession } from './js/state/gameState.js';
import { renderLanding } from './js/renderers/landingRenderer.js';
import { renderHeader, renderPlayersPanel, renderLogsPanel } from './js/renderers/commonRenderers.js';
import { 
  renderLobbySection, 
  renderRoleRevealSection, 
  renderArmorSection, 
  renderNightSection, 
  renderDaySection,
  renderRoleRevealList 
} from './js/renderers/phaseRenderers.js';
import { bindCommonHandlers, updateHunterOverlay } from './js/handlers/commonHandlers.js';
import { bindLandingHandlers, enterRoom } from './js/handlers/landingHandlers.js';
import { bindPhaseHandlers } from './js/handlers/phaseHandlers.js';
import { notify } from './js/utils/helpers.js';

const socket = io();
const appEl = document.getElementById('app');

initializeState();

if (state.storedSession) {
  attemptResume(state.storedSession);
} else {
  renderLandingPage();
}

socket.on('connect', () => {
  if (state.playerId && state.roomCode) {
    attemptResume({ roomCode: state.roomCode, playerId: state.playerId, name: state.playerName });
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
  if (typeof renderLanding === 'function') {
    appEl.innerHTML = renderLanding();
  } else {
    notify('Unable to render landing page.', 'error');
    appEl.innerHTML = '';
  }
  const saved = loadSession();
  const enterRoomWithSocket = (params) => {
    if (typeof enterRoom === 'function') {
      return enterRoom(params, socket);
    }
    notify('Unable to enter room: action is unavailable.');
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
    renderPhaseSection(),
    renderPlayersPanel(),
    renderLogsPanel()
  ].filter(Boolean);
  appEl.innerHTML = sections.join('');
  if (typeof bindCommonHandlers === 'function') {
    bindCommonHandlers(renderApp, renderLandingPage, clearSession);
  }
  if (typeof bindPhaseHandlers === 'function') {
    bindPhaseHandlers(socket, renderApp);
  }
  if (typeof updateHunterOverlay === 'function') {
    updateHunterOverlay(socket);
  }
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
  
  if (room.phaseTransition) {
    const transitionMessages = {
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

function attemptResume(saved) {
  socket.emit('resumePlayer', saved, (res) => {
    if (res?.error) {
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
