import { defineStore } from 'pinia';
import type { RoomView, StoredSession } from '@shared/types';

const STORAGE_KEY = 'werewolves.session';

interface GameState {
  room: RoomView | null;
  roomCode: string;
  playerId: string;
  playerName: string;
  resumeToken: string;
  hunterPrompt: boolean;
  mayorPrompt: boolean;
  roleRevealPrompt: boolean;
  roleVisible: boolean;
  storedSession: StoredSession | null;
  pendingVote: string | null | undefined;
  pendingMayorVote: string | undefined;
  pendingWolfVote: string | undefined;
  updateConfigTimeoutId: number | null;
  readyButtonTimeoutId: number | null;
}

export const useGameStore = defineStore('werewolves-game', {
  state: (): GameState => ({
    room: null,
    roomCode: '',
    playerId: '',
    playerName: '',
    resumeToken: '',
    hunterPrompt: false,
    mayorPrompt: false,
    roleRevealPrompt: false,
    roleVisible: false,
    storedSession: (() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as StoredSession | null;
      } catch {
        return null;
      }
    })(),
    pendingVote: undefined,
    pendingMayorVote: undefined,
    pendingWolfVote: undefined,
    updateConfigTimeoutId: null,
    readyButtonTimeoutId: null,
  }),

  getters: {
    self(state): RoomView['self'] {
      return state.room?.self || null;
    },
    isAlive(state): boolean {
      return state.room?.self?.alive ?? false;
    },
    isHost(state): boolean {
      return state.room?.hostId === state.playerId;
    },
    phase(state): string {
      return state.room?.phase || 'lobby';
    },
  },

  actions: {
    saveSession() {
      if (!this.playerId || !this.roomCode || !this.resumeToken) return;
      const payload: StoredSession = {
        playerId: this.playerId,
        roomCode: this.roomCode,
        name: this.playerName,
        resumeToken: this.resumeToken,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      this.storedSession = payload;
    },

    loadSession(): StoredSession | null {
      return this.storedSession;
    },

    clearSession() {
      localStorage.removeItem(STORAGE_KEY);
      this.storedSession = null;
    },

    resetState() {
      this.room = null;
      this.roomCode = '';
      this.playerId = '';
      this.playerName = '';
      this.resumeToken = '';
      this.hunterPrompt = false;
      this.mayorPrompt = false;
      this.roleRevealPrompt = false;
      this.pendingVote = undefined;
      this.pendingMayorVote = undefined;
      this.pendingWolfVote = undefined;
      this.roleVisible = false;
      if (this.updateConfigTimeoutId) {
        clearTimeout(this.updateConfigTimeoutId);
        this.updateConfigTimeoutId = null;
      }
      if (this.readyButtonTimeoutId) {
        clearTimeout(this.readyButtonTimeoutId);
        this.readyButtonTimeoutId = null;
      }
    },

    updateRoom(room: RoomView) {
      // Detect transition into roleReveal phase to trigger the popup
      const wasNotRoleReveal = this.room?.phase !== 'roleReveal';
      if (wasNotRoleReveal && room.phase === 'roleReveal') {
        this.roleRevealPrompt = true;
      }

      this.room = room;
      this.roomCode = room.code;
      if (!this.playerId && room.self) {
        this.playerId = room.self.id;
      }
      if (room.self?.id === this.playerId) {
        this.playerName = room.players.find((p) => p.id === room.self?.id)?.name || this.playerName;
        this.saveSession();
      }
      // Clear pending votes when server confirms
      if (room.voteState?.yourVote !== undefined && room.phase === 'day') {
        this.pendingVote = undefined;
      }
      if (room.voteState?.yourVote !== undefined && room.phase === 'mayor') {
        this.pendingMayorVote = undefined;
      }
      const currentWolfVote = this.playerId ? room.wolfVotes?.[this.playerId] : undefined;
      if (currentWolfVote !== undefined && currentWolfVote !== null) {
        this.pendingWolfVote = undefined;
      }
      if (room.phase === 'lobby') {
        this.roleVisible = false;
        this.roleRevealPrompt = false;
      }
      // Sync overlay prompts from room state
      this.hunterPrompt = !!room.awaitingHunterShot;
      this.mayorPrompt = !!room.awaitingMayorSelection;
      // Clear phase-specific state
      if (room.phase !== 'day') {
        this.pendingVote = undefined;
      }
      if (room.phase !== 'mayor') {
        this.pendingMayorVote = undefined;
      }
      if (room.phase !== 'night' || room.phaseStep !== 'wolves') {
        this.pendingWolfVote = undefined;
      }
    },

    setPlayer(id: string, name: string, token: string) {
      this.playerId = id;
      this.playerName = name;
      this.resumeToken = token;
      this.saveSession();
    },

    toggleRole() {
      this.roleVisible = !this.roleVisible;
    },
  },
});
