/**
 * Pinia store for the global admin page.
 *
 * Kept COMPLETELY separate from `useGameStore`. Admin observers are NOT
 * players: they never enter a room's `players` list, never vote, never
 * receive `self`. Mixing admin state into the player store would either
 * couple them (bad: data leaks between views) or require a parallel set of
 * state inside one giant store (worse: harder to reason about).
 *
 * The store holds:
 *   - `token`: the admin token, persisted to localStorage under
 *     `werewolves_admin_token` so it survives reloads.
 *   - `rooms`: the most recent `RoomSummary[]` returned by
 *     `adminListRooms`.
 *   - `observingRoomCode`: the room code we're currently a live observer of.
 *   - `observerView`: the sanitized `RoomView` delivered by `roomUpdate`
 *     while observing. Server-side `buildAdminRoomView` already strips
 *     `self`, `role`, `mayorId`, `seerResult`, `witchState`, `wolfVotes`,
 *     `awaitingHunterShot`, `awaitingMayorSelection`, etc. — we just hold
 *     and render.
 *   - `selectedRoomCode`: the room the user has clicked into in the list
 *     view, for the drill-down "detail" screen.
 *
 * The store does NOT own the socket. The AdminPage SFC creates the socket via
 * `useAdminSocket` and bridges its events to the store actions below.
 */
import { defineStore } from 'pinia';
import type { RoomSummary, RoomView } from '@shared/types';

const TOKEN_STORAGE_KEY = 'werewolves_admin_token';

interface AdminState {
  token: string;
  connected: boolean;
  rooms: RoomSummary[];
  roomsLoading: boolean;
  roomsError: string | null;
  selectedRoomCode: string | null;
  observingRoomCode: string | null;
  observerView: RoomView | null;
}

function readStoredToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable in private mode; the in-memory token
    // still works for this session.
  }
}

export const useAdminStore = defineStore('werewolves-admin', {
  state: (): AdminState => ({
    token: readStoredToken(),
    connected: false,
    rooms: [],
    roomsLoading: false,
    roomsError: null,
    selectedRoomCode: null,
    observingRoomCode: null,
    observerView: null,
  }),

  getters: {
    hasToken(state): boolean {
      return Boolean(state.token);
    },
    isObserving(state): boolean {
      return Boolean(state.observingRoomCode);
    },
    observingRoom(state): RoomView | null {
      if (!state.observingRoomCode || !state.observerView) return null;
      if (state.observerView.code !== state.observingRoomCode) return null;
      return state.observerView;
    },
  },

  actions: {
    setToken(token: string) {
      this.token = token;
      writeStoredToken(token);
    },

    clearToken() {
      this.token = '';
      writeStoredToken('');
      this.rooms = [];
      this.selectedRoomCode = null;
      this.observingRoomCode = null;
      this.observerView = null;
    },

    setConnected(connected: boolean) {
      this.connected = connected;
    },

    setRooms(rooms: RoomSummary[]) {
      this.rooms = rooms;
      this.roomsError = null;
    },

    setRoomsLoading(loading: boolean) {
      this.roomsLoading = loading;
    },

    setRoomsError(message: string | null) {
      this.roomsError = message;
    },

    selectRoom(roomCode: string | null) {
      this.selectedRoomCode = roomCode;
    },

    beginObserving(roomCode: string, view: RoomView) {
      this.observingRoomCode = roomCode;
      this.observerView = view;
    },

    updateObserverView(view: RoomView) {
      if (this.observingRoomCode && view.code === this.observingRoomCode) {
        this.observerView = view;
      }
    },

    endObserving() {
      this.observingRoomCode = null;
      this.observerView = null;
    },

    removeRoomFromList(roomCode: string) {
      this.rooms = this.rooms.filter((room) => room.code !== roomCode);
      if (this.selectedRoomCode === roomCode) {
        this.selectedRoomCode = null;
      }
      if (this.observingRoomCode === roomCode) {
        this.observingRoomCode = null;
        this.observerView = null;
      }
    },

    /**
     * Convenience used by the e2e tests / dev tools: forcibly clear the
     * admin token from localStorage.
     */
    resetForTests() {
      this.clearToken();
    },
  },
});
