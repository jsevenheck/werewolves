/**
 * Werewolves UI module - hub-compatible entry point.
 *
 * Exports:
 *   manifest      - game metadata (id, title, player limits)
 *   GameComponent - Vue component to render the game UI
 *
 * The GameComponent accepts these props for hub integration:
 *   playerId  - optional platform player id (from localStorage)
 *   sessionId - platform session id (used for socket room grouping)
 *   joinToken - auth token passed via Socket.IO handshake
 *   wsNamespace - Socket.IO namespace path (e.g. "/g/werewolves")
 *   apiBaseUrl  - optional base URL for REST endpoints
 *
 * Pinia is NOT installed here; the host app must install Pinia before
 * mounting GameComponent.
 */
import WerewolvesGameRoot from './App.vue';
import './assets/styles.css';

export const manifest = {
  id: 'werewolves',
  title: 'Werewolves',
  minPlayers: 5,
  maxPlayers: 20,
} as const;

export const GameComponent = WerewolvesGameRoot;

export type { WerewolvesGameConfig, HubIntegrationProps, GameComponentProps } from './types/config';
export type { RoomView, Player, Role } from '@shared/types';
export type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
