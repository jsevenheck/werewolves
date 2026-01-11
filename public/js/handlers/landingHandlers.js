import { state, saveSession } from '../state/gameState.js';
import { pushNotification } from '../utils/helpers.js';

function bindLandingHandlers(socket, renderLanding, enterRoom, attemptResume, saved) {
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

function enterRoom({ roomCode, playerId, name }, socket) {
  if (!state) {
    // Fail gracefully if the application state has not been initialized.
    if (typeof pushNotification === 'function') {
      pushNotification('Unable to enter room: application state is not initialized.');
    }
    return;
  }
  state.playerId = playerId;
  state.roomCode = roomCode;
  state.playerName = name;
  saveSession();
  socket.emit('requestState', { roomCode, playerId });
}

export { bindLandingHandlers, enterRoom };
