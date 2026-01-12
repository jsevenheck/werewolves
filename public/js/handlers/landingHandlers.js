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
      enterRoom({ roomCode: payload.roomCode, playerId: payload.playerId, name }, socket);
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
      enterRoom({ roomCode: payload.roomCode, playerId: payload.playerId, name }, socket);
    });
  });
  
  document.getElementById('resume-btn')?.addEventListener('click', () => {
    if (saved) {
      attemptResume(saved);
    }
  });
}

function enterRoom({ roomCode, playerId, name }, socket) {
  if (!socket || typeof socket.emit !== 'function') {
    console.error('Invalid socket provided to enterRoom');
    return;
  }
  if (!state || typeof state !== 'object') {
    console.error('Invalid game state provided to enterRoom');
    return;
  }
  state.playerId = playerId;
  state.roomCode = roomCode;
  state.playerName = name;
  if (typeof saveSession === 'function') {
    saveSession();
  } else {
    console.error('saveSession is not a function in enterRoom');
  }
  socket.emit('requestState', { roomCode, playerId });
}

export { bindLandingHandlers, enterRoom };
