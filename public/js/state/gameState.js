import { STORAGE_KEY } from '../config/constants.js';

const state = {
  room: null,
  roomCode: '',
  playerId: '',
  playerName: '',
  hunterPrompt: false,
  storedSession: null,
  roleVisible: false,
  pendingVote: undefined,
  updateConfigTimeoutId: null,
  readyButtonTimeoutId: null
};

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveSession() {
  if (!state.playerId || !state.roomCode) return;
  const payload = { playerId: state.playerId, roomCode: state.roomCode, name: state.playerName };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function initializeState() {
  state.storedSession = loadSession();
}

export { state, loadSession, saveSession, clearSession, initializeState };
