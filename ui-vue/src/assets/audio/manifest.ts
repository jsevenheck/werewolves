/**
 * Audio manifest for bundled narrator clips.
 *
 * This module imports all built-in narrator audio files so they can be bundled
 * with the app. These bundled URLs serve as fallbacks, eliminating the
 * dependency on host-served `/audio/...` paths.
 *
 * Files are organised by locale under `en/` and `de/`. Vite's `import.meta.glob`
 * picks up whatever files are present at build time, so a locale can be added
 * later by dropping MP3s into its folder without code changes.
 *
 * Custom audio overrides (if provided via `assetsBasePath`) still take precedence
 * and are locale-aware: the narrator first looks under
 * `${assetsBasePath}/${locale}/...` before falling back to the locale-agnostic
 * `${assetsBasePath}/...` paths.
 *
 * If a key is missing for the active locale (e.g. only some DE clips exist),
 * the narrator falls back to the English clip for that key.
 */

import type { SupportedLocale } from '../../i18n/types';

const EN_AUDIO_MODULES = import.meta.glob('./en/*.mp3', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const DE_AUDIO_MODULES = import.meta.glob('./de/*.mp3', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

function globToMap(modules: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(modules)) {
    // path looks like './en/armor.mp3' or './de/night_wolves.mp3'
    const fileName = path.split('/').pop();
    if (!fileName) continue;
    const key = fileName.replace(/\.mp3$/, '');
    out[key] = url;
  }
  return out;
}

/**
 * Map of narration keys to bundled audio URLs, per locale.
 */
const BUNDLED_AUDIO: Record<SupportedLocale, Record<string, string>> = {
  en: globToMap(EN_AUDIO_MODULES),
  de: globToMap(DE_AUDIO_MODULES),
};

/**
 * Get the bundled audio URL for a narration key, in a given locale.
 *
 * If the key is not present in the requested locale, the English clip is
 * returned (if it exists) so that a partial DE set still has audio.
 *
 * @param key - The narration key (e.g., 'lobby', 'day', 'night_wolves')
 * @param locale - The active UI locale ('en' | 'de')
 * @returns The bundled audio URL, or undefined if the key is unknown in
 *   both the active locale and the English fallback.
 */
export function getBundledAudioUrl(key: string, locale: SupportedLocale): string | undefined {
  return BUNDLED_AUDIO[locale]?.[key] ?? BUNDLED_AUDIO.en?.[key];
}

/**
 * For tests and tooling: the raw per-locale audio map.
 *
 * Exposed for introspection (e.g. to assert which keys are bundled for a
 * given locale). Do not use this at runtime to resolve a clip — call
 * `getBundledAudioUrl(key, locale)` instead so the English fallback applies.
 */
export const __BUNDLED_AUDIO__: Readonly<
  Record<SupportedLocale, Readonly<Record<string, string>>>
> = BUNDLED_AUDIO;
