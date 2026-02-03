import { Howl } from 'howler';
import type { RoomView } from '@shared/types';

type NarrationKey = string | null;

type NarratorOptions = {
  basePath?: string;
  storage?: Storage | null;
  initialEnabled?: boolean;
  initialUnlocked?: boolean;
  playClip?: (key: string) => void;
  notify?: (message: string) => void;
  playDebounceMs?: number;
};

const STORAGE_KEY = 'werewolves_narrator_enabled';
const DEFAULT_VOLUME = 1;
const FALLBACK_AUDIO_URL =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';
const USER_MESSAGE_COOLDOWN_MS = 4000;

function computeNarrationKey(room: RoomView): NarrationKey {
  if (room.phaseTransition) {
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
  private readonly basePath: string;
  private readonly storage: Storage | null;
  private readonly playClip: (key: string) => void;
  private readonly notify: (message: string) => void;
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
    this.basePath = options.basePath ?? '/audio';
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
    return new Promise((resolve) => {
      let attemptedFallback = false;
      let unlockHowl: Howl;
      const createUnlockHowl = (src: string) =>
        new Howl({
          src,
          html5: true,
          preload: 'metadata',
          volume: 0,
        });
      unlockHowl = createUnlockHowl(`${this.basePath}/lobby.mp3`);
      const tryFallback = (playAfterSwap: boolean) => {
        if (!FALLBACK_AUDIO_URL) {
          cleanup(unlockHowl);
          unlockHowl.unload();
          resolve(false);
          return;
        }
        if (attemptedFallback) return;
        attemptedFallback = true;
        const fallbackHowl = createUnlockHowl(FALLBACK_AUDIO_URL);
        unlockHowl.unload();
        unlockHowl = fallbackHowl;
        attachListeners(unlockHowl);
        if (playAfterSwap) {
          void this.safePlay(unlockHowl, null);
          return;
        }
        unlockHowl.load();
      };
      const cleanup = (howl: Howl) => {
        howl.off('play');
        howl.off('playerror');
        howl.off('loaderror');
      };
      const attachListeners = (howl: Howl) => {
        howl.once('play', () => {
          this.unlocked = true;
          howl.stop();
          cleanup(howl);
          howl.unload();
          resolve(true);
        });
        howl.once('loaderror', () => {
          cleanup(howl);
          if (attemptedFallback) {
            howl.unload();
            resolve(false);
            return;
          }
          tryFallback(true);
        });
        howl.once('playerror', () => {
          cleanup(howl);
          if (!attemptedFallback) {
            tryFallback(true);
            return;
          }
          howl.unload();
          resolve(false);
        });
      };
      attachListeners(unlockHowl);
      void this.safePlay(unlockHowl, null);
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

  private async resolveAudioPath(audioKey: string): Promise<string> {
    const customPath = `${this.basePath}/custom/${audioKey}.mp3`;

    try {
      const response = await fetch(customPath, { method: 'HEAD' });
      const contentType = response.headers.get('content-type') || '';
      // Only accept if response is OK AND content-type indicates audio (not HTML fallback)
      if (response.ok && contentType.includes('audio')) {
        return customPath;
      }
    } catch {
      // Custom file doesn't exist, fall back to default
    }

    return `${this.basePath}/${audioKey}.mp3`;
  }

  private async discoverVariants(key: string, maxVariants = 10): Promise<string[]> {
    const variants: string[] = [];

    for (let i = 1; i <= maxVariants; i++) {
      const variantKey = `${key}_${i}`;

      // Check custom folder only - standard files are used as fallback when no custom variants exist
      const customUrl = `${this.basePath}/custom/${variantKey}.mp3`;
      try {
        const response = await fetch(customUrl, { method: 'HEAD' });
        const contentType = response.headers.get('content-type') || '';
        // Only accept if response is OK AND content-type indicates audio (not HTML fallback)
        if (response.ok && contentType.includes('audio')) {
          variants.push(variantKey);
        } else if (response.ok && !contentType.includes('audio')) {
          // Server returned HTML fallback (SPA), file doesn't actually exist
          break; // Stop searching, subsequent variants won't exist either
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
      return available[Math.floor(Math.random() * available.length)];
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
          html5: true,
          preload: 'metadata',
          volume: DEFAULT_VOLUME,
        });
      let activeHowl = createHowl(audioPath);

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
    this.informUser('Audio is blocked. Tap to enable narrator.');
  }

  private informUser(message: string) {
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
export type { NarrationKey, Narrator, NarratorOptions };
