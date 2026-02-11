/**
 * Audio manifest for bundled narrator clips.
 *
 * This module imports all built-in narrator audio files so they can be bundled
 * with the web component. When the game is embedded in Game Hub, these bundled
 * URLs serve as fallbacks, eliminating the dependency on host-served `/audio/...` paths.
 *
 * Custom audio overrides (if provided via `assetsBasePath`) still take precedence.
 */

// Import all built-in narrator audio files
import armorUrl from './armor.mp3';
import dayUrl from './day.mp3';
import dayToNightUrl from './dayToNight.mp3';
import endedUrl from './ended.mp3';
import lobbyUrl from './lobby.mp3';
import mayorUrl from './mayor.mp3';
import nightUrl from './night.mp3';
import nightGuardUrl from './night_guard.mp3';
import nightHarlotUrl from './night_harlot.mp3';
import nightResolveUrl from './night_resolve.mp3';
import nightSeerUrl from './night_seer.mp3';
import nightTransitionUrl from './night_transition.mp3';
import nightWitchUrl from './night_witch.mp3';
import nightWolvesUrl from './night_wolves.mp3';
import nightToDayUrl from './nightToDay.mp3';
import postArmorUrl from './postArmor.mp3';
import postMayorUrl from './postMayor.mp3';
import postRevealUrl from './postReveal.mp3';
import roleRevealUrl from './roleReveal.mp3';

/**
 * Map of narration keys to bundled audio URLs.
 *
 * These URLs are generated at build time by Vite and will work in any context
 * (standalone or embedded) without requiring the host to serve static files.
 */
export const BUNDLED_AUDIO: Record<string, string> = {
  armor: armorUrl,
  day: dayUrl,
  dayToNight: dayToNightUrl,
  ended: endedUrl,
  lobby: lobbyUrl,
  mayor: mayorUrl,
  night: nightUrl,
  night_guard: nightGuardUrl,
  night_harlot: nightHarlotUrl,
  night_resolve: nightResolveUrl,
  night_seer: nightSeerUrl,
  night_transition: nightTransitionUrl,
  night_witch: nightWitchUrl,
  night_wolves: nightWolvesUrl,
  nightToDay: nightToDayUrl,
  postArmor: postArmorUrl,
  postMayor: postMayorUrl,
  postReveal: postRevealUrl,
  roleReveal: roleRevealUrl,
};

/**
 * Get the bundled audio URL for a narration key.
 *
 * @param key - The narration key (e.g., 'lobby', 'day', 'night_wolves')
 * @returns The bundled audio URL, or undefined if the key is not recognized
 */
export function getBundledAudioUrl(key: string): string | undefined {
  return BUNDLED_AUDIO[key];
}
