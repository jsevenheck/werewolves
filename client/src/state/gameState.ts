import { STORAGE_KEY } from '../config/constants';
import type { RoomView, StoredSession } from '@shared/types';

type GameState = {
  room: RoomView | null;
  roomCode: string;
  playerId: string;
  playerName: string;
  resumeToken: string;
  hunterPrompt: boolean;
  mayorPrompt: boolean;
  storedSession: StoredSession | null;
  roleVisible: boolean;
  pendingVote: string | null | undefined;
  pendingMayorVote: string | undefined;
  pendingWolfVote: string | undefined;
  updateConfigTimeoutId: number | null;
  readyButtonTimeoutId: number | null;
  newlyDeadIds: Set<string>;
  narratorToggled: boolean;
};

const state: GameState = {
  room: null,
  roomCode: '',
  playerId: '',
  playerName: '',
  resumeToken: '',
  hunterPrompt: false,
  mayorPrompt: false,
  storedSession: null,
  roleVisible: false,
  pendingVote: undefined,
  pendingMayorVote: undefined,
  pendingWolfVote: undefined,
  updateConfigTimeoutId: null,
  readyButtonTimeoutId: null,
  newlyDeadIds: new Set(),
  narratorToggled: false
};

function loadSession(): StoredSession | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as StoredSession | null;
  } catch {
    return null;
  }
}

function saveSession() {
  if (!state.playerId || !state.roomCode || !state.resumeToken) return;
  const payload: StoredSession = {
    playerId: state.playerId,
    roomCode: state.roomCode,
    name: state.playerName,
    resumeToken: state.resumeToken
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function initializeState() {
  state.storedSession = loadSession();
  state.resumeToken = state.storedSession?.resumeToken ?? '';
}

export { state, loadSession, saveSession, clearSession, initializeState };
