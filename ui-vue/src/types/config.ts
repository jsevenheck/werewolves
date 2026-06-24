/**
 * Configuration for the Werewolves game.
 *
 * These settings are provided via `app.provide('werewolvesConfig', { ... })`.
 */
export interface WerewolvesGameConfig {
  /**
   * Optional base path for custom audio overrides.
   * When provided, narrator tries custom audio first, then falls back to bundled.
   */
  assetsBasePath?: string;

  /**
   * Optional initial UI language. User choices stored in localStorage take precedence.
   */
  defaultLocale?: 'en' | 'de';
}
