/**
 * Configuration for the Werewolves game.
 *
 * These settings are provided via `app.provide('werewolvesConfig', { ... })`.
 */
export interface WerewolvesGameConfig {
  /**
   * Socket.IO namespace path (e.g. '/g/werewolves').
   */
  wsNamespace?: string;

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
   * When provided, narrator tries custom audio first, then falls back to bundled.
   */
  assetsBasePath?: string;
}
