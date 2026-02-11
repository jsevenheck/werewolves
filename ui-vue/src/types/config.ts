/**
 * Configuration for the Werewolves game component.
 *
 * These props are injected via app.provide() or passed directly to GameComponent.
 */
export interface WerewolvesGameConfig {
  /**
   * Base URL for Socket.IO connection.
   * Leave empty to use same origin.
   */
  socketUrl?: string;

  /**
   * Socket.IO path (default: '/socket.io').
   */
  socketPath?: string;

  /**
   * Optional base path for custom audio overrides.
   * When omitted, uses bundled audio (recommended for embedded mode).
   * When provided, narrator tries custom audio first, then falls back to bundled.
   */
  assetsBasePath?: string;

  /**
   * Whether running in standalone mode (shows room create/join flows
   * and standalone styling). Embedded hosts should pass false.
   * @default true
   */
  standalone?: boolean;
}

/**
 * Props for hub integration.
 *
 * When embedded in game-hub, these props are passed by the platform.
 */
export interface HubIntegrationProps {
  /**
   * Stable platform player id (optional).
   * Game Hub stores it in localStorage as `game-hub:player-id`.
   */
  playerId?: string;
  /**
   * Display name shown inside the game.
   * Falls back to playerId when not provided.
   */
  playerName?: string;
  /**
   * Session ID from the platform (party:gameStarted).
   * Used for Socket.IO room grouping; the game still uses room codes.
   */
  sessionId?: string;

  /**
   * Opaque token for player authentication.
   * Sent via Socket.IO handshake auth (party:gameStarted) as `joinToken`
   * and duplicated as `token` for backward compatibility.
   */
  joinToken?: string;

  /**
   * Socket.IO namespace path (e.g. '/g/werewolves').
   */
  wsNamespace?: string;

  /**
   * Base URL for REST API calls (if any).
   */
  apiBaseUrl?: string;
}

/**
 * Combined props for GameComponent.
 */
export type GameComponentProps = WerewolvesGameConfig & HubIntegrationProps;
