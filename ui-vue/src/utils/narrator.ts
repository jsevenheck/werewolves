import { Howl } from 'howler';
import type { RoomView } from '@shared/types';
import { getBundledAudioUrl } from '../assets/audio/manifest';

type NarrationKey = string | null;
type NarratorNotification = 'audioBlocked';

type NarratorOptions = {
  /**
   * Optional base path for custom audio overrides.
   * If provided, narrator will first try to load custom audio from:
   * - ${assetsBasePath}/custom/${key}.mp3 (with variants)
   * - ${assetsBasePath}/${key}.mp3 (fallback)
   *
   * If not provided or if custom audio fails to load, narrator will use bundled audio.
   */
  assetsBasePath?: string;
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

  private async resolveAudioPath(audioKey: string): Promise<string | undefined> {
    const baseAudioKey = toBaseAudioKey(audioKey);

    // If assetsBasePath is provided, try custom audio overrides first
    if (this.assetsBasePath) {
      // 1. Try custom path with variant support
      const customPath = `${this.assetsBasePath}/custom/${audioKey}.mp3`;
      try {
        const response = await fetch(customPath, { method: 'HEAD' });
        const contentType = response.headers.get('content-type') || '';
        // Accept audio/* or application/octet-stream; reject HTML (SPA fallback)
        if (response.ok && !contentType.startsWith('text/html')) {
          return customPath;
        }
      } catch {
        // Custom file doesn't exist, continue to next fallback
      }

      // 2. Try default file path(s) from assetsBasePath.
      // For variant keys (e.g. day_1), also fall back to the base file (day.mp3).
      const defaultCandidates = baseAudioKey === audioKey ? [audioKey] : [audioKey, baseAudioKey];
      for (const key of defaultCandidates) {
        const defaultPath = `${this.assetsBasePath}/${key}.mp3`;
        try {
          const response = await fetch(defaultPath, { method: 'HEAD' });
          const contentType = response.headers.get('content-type') || '';
          // Accept audio/* or application/octet-stream; reject HTML (SPA fallback)
          if (response.ok && !contentType.startsWith('text/html')) {
            return defaultPath;
          }
        } catch {
          // Default file from assetsBasePath doesn't exist, continue to next fallback
        }
      }
    }

    // 3. Use bundled audio as fallback (works in all contexts without host-served files).
    // For variant keys (e.g. day_1), also try the base key (day).
    const bundledCandidates = baseAudioKey === audioKey ? [audioKey] : [audioKey, baseAudioKey];
    for (const key of bundledCandidates) {
      const bundled = getBundledAudioUrl(key);
      if (bundled) {
        return bundled;
      }
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

    for (let i = 1; i <= maxVariants; i++) {
      const variantKey = `${key}_${i}`;

      // Check custom folder only - standard files are used as fallback when no custom variants exist
      const customUrl = `${this.assetsBasePath}/custom/${variantKey}.mp3`;
      try {
        const response = await fetch(customUrl, { method: 'HEAD' });
        const contentType = response.headers.get('content-type') || '';
        // Only accept if response is OK AND content-type indicates audio (not HTML fallback)
        if (response.ok && contentType.includes('audio')) {
          variants.push(variantKey);
        } else {
          // Either 404 (file doesn't exist) or SPA HTML fallback – stop searching.
          // Variants are numbered sequentially so there is no point checking further.
          break;
        }
      } catch {
        // Network error or file doesn't exist, stop searching
        break;
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
