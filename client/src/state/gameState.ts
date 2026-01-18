import { STORAGE_KEY } from '../config/constants';
import type { RoomView, StoredSession } from '@shared/types';

type GameState = {
  room: RoomView | null;
  roomCode: string;
  playerId: string;
  playerName: string;
  hunterPrompt: boolean;
  storedSession: StoredSession | null;
  roleVisible: boolean;
  pendingVote: string | null | undefined;
  updateConfigTimeoutId: number | null;
  readyButtonTimeoutId: number | null;
};

const state: GameState = {
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

function loadSession(): StoredSession | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as StoredSession | null;
  } catch {
    return null;
  }
}

function saveSession() {
  if (!state.playerId || !state.roomCode) return;
  const payload: StoredSession = { playerId: state.playerId, roomCode: state.roomCode, name: state.playerName };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function initializeState() {
  state.storedSession = loadSession();
}

export { state, loadSession, saveSession, clearSession, initializeState };
