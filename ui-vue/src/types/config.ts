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
   * Base path for audio assets (default: '/audio').
   */
  assetsBasePath?: string;

  /**
   * Whether running in standalone mode (creates room/join flows).
   * In embedded mode (false), sessionId is used as room key.
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
   * Session ID from the platform.
   * Used as room key in embedded mode.
   */
  sessionId?: string;

  /**
   * JWT or opaque token for player authentication.
   * Sent via Socket.IO handshake auth.
   */
  joinToken?: string;

  /**
   * Socket.IO namespace path (e.g. '/g/werewolf').
   * When provided, standalone mode is automatically disabled.
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
