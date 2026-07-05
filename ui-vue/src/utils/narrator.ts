import { Howl } from 'howler';
import type { RoomView } from '@shared/types';
import { getBundledAudioUrl } from '../assets/audio/manifest';
import type { SupportedLocale } from '../i18n/types';

type NarrationKey = string | null;
type NarratorNotification = 'audioBlocked';

type NarratorOptions = {
  /**
   * Optional base path for custom audio overrides.
   * If provided, narrator will first try to load custom audio from:
   * - ${assetsBasePath}/${locale}/custom/${key}.mp3 (locale-aware, with variants)
   * - ${assetsBasePath}/${locale}/${key}.mp3 (locale-aware fallback)
   * - ${assetsBasePath}/custom/${key}.mp3 (with variants, locale-agnostic)
   * - ${assetsBasePath}/${key}.mp3 (locale-agnostic fallback)
   *
   * If not provided or if custom audio fails to load, narrator will use bundled audio.
   * The bundled audio itself is locale-aware: the narrator will try the active
   * locale first and then fall back to English.
   */
  assetsBasePath?: string;
  /**
   * Returns the active UI locale. The narrator uses this to pick the right
   * bundled clip and to look under the locale-specific override folders.
   * Defaults to a constant `'en'` so non-i18n callers (tests) get predictable
   * behaviour.
   */
  getLocale?: () => SupportedLocale;
  storage?: Storage | null;
  initialEnabled?: boolean;
  initialUnlocked?: boolean;
  playClip?: (key: string) => void;
  notify?: (message: NarratorNotification) => void;
  playDebounceMs?: number;
};

const STORAGE_KEY = 'werewolves_narrator_enabled';
const DEFAULT_VOLUME = 1;
const FALLBACK_AUDIO_URL =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';
const USER_MESSAGE_COOLDOWN_MS = 4000;

function toBaseAudioKey(audioKey: string): string {
  return audioKey.replace(/_\d+$/, '');
}

function computeNarrationKey(room: RoomView): NarrationKey {
  if (room.phaseTransition) {
    // The postReveal transition leads to the Mayor election when the Mayor is
    // enabled, not to night. Suppress the "village falls asleep" clip for the
    // initial Mayor election; the Mayor clip plays once the mayor phase begins.
    if (room.phaseTransition === 'postReveal' && room.passiveRoleConfig?.mayor) {
      return null;
    }
    return room.phaseTransition;
  }
  if (room.phase === 'night' && room.phaseStep) {
    return `night_${room.phaseStep}`;
  }
  return room.phase;
}

class Narrator {
  private enabled = false;
  private unlocked = false;
  private lastAnnouncedKey: NarrationKey = null;
  private latestKey: NarrationKey = null;
  private pendingKey: NarrationKey = null;
  private currentHowl: Howl | null = null;
  private readonly howls = new Map<string, Howl>();
  private readonly howlPromises = new Map<string, Promise<Howl>>();
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private disableToken = 0;
  private lastPlayAttemptAt = 0;
  private lastUserMessageAt = 0;
  private readonly assetsBasePath: string | undefined;
  private readonly storage: Storage | null;
  private readonly playClip: (key: string) => void;
  private readonly notify: (message: NarratorNotification) => void;
  private readonly playDebounceMs: number;
  private readonly getLocale: () => SupportedLocale;
  private readonly variants = new Map<string, number>([
    ['day', -1],
    ['night', -1],
    ['night_wolves', -1],
    ['night_seer', -1],
    ['night_witch', -1],
    ['night_guard', -1],
    ['night_harlot', -1],
    ['night_transition', -1],
    ['night_resolve', -1],
    ['nightToDay', -1],
    ['dayToNight', -1],
    ['lobby', -1],
    ['roleReveal', -1],
    ['postReveal', -1],
    ['mayor', -1],
    ['postMayor', -1],
    ['armor', -1],
    ['postArmor', -1],
    ['ended', -1],
  ]);
  private readonly discoveredVariants = new Map<string, string[]>();

  constructor(options: NarratorOptions = {}) {
    this.assetsBasePath = options.assetsBasePath;
    this.storage = options.storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    this.enabled = options.initialEnabled ?? false;
    this.unlocked = options.initialUnlocked ?? false;
    this.playClip = options.playClip ?? ((key) => void this.playWithHowler(key));
    this.notify = options.notify ?? (() => {});
    this.playDebounceMs = options.playDebounceMs ?? 800;
    this.getLocale = options.getLocale ?? (() => 'en');
  }

  initFromStorage() {
    if (!this.storage) return;
    const raw = this.storage.getItem(STORAGE_KEY);
    this.enabled = raw === 'true';
  }

  isEnabled() {
    return this.enabled;
  }

  isUnlocked() {
    return this.unlocked;
  }

  setEnabled(next: boolean) {
    const wasEnabled = this.enabled;
    this.enabled = next;
    if (this.storage) {
      this.storage.setItem(STORAGE_KEY, String(next));
    }
    if (!next) {
      this.lastAnnouncedKey = null;
      this.pendingKey = null;
      if (this.pendingTimer) {
        clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
      }
      this.disableToken += 1;
      this.stop();
      for (const howl of this.howls.values()) {
        howl.unload();
      }
      this.howls.clear();
      this.howlPromises.clear();
      this.currentHowl = null;
      return;
    }
    if (!wasEnabled) {
      this.lastAnnouncedKey = null;
      this.announceLatest();
    }
  }

  async unlock(): Promise<boolean> {
    if (this.unlocked) return true;
    // Use the native HTMLAudioElement directly rather than a Howl for the unlock
    // gesture. Howler queues play() internally until audio has loaded, so the
    // actual audio.play() call happens in an async callback outside the user-
    // gesture window — Chrome's autoplay policy then blocks it. With a raw
    // Audio element and a data: URL (no network I/O), play() can be called
    // synchronously from the click handler while still within gesture context.
    return new Promise<boolean>((resolve) => {
      const audio = new Audio(FALLBACK_AUDIO_URL);
      audio.volume = 0;

      // play() called synchronously — still within the user gesture context.
      const playPromise = audio.play();
      if (!playPromise) {
        // Legacy browsers without Promise-based play().
        this.unlocked = true;
        resolve(true);
        return;
      }

      playPromise
        .then(() => {
          audio.pause();
          this.unlocked = true;
          resolve(true);
        })
        .catch(() => {
          resolve(false);
        });
    });
  }

  handleRoomUpdate(_prevRoom: RoomView | null, nextRoom: RoomView) {
    const nextKey = computeNarrationKey(nextRoom);
    if (!nextKey) return;
    this.latestKey = nextKey;
    if (nextKey === this.lastAnnouncedKey) return;
    if (!this.enabled) return;
    if (!this.unlocked) {
      this.pendingKey = nextKey;
      return;
    }
    this.requestPlay(nextKey);
  }

  announceLatest() {
    if (!this.enabled) return;
    const key = this.pendingKey ?? this.latestKey;
    if (!key) return;
    if (!this.unlocked) {
      this.pendingKey = key;
      return;
    }
    if (key === this.lastAnnouncedKey) return;
    this.requestPlay(key);
  }

  private stop() {
    if (this.currentHowl) {
      this.currentHowl.stop();
      this.currentHowl = null;
    }
  }

  /**
   * Drop all cached Howl instances and discovered variant lists so the next
   * `playWithHowler` call re-resolves URLs from the (possibly changed) locale.
   *
   * The currently-playing clip is left to finish — language change happens
   * on the next announcement, not by yanking audio out from under the user.
   */
  invalidateCache() {
    for (const howl of this.howls.values()) {
      howl.unload();
    }
    this.howls.clear();
    this.howlPromises.clear();
    this.discoveredVariants.clear();
  }

  private async resolveAudioPath(audioKey: string): Promise<string | undefined> {
    const baseAudioKey = toBaseAudioKey(audioKey);
    const locale = this.getLocale();

    // Locale-aware candidate builders. We probe each location in this order:
    //  1. ${assetsBasePath}/${locale}/custom/${key}.mp3   (locale custom override)
    //  2. ${assetsBasePath}/${locale}/${key}.mp3          (locale default override)
    //  3. ${assetsBasePath}/custom/${key}.mp3             (locale-agnostic custom)
    //  4. ${assetsBasePath}/${key}.mp3                    (locale-agnostic default)
    //  5. bundled(key, locale)                            (bundled, active locale)
    //  6. bundled(key, 'en')                              (bundled English fallback)
    //
    // For variant keys (e.g. day_1) we also try the base key (day) as a
    // fallback at each step.
    const customCandidates = (localePrefix: string | null) => {
      if (localePrefix) {
        return [audioKey, baseAudioKey].map(
          (k) => `${this.assetsBasePath}/${localePrefix}/custom/${k}.mp3`
        );
      }
      return [audioKey, baseAudioKey].map((k) => `${this.assetsBasePath}/custom/${k}.mp3`);
    };
    const defaultCandidates = (localePrefix: string | null) => {
      if (localePrefix) {
        return [audioKey, baseAudioKey].map(
          (k) => `${this.assetsBasePath}/${localePrefix}/${k}.mp3`
        );
      }
      return [audioKey, baseAudioKey].map((k) => `${this.assetsBasePath}/${k}.mp3`);
    };
    const allOverrideCandidates: string[] = [
      ...customCandidates(locale),
      ...defaultCandidates(locale),
      ...customCandidates(null),
      ...defaultCandidates(null),
    ];

    if (this.assetsBasePath) {
      for (const path of allOverrideCandidates) {
        try {
          const response = await fetch(path, { method: 'HEAD' });
          const contentType = response.headers.get('content-type') || '';
          // Accept audio/* or application/octet-stream; reject HTML (SPA fallback)
          if (response.ok && !contentType.startsWith('text/html')) {
            return path;
          }
        } catch {
          // Path doesn't exist or network error — try next candidate
        }
      }
    }

    // Bundled audio: try the active locale first, then fall back to English.
    const bundledCandidates = baseAudioKey === audioKey ? [audioKey] : [audioKey, baseAudioKey];
    for (const key of bundledCandidates) {
      const bundled = getBundledAudioUrl(key, locale);
      if (bundled) return bundled;
    }
    for (const key of bundledCandidates) {
      const bundled = getBundledAudioUrl(key, 'en');
      if (bundled) return bundled;
    }

    return undefined;
  }

  private async discoverVariants(key: string, maxVariants = 10): Promise<string[]> {
    const variants: string[] = [];

    // Only discover variants if assetsBasePath is provided (for custom audio overrides)
    // Bundled audio does not support variants - only the base key
    if (!this.assetsBasePath) {
      return variants;
    }

    const locale = this.getLocale();
    // Search the locale-specific custom folder first, then the locale-agnostic
    // custom folder. Variants are numbered sequentially so the first folder
    // that returns 404-style responses is where we stop.
    const folders = [`${this.assetsBasePath}/${locale}/custom`, `${this.assetsBasePath}/custom`];

    for (const folder of folders) {
      let stopped = false;
      for (let i = 1; i <= maxVariants; i++) {
        const variantKey = `${key}_${i}`;
        const customUrl = `${folder}/${variantKey}.mp3`;
        try {
          const response = await fetch(customUrl, { method: 'HEAD' });
          const contentType = response.headers.get('content-type') || '';
          if (response.ok && contentType.includes('audio')) {
            variants.push(variantKey);
          } else {
            // 404 (file doesn't exist) or SPA HTML fallback — stop searching
            // in this folder. We don't `break` out of the outer loop so that
            // we still try the other folder (locale vs locale-agnostic).
            stopped = true;
            break;
          }
        } catch {
          stopped = true;
          break;
        }
      }
      if (stopped) {
        // If the locale folder didn't have any variants, fall through to the
        // locale-agnostic folder. If it had some, assume sequential numbering
        // applies to the next folder too (no fallthrough).
        if (variants.length === 0) continue;
        return variants;
      }
    }

    return variants;
  }

  private async selectVariant(key: string): Promise<string> {
    const count = this.variants.get(key);

    // Auto-discovery mode
    if (count === -1) {
      let available = this.discoveredVariants.get(key);
      if (!available) {
        available = await this.discoverVariants(key);
        this.discoveredVariants.set(key, available);
      }

      if (available.length === 0) return key;
      return available[Math.floor(Math.random() * available.length)] ?? key;
    }

    // Manual configuration mode
    if (!count || count === 0) return key;

    const index = Math.floor(Math.random() * count) + 1;
    return `${key}_${index}`;
  }

  private async playWithHowler(key: string) {
    const requestToken = this.disableToken;
    const howl = await this.getHowl(key);
    if (!this.enabled || !this.unlocked || this.disableToken !== requestToken) return;
    const now = Date.now();
    if (now - this.lastPlayAttemptAt < this.playDebounceMs) {
      this.pendingKey = key;
      if (!this.pendingTimer) {
        const delay = Math.max(this.playDebounceMs - (now - this.lastPlayAttemptAt), 0);
        this.pendingTimer = setTimeout(() => {
          this.pendingTimer = null;
          const pending = this.pendingKey;
          if (!pending || !this.enabled || !this.unlocked) return;
          this.pendingKey = null;
          this.playClip(pending);
        }, delay);
      }
      return;
    }
    this.lastPlayAttemptAt = now;
    this.stop();
    this.currentHowl = howl;
    await this.safePlay(howl, key);
  }

  private async getHowl(key: string) {
    const audioKey = await this.selectVariant(key);
    const existing = this.howls.get(audioKey);
    if (existing) return existing;
    const pending = this.howlPromises.get(audioKey);
    if (pending) return pending;

    const audioPath = await this.resolveAudioPath(audioKey);

    const promise = new Promise<Howl>((resolve) => {
      let attemptedFallback = false;
      let resolved = false;
      const requestToken = this.disableToken;
      const shouldCache = () => this.enabled && this.disableToken === requestToken;
      const createHowl = (src: string) =>
        new Howl({
          src,
          // Web Audio API (html5: false, the default) loads via XHR and decodes
          // in memory. This avoids the MEDIA_ERR_SRC_NOT_SUPPORTED (code 4) that
          // the HTML5 <audio> element fires in some Chrome configurations even for
          // valid, fully-served MP3 files. Howler's own AudioContext unlock fires
          // on the document click event, so the context is running by the time
          // play() is called here.
          volume: DEFAULT_VOLUME,
          onloaderror: (_id: number, err: unknown) =>
            console.error('[Werewolves Audio] Load Error:', src, err),
          onplayerror: (_id: number, err: unknown) =>
            console.error('[Werewolves Audio] Play Error:', src, err),
        });
      // Use resolved audio path, or fallback to silent audio if nothing available
      let activeHowl = createHowl(audioPath || FALLBACK_AUDIO_URL);

      const cleanup = (howl: Howl) => {
        howl.off('load');
        howl.off('loaderror');
        howl.off('playerror');
      };
      const finalize = (howl: Howl) => {
        if (resolved) return;
        resolved = true;
        this.howlPromises.delete(audioKey);
        if (!shouldCache()) {
          cleanup(howl);
          howl.unload();
          resolve(howl);
          return;
        }
        this.howls.set(audioKey, howl);
        resolve(howl);
      };
      const swapToFallback = (playAfterSwap: boolean) => {
        if (attemptedFallback || !FALLBACK_AUDIO_URL) return;
        attemptedFallback = true;
        const fallbackHowl = createHowl(FALLBACK_AUDIO_URL);
        cleanup(activeHowl);
        activeHowl.unload();
        activeHowl = fallbackHowl;
        attachListeners(fallbackHowl);
        if (!shouldCache()) {
          finalize(fallbackHowl);
          return;
        }
        if (playAfterSwap) {
          void this.safePlay(fallbackHowl, key);
          finalize(fallbackHowl);
          return;
        }
        fallbackHowl.load();
      };
      const attachListeners = (targetHowl: Howl) => {
        targetHowl.once('load', () => {
          finalize(targetHowl);
        });
        targetHowl.once('loaderror', () => {
          if (attemptedFallback) {
            finalize(targetHowl);
            return;
          }
          swapToFallback(false);
        });
        targetHowl.once('playerror', () => {
          if (attemptedFallback || !FALLBACK_AUDIO_URL) {
            finalize(targetHowl);
            return;
          }
          swapToFallback(true);
        });
      };

      attachListeners(activeHowl);
      activeHowl.load();
    });

    this.howlPromises.set(audioKey, promise);
    return promise;
  }

  private requestPlay(key: string) {
    this.lastAnnouncedKey = key;
    this.pendingKey = null;
    this.playClip(key);
  }

  private async safePlay(howl: Howl, key: NarrationKey) {
    try {
      const result = howl.play();
      const maybePromise = result as unknown;
      if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === 'function') {
        await (maybePromise as Promise<unknown>).catch((error) => {
          this.handlePlaybackError(error, key);
        });
      }
    } catch (error) {
      this.handlePlaybackError(error, key);
    }
  }

  private handlePlaybackError(error: unknown, key: NarrationKey) {
    void error;
    if (key) {
      this.pendingKey = key;
      if (this.lastAnnouncedKey === key) {
        this.lastAnnouncedKey = null;
      }
    }
    this.unlocked = false;
    if (this.enabled) {
      this.setEnabled(false);
    }
    this.informUser('audioBlocked');
  }

  private informUser(message: NarratorNotification) {
    const now = Date.now();
    if (now - this.lastUserMessageAt < USER_MESSAGE_COOLDOWN_MS) return;
    this.lastUserMessageAt = now;
    this.notify(message);
  }
}

function createNarrator(options: NarratorOptions = {}) {
  return new Narrator(options);
}

export { createNarrator, computeNarrationKey };
export type { NarrationKey, Narrator, NarratorNotification, NarratorOptions };
