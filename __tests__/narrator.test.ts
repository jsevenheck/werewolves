import { MockHowl } from './mocks/howler';

import {
  ACTIVE_NARRATION_KEYS,
  computeNarrationKey,
  createNarrator,
} from '../ui-vue/src/utils/narrator';
import type { RoomView } from '../core/src/types';
import * as audioManifest from '../ui-vue/src/assets/audio/manifest';

type RoomOverrides = Partial<RoomView>;

const baseRoom = (): RoomView => ({
  code: 'ABCD',
  phase: 'lobby',
  phaseStep: null,
  dayCount: 0,
  players: [],
  hostId: null,
  minPlayers: 5,
  roleConfig: {
    werewolf: 1,
    seer: 1,
    hunter: 0,
    witch: 0,
    armor: 0,
    joker: 0,
    guard: 0,
    harlot: 0,
  },
  passiveRoleConfig: { mayor: true },
  discussionTimerSeconds: 60,
  discussionEndsAt: null,
  mayorId: null,
  awaitingMayorSelection: false,
  mayorSelectionPending: false,
  loversKnown: false,
  loversAssigned: false,
  loverName: null,
  witchState: { healAvailable: null, poisonAvailable: null },
  wolfVotes: null,
  wolfTarget: null,
  wolfPeers: [],
  nextNightStep: null,
  phaseTransition: null,
  seerResult: null,
  voteState: {
    revoteFromTie: null,
    submitted: 0,
    required: 0,
    yourVote: null,
  },
  lastNightDeaths: [],
  lastDayDeaths: [],
  lastDayMessage: null,
  awaitingHunterShot: false,
  hunterShotPending: false,
  hunterShotEndsAt: null,
  winner: null,
  logs: [],
  guardedTarget: null,
  lastGuardedTarget: null,
  wolfVoteState: null,
  wolfIds: [],
  harlotVisitedTarget: null,
  dayVoteResolved: false,
  self: null,
});

const buildRoom = (overrides: RoomOverrides = {}): RoomView => ({
  ...baseRoom(),
  ...overrides,
});

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('computeNarrationKey', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('phaseTransition overrides phase and step', () => {
    const room = buildRoom({
      phase: 'night',
      phaseStep: 'wolves',
      phaseTransition: 'dayToNight',
    });
    expect(computeNarrationKey(room)).toBe('dayToNight');
  });

  test('night phase step yields night_<step>', () => {
    const room = buildRoom({ phase: 'night', phaseStep: 'seer' });
    expect(computeNarrationKey(room)).toBe('night_seer');
  });

  test('default phase yields phase name', () => {
    const room = buildRoom({ phase: 'armor', phaseStep: null });
    expect(computeNarrationKey(room)).toBe('armor');
  });

  test('postReveal is suppressed when mayor is enabled (initial election)', () => {
    const room = buildRoom({ phase: 'roleReveal', phaseTransition: 'postReveal' });
    expect(computeNarrationKey(room)).toBeNull();
  });

  test('postReveal plays when mayor is disabled (leads to night)', () => {
    const room = buildRoom({
      phase: 'roleReveal',
      phaseTransition: 'postReveal',
      passiveRoleConfig: { mayor: false },
    });
    expect(computeNarrationKey(room)).toBe('postReveal');
  });

  test('suppresses internal night transitions between actionable role cues', () => {
    const sequence = [
      buildRoom({ phase: 'day', phaseTransition: 'dayToNight' }),
      buildRoom({
        phase: 'night',
        phaseStep: 'transition',
        nextNightStep: 'wolves',
      }),
      buildRoom({ phase: 'night', phaseStep: 'wolves' }),
      buildRoom({
        phase: 'night',
        phaseStep: 'transition',
        nextNightStep: 'seer',
      }),
      buildRoom({ phase: 'night', phaseStep: 'seer' }),
    ];

    expect(sequence.map(computeNarrationKey).filter(Boolean)).toEqual([
      'dayToNight',
      'night_wolves',
      'night_seer',
    ]);
  });

  test('announces the completed day phase once instead of narrating every morning state', () => {
    const sequence = [
      buildRoom({ phase: 'night', phaseStep: 'resolve' }),
      buildRoom({
        phase: 'night',
        phaseStep: 'transition',
        phaseTransition: 'nightToDay',
      }),
      buildRoom({ phase: 'day', phaseStep: null, phaseTransition: null }),
    ];

    expect(sequence.map(computeNarrationKey).filter(Boolean)).toEqual(['day']);
  });

  test('skips generic post-mayor narration and announces the next actionable phase', () => {
    const sequence = [
      buildRoom({ phase: 'mayor', phaseTransition: 'postMayor' }),
      buildRoom({ phase: 'armor', phaseStep: null, phaseTransition: null }),
    ];

    expect(sequence.map(computeNarrationKey).filter(Boolean)).toEqual(['armor']);
  });

  test('bundles every active narration cue in both supported locales', () => {
    for (const key of ACTIVE_NARRATION_KEYS) {
      expect(
        audioManifest.getBundledAudioUrl(key, 'en'),
        `missing EN clip for ${key}`
      ).toBeDefined();
      expect(
        audioManifest.getBundledAudioUrl(key, 'de'),
        `missing DE clip for ${key}`
      ).toBeDefined();
    }
  });
});

describe('narrator dedupe', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('does not re-announce the same key', () => {
    const playClip = vi.fn();
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playClip,
    });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    narrator.handleRoomUpdate(room, room);

    expect(playClip).toHaveBeenCalledTimes(1);
  });

  test('announces when the key changes', () => {
    const playClip = vi.fn();
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playClip,
    });
    const roomDay = buildRoom({ phase: 'day' });
    const roomNight = buildRoom({ phase: 'night', phaseStep: 'wolves' });

    narrator.handleRoomUpdate(null, roomDay);
    narrator.handleRoomUpdate(roomDay, roomNight);

    expect(playClip).toHaveBeenCalledTimes(2);
    expect(playClip).toHaveBeenLastCalledWith('night_wolves');
  });
});

describe('narrator playback', () => {
  beforeEach(() => {
    MockHowl.reset();
    // Mock fetch for variant discovery
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('does not play if disabled while clip is loading', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: true, storage: null });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    await flushPromises(); // Wait for variant discovery
    const [howl] = MockHowl.instances;

    narrator.setEnabled(false);
    howl.trigger('load');
    await flushPromises();

    expect(howl.play).not.toHaveBeenCalled();
  });

  test('falls back to silence audio on loaderror', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: true, storage: null });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    await flushPromises(); // Wait for variant discovery
    const initialHowl = MockHowl.instances[0];

    initialHowl.trigger('loaderror');
    const fallbackHowl = MockHowl.instances[1];
    fallbackHowl.trigger('load');
    await flushPromises();

    expect(initialHowl.unload).toHaveBeenCalled();
    expect(fallbackHowl.play).toHaveBeenCalled();
    expect(String(fallbackHowl.options.src)).toBe(
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA='
    );
  });

  test('resolves fallback playerror after loaderror', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: true, storage: null });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    await flushPromises(); // Wait for variant discovery
    const initialHowl = MockHowl.instances[0];

    initialHowl.trigger('loaderror');
    const fallbackHowl = MockHowl.instances[1];

    fallbackHowl.trigger('playerror');
    await flushPromises();

    expect(fallbackHowl.load).toHaveBeenCalled();
    expect(fallbackHowl.play).toHaveBeenCalled();
  });

  test('setEnabled(false) stops playback and unloads cached audio', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: true, storage: null });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    await flushPromises(); // Wait for variant discovery
    const [howl] = MockHowl.instances;

    howl.trigger('load');
    await flushPromises();
    narrator.setEnabled(false);

    expect(howl.stop).toHaveBeenCalled();
    expect(howl.unload).toHaveBeenCalled();
  });

  test('does not play an older clip that finishes loading after a newer state', async () => {
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockImplementation((key: string) => {
      return `blob:http://localhost/${key}.mp3`;
    });
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playDebounceMs: 0,
    });
    const roomDay = buildRoom({ phase: 'day' });
    const roomWolves = buildRoom({ phase: 'night', phaseStep: 'wolves' });

    narrator.handleRoomUpdate(null, roomDay);
    await flushPromises();
    const dayHowl = MockHowl.instances[0];

    narrator.handleRoomUpdate(roomDay, roomWolves);
    await flushPromises();
    const wolvesHowl = MockHowl.instances[1];

    wolvesHowl.trigger('load');
    await flushPromises();
    dayHowl.trigger('load');
    await flushPromises();

    expect(wolvesHowl.play).toHaveBeenCalledTimes(1);
    expect(dayHowl.play).not.toHaveBeenCalled();
  });

  test('does not play when locked', () => {
    const playClip = vi.fn();
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: false,
      storage: null,
      playClip,
    });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);

    expect(playClip).not.toHaveBeenCalled();
  });

  test('re-announces after disable then enable', () => {
    const playClip = vi.fn();
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playClip,
    });
    const room = buildRoom({ phase: 'day' });

    narrator.handleRoomUpdate(null, room);
    narrator.setEnabled(false);
    narrator.setEnabled(true);

    expect(playClip).toHaveBeenCalledTimes(2);
  });

  test('does not announce a stale phase after entering a silent transition state', () => {
    const playClip = vi.fn();
    const narrator = createNarrator({
      initialEnabled: false,
      initialUnlocked: true,
      storage: null,
      playClip,
    });
    const roomDay = buildRoom({ phase: 'day' });
    const roomTransition = buildRoom({
      phase: 'night',
      phaseStep: 'transition',
      nextNightStep: 'wolves',
    });

    narrator.handleRoomUpdate(null, roomDay);
    narrator.handleRoomUpdate(roomDay, roomTransition);
    narrator.setEnabled(true);

    expect(playClip).not.toHaveBeenCalled();
  });
});

describe('narrator persistence', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('initFromStorage loads enabled state', () => {
    const storage: Storage = {
      getItem: vi.fn(() => 'true'),
      setItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      length: 0,
    };
    const narrator = createNarrator({ storage, initialEnabled: false });

    narrator.initFromStorage();

    expect(storage.getItem).toHaveBeenCalledWith('werewolves_narrator_enabled');
    expect(narrator.isEnabled()).toBe(true);
  });

  test('setEnabled updates storage', () => {
    const storage: Storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      length: 0,
    };
    const narrator = createNarrator({ storage, initialEnabled: false });

    narrator.setEnabled(true);

    expect(storage.setItem).toHaveBeenCalledWith('werewolves_narrator_enabled', 'true');
  });
});

describe('narrator unlock', () => {
  let mockAudio: any;

  beforeEach(() => {
    MockHowl.reset();
    mockAudio = { volume: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    (global as any).Audio = vi.fn(function () {
      return mockAudio;
    });
  });

  afterEach(() => {
    delete (global as any).Audio;
  });

  test('unlock resolves true when native audio plays successfully', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: false });
    const unlockPromise = narrator.unlock();

    await expect(unlockPromise).resolves.toBe(true);
    expect(mockAudio.play).toHaveBeenCalled();
    expect(narrator.isUnlocked()).toBe(true);
  });

  test('unlock resolves false when autoplay is blocked', async () => {
    mockAudio.play.mockRejectedValue(new Error('Autoplay blocked'));
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: false });
    const unlockPromise = narrator.unlock();

    await expect(unlockPromise).resolves.toBe(false);
    expect(narrator.isUnlocked()).toBe(false);
  });

  test('unlock returns true immediately if already unlocked', async () => {
    const narrator = createNarrator({ initialEnabled: true, initialUnlocked: true });
    const result = await narrator.unlock();
    expect(result).toBe(true);
    expect(mockAudio.play).not.toHaveBeenCalled();
  });
});

describe('narrator audio variants', () => {
  beforeEach(() => {
    MockHowl.reset();
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('uses base filename when no variants configured', async () => {
    // Mock fetch to succeed for the locale-specific default file but fail for
    // locale-specific custom variants. The locale-agnostic fallback paths are
    // not hit.
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/custom/')) {
        return Promise.resolve({ ok: false });
      }
      // Base files from assetsBasePath succeed
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'audio/mpeg' },
      });
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/audio',
      storage: null,
    });
    const room = buildRoom({ phase: 'lobby' });

    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    // Locale-aware: default EN, so the narrator probes `/audio/en/lobby.mp3`
    // before falling back to the locale-agnostic `/audio/lobby.mp3`.
    expect(howl.options.src).toBe('/audio/en/lobby.mp3');
  });

  test('selects random variant when discovered', async () => {
    // Mock fetch to return success for 2 variants in the locale-specific
    // custom folder only.
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/en/custom/day_1.mp3') || url.includes('/en/custom/day_2.mp3')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'audio/mpeg' },
        });
      }
      return Promise.resolve({
        ok: false,
        headers: { get: () => 'text/html' },
      });
    });

    const originalRandom = Math.random;
    Math.random = vi.fn(() => 0.5); // Will select second variant

    try {
      const narrator = createNarrator({
        initialEnabled: true,
        initialUnlocked: true,
        assetsBasePath: '/audio',
        storage: null,
      });

      const roomDay = buildRoom({ phase: 'day' });
      narrator.handleRoomUpdate(null, roomDay);
      await flushPromises();

      const [howl] = MockHowl.instances;
      // Should select day_2 (index 1 of 2 variants) from the locale-specific custom folder
      expect(howl.options.src).toBe('/audio/en/custom/day_2.mp3');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('caches variants separately', async () => {
    // Mock fetch to succeed for locale-specific base files but fail for
    // custom variants.
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/custom/')) {
        return Promise.resolve({ ok: false });
      }
      // Base files from assetsBasePath succeed
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'audio/mpeg' },
      });
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/audio',
      storage: null,
    });

    const room1 = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room1);
    await flushPromises();

    const room2 = buildRoom({ phase: 'night', phaseStep: 'wolves' });
    narrator.handleRoomUpdate(room1, room2);
    await flushPromises();

    // Should have created two separate Howl instances
    expect(MockHowl.instances).toHaveLength(2);
    expect(MockHowl.instances[0].options.src).toBe('/audio/en/day.mp3');
    expect(MockHowl.instances[1].options.src).toBe('/audio/en/night_wolves.mp3');
  });
});

describe('narrator bundled audio', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('uses bundled audio when no assetsBasePath provided', async () => {
    // Mock bundled audio manifest
    const mockBundledUrl = 'blob:http://localhost/bundled-day.mp3';
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockReturnValue(mockBundledUrl);
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      // No assetsBasePath - should use bundled audio
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    expect(howl.options.src).toBe(mockBundledUrl);
    // getBundledAudioUrl is now called with the active locale (default: 'en').
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('day', 'en');
  });

  test('unlock uses native Audio with silent data URL (not a Howl)', async () => {
    const mockAudio = { volume: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    (global as any).Audio = vi.fn(function () {
      return mockAudio;
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: false,
      storage: null,
    });

    const unlockPromise = narrator.unlock();
    await expect(unlockPromise).resolves.toBe(true);

    // Unlock must not create any Howl instances — it uses native Audio
    expect(MockHowl.instances).toHaveLength(0);
    expect(mockAudio.play).toHaveBeenCalled();

    delete (global as any).Audio;
  });

  test('prefers custom audio from assetsBasePath over bundled', async () => {
    const mockBundledUrl = 'blob:http://localhost/bundled-day.mp3';
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockReturnValue(mockBundledUrl);

    // Mock fetch to return success for the locale-specific custom audio.
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/custom-audio/en/day.mp3')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'audio/mpeg' },
        });
      }
      return Promise.resolve({ ok: false });
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/custom-audio',
      storage: null,
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    // Should use custom audio from assetsBasePath, not bundled
    expect(howl.options.src).toBe('/custom-audio/en/day.mp3');
    expect(audioManifest.getBundledAudioUrl).not.toHaveBeenCalled();
  });

  test('falls back to bundled audio when assetsBasePath files are unavailable', async () => {
    const mockBundledUrl = 'blob:http://localhost/bundled-night.mp3';
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockReturnValue(mockBundledUrl);

    // Mock fetch to fail for all custom audio (404 or network error)
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/custom-audio',
      storage: null,
    });

    const room = buildRoom({ phase: 'night' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    // Should fall back to bundled audio when assetsBasePath files don't exist
    expect(howl.options.src).toBe(mockBundledUrl);
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('night', 'en');
  });

  test('falls back to base bundled audio when a cached variant disappears', async () => {
    const mockBundledDayUrl = 'blob:http://localhost/bundled-day.mp3';
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockImplementation((key: string) => {
      if (key === 'day') return mockBundledDayUrl;
      return undefined;
    });

    let dayVariantExists = true;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/audio/en/custom/day_1.mp3')) {
        return Promise.resolve({
          ok: dayVariantExists,
          headers: { get: () => (dayVariantExists ? 'audio/mpeg' : 'text/html') },
        });
      }
      return Promise.resolve({
        ok: false,
        headers: { get: () => 'text/html' },
      });
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/audio',
      storage: null,
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const firstHowl = MockHowl.instances[0];
    expect(firstHowl.options.src).toBe('/audio/en/custom/day_1.mp3');

    // Simulate removing custom files while app is still running.
    dayVariantExists = false;
    narrator.setEnabled(false);
    narrator.setEnabled(true);
    await flushPromises();

    const secondHowl = MockHowl.instances[1];
    expect(secondHowl.options.src).toBe(mockBundledDayUrl);
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('day', 'en');
  });

  test('variants are not discovered when no assetsBasePath', async () => {
    const mockBundledUrl = 'blob:http://localhost/bundled-day.mp3';
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockReturnValue(mockBundledUrl);
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    // Should not attempt variant discovery (no HEAD requests for variants)
    expect(global.fetch).not.toHaveBeenCalled();
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('day', 'en');
  });
});

describe('narrator custom audio override', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('uses custom audio when available', async () => {
    // Mock fetch to return success for custom file
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/custom/day.mp3')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'audio/mpeg' },
        });
      }
      return Promise.resolve({
        ok: false,
        headers: { get: () => 'text/html' },
      });
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/audio',
      storage: null,
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    expect(howl.options.src).toBe('/audio/en/custom/day.mp3');
  });

  test('falls back to default audio when custom not available', async () => {
    // Mock fetch to return 404 for custom, succeed for default
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/custom/')) {
        return Promise.resolve({ ok: false });
      }
      // Default files from assetsBasePath succeed
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'audio/mpeg' },
      });
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/audio',
      storage: null,
    });

    const room = buildRoom({ phase: 'night', phaseStep: 'wolves' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    expect(howl.options.src).toBe('/audio/en/night_wolves.mp3');
  });

  test('only discovers custom variants, not default variants', async () => {
    // Mock: custom/day_1 exists, default day_2 exists (but should be ignored)
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/custom/day_1.mp3')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'audio/mpeg' },
        });
      }
      if (url.includes('day_2.mp3') && !url.includes('/custom/')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'audio/mpeg' },
        });
      }
      return Promise.resolve({
        ok: false,
        headers: { get: () => 'text/html' },
      });
    });

    const originalRandom = Math.random;
    Math.random = vi.fn(() => 0); // Select first variant

    try {
      const narrator = createNarrator({
        initialEnabled: true,
        initialUnlocked: true,
        assetsBasePath: '/audio',
        storage: null,
      });

      const room = buildRoom({ phase: 'day' });
      narrator.handleRoomUpdate(null, room);
      await flushPromises();

      const [howl] = MockHowl.instances;
      // Should use custom variant
      expect(howl.options.src).toBe('/audio/en/custom/day_1.mp3');

      // Should NOT have checked for default variants (only custom)
      expect(global.fetch).toHaveBeenCalledWith('/audio/en/custom/day_1.mp3', { method: 'HEAD' });
      expect(global.fetch).not.toHaveBeenCalledWith('/audio/day_2.mp3', { method: 'HEAD' });
    } finally {
      Math.random = originalRandom;
    }
  });

  test('uses standard file when no custom variants exist', async () => {
    // Mock: no custom variants exist, but default files exist
    global.fetch = vi.fn().mockImplementation((url: string) => {
      // All custom variant checks fail
      if (url.includes('/custom/')) {
        return Promise.resolve({ ok: false });
      }
      // Default files from assetsBasePath succeed
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'audio/mpeg' },
      });
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/audio',
      storage: null,
    });

    const room = buildRoom({ phase: 'night' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    // Should fall back to standard file (not custom)
    expect(howl.options.src).toBe('/audio/en/night.mp3');

    // Should have checked for custom variants but not found any
    expect(global.fetch).toHaveBeenCalledWith('/audio/en/custom/night_1.mp3', { method: 'HEAD' });
  });
});

describe('narrator locale-aware audio', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves the German bundled clip when the active locale is "de"', async () => {
    const mockDeDayUrl = 'blob:http://localhost/bundled-day-de.mp3';
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockImplementation(
      (key: string, locale: string) => {
        if (key === 'day' && locale === 'de') return mockDeDayUrl;
        return undefined;
      }
    );
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      getLocale: () => 'de',
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    expect(howl.options.src).toBe(mockDeDayUrl);
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('day', 'de');
  });

  test('falls back to the English clip when the active locale has no bundled file', async () => {
    const mockEnDayUrl = 'blob:http://localhost/bundled-day-en.mp3';
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockImplementation(
      (key: string, locale: string) => {
        // DE has no file for this key, EN does
        if (key === 'day' && locale === 'en') return mockEnDayUrl;
        return undefined;
      }
    );
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      getLocale: () => 'de',
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    expect(howl.options.src).toBe(mockEnDayUrl);
    // Manifest was called for DE first, then for EN
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('day', 'de');
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('day', 'en');
  });

  test('prefers the locale-specific override path over the locale-agnostic one', async () => {
    // Locale-specific exists, locale-agnostic does not
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/audio/de/day.mp3')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'audio/mpeg' },
        });
      }
      return Promise.resolve({ ok: false });
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/audio',
      storage: null,
      getLocale: () => 'de',
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    expect(howl.options.src).toBe('/audio/de/day.mp3');
  });

  test('falls back to the locale-agnostic override path when the locale-specific one is missing', async () => {
    // Only the locale-agnostic path exists
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/audio/day.mp3')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'audio/mpeg' },
        });
      }
      return Promise.resolve({ ok: false });
    });

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/audio',
      storage: null,
      getLocale: () => 'de',
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    const [howl] = MockHowl.instances;
    expect(howl.options.src).toBe('/audio/day.mp3');
  });

  test('invalidateCache preserves the active clip and resolves the next cue in the new locale', async () => {
    const mockEnDayUrl = 'blob:http://localhost/bundled-day-en.mp3';
    const mockDeNightUrl = 'blob:http://localhost/bundled-night-de.mp3';
    let activeLocale: 'en' | 'de' = 'en';
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockImplementation(
      (key: string, locale: string) => {
        if (key === 'day' && locale === 'en') return mockEnDayUrl;
        if (key === 'night' && locale === 'de') return mockDeNightUrl;
        return undefined;
      }
    );

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playDebounceMs: 0,
      getLocale: () => activeLocale,
    });

    const roomDay = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, roomDay);
    await flushPromises();
    const firstHowl = MockHowl.instances[0];
    firstHowl.trigger('load');
    await flushPromises();
    expect(firstHowl.options.src).toBe(mockEnDayUrl);
    expect(firstHowl.play).toHaveBeenCalledTimes(1);

    activeLocale = 'de';
    narrator.invalidateCache();
    expect(firstHowl.unload).not.toHaveBeenCalled();

    const roomNight = buildRoom({ phase: 'night' });
    narrator.handleRoomUpdate(roomDay, roomNight);
    await flushPromises();
    const secondHowl = MockHowl.instances[1];
    expect(secondHowl.options.src).toBe(mockDeNightUrl);
    secondHowl.trigger('load');
    await flushPromises();

    expect(firstHowl.stop).toHaveBeenCalledTimes(1);
    expect(firstHowl.unload).toHaveBeenCalledTimes(1);
    expect(secondHowl.play).toHaveBeenCalledTimes(1);
  });

  test('unloads a detached locale clip after it finishes naturally', async () => {
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockReturnValue(
      'blob:http://localhost/bundled-day-en.mp3'
    );
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playDebounceMs: 0,
    });

    narrator.handleRoomUpdate(null, buildRoom({ phase: 'day' }));
    await flushPromises();
    const howl = MockHowl.instances[0];
    howl.trigger('load');
    await flushPromises();

    narrator.invalidateCache();
    expect(howl.unload).not.toHaveBeenCalled();

    howl.trigger('end');
    expect(howl.unload).toHaveBeenCalledTimes(1);
  });

  test('does not start an old-locale clip that finishes loading after cache invalidation', async () => {
    const mockEnDayUrl = 'blob:http://localhost/bundled-day-en.mp3';
    const mockDeNightUrl = 'blob:http://localhost/bundled-night-de.mp3';
    let activeLocale: 'en' | 'de' = 'en';
    vi.spyOn(audioManifest, 'getBundledAudioUrl').mockImplementation(
      (key: string, locale: string) => {
        if (key === 'day' && locale === 'en') return mockEnDayUrl;
        if (key === 'night' && locale === 'de') return mockDeNightUrl;
        return undefined;
      }
    );
    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      storage: null,
      playDebounceMs: 0,
      getLocale: () => activeLocale,
    });

    const roomDay = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, roomDay);
    await flushPromises();
    const staleHowl = MockHowl.instances[0];

    activeLocale = 'de';
    narrator.invalidateCache();
    staleHowl.trigger('load');
    await flushPromises();

    expect(staleHowl.play).not.toHaveBeenCalled();
    expect(staleHowl.unload).toHaveBeenCalledTimes(1);

    narrator.handleRoomUpdate(roomDay, buildRoom({ phase: 'night' }));
    await flushPromises();
    const currentHowl = MockHowl.instances[1];
    expect(currentHowl.options.src).toBe(mockDeNightUrl);
    currentHowl.trigger('load');
    await flushPromises();
    expect(currentHowl.play).toHaveBeenCalledTimes(1);
  });

  test('discoverVariants probes the locale-specific custom folder first', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/audio/de/custom/day_1.mp3')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'audio/mpeg' },
        });
      }
      return Promise.resolve({ ok: false });
    });
    global.fetch = fetchMock;

    const narrator = createNarrator({
      initialEnabled: true,
      initialUnlocked: true,
      assetsBasePath: '/audio',
      storage: null,
      getLocale: () => 'de',
    });

    const room = buildRoom({ phase: 'day' });
    narrator.handleRoomUpdate(null, room);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/audio/de/custom/day_1.mp3', { method: 'HEAD' });
  });
});
