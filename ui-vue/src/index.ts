/**
 * Werewolves UI module – hub-compatible entry point.
 *
 * Exports:
 *   manifest       – game metadata (id, title, player limits)
 *   GameComponent  – Vue component to render the game UI
 *
 * The GameComponent accepts these props for hub integration:
 *   sessionId   – identifies the game session / room
 *   joinToken   – auth token passed via Socket.IO handshake
 *   wsNamespace – Socket.IO namespace path (e.g. "/g/werewolf")
 *   apiBaseUrl  – optional base URL for REST endpoints
 *
 * Pinia is NOT installed here; the host app must install Pinia before
 * mounting GameComponent.
 */
import WerewolvesGameRoot from './App.vue';
import './assets/styles.css';

// ── Game manifest ──────────────────────────────────────────────────
export const manifest = {
  id: 'werewolf',
  title: 'Werewolves',
  minPlayers: 5,
  maxPlayers: 20,
} as const;

// ── Primary Vue component ──────────────────────────────────────────
export const GameComponent = WerewolvesGameRoot;

// ── Legacy plugin installer (standalone / backward-compat) ─────────
// NOTE: When used inside the game-hub, do NOT call this function.
// The hub installs Pinia globally; calling this would create a second
// Pinia instance and cause state isolation issues.
export { installWerewolvesGame } from './install';

// ── Re-exported types ──────────────────────────────────────────────
export type {
  WerewolvesGameConfig,
  HubIntegrationProps,
  GameComponentProps,
} from './types/config';
export type { RoomView, Player, Role } from '@shared/types';
export type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
