import { MockHowl } from './mocks/howler';

import { computeNarrationKey, createNarrator } from '../ui-vue/src/utils/narrator';
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
});

describe('narrator dedupe', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('does not re-announce the same key', () => {
    const playClip = jest.fn();
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
    const playClip = jest.fn();
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
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  test('does not play when locked', () => {
    const playClip = jest.fn();
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
    const playClip = jest.fn();
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
});

describe('narrator persistence', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  test('initFromStorage loads enabled state', () => {
    const storage: Storage = {
      getItem: jest.fn(() => 'true'),
      setItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(() => null),
      removeItem: jest.fn(),
      length: 0,
    };
    const narrator = createNarrator({ storage, initialEnabled: false });

    narrator.initFromStorage();

    expect(storage.getItem).toHaveBeenCalledWith('werewolves_narrator_enabled');
    expect(narrator.isEnabled()).toBe(true);
  });

  test('setEnabled updates storage', () => {
    const storage: Storage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(() => null),
      removeItem: jest.fn(),
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
    mockAudio = { volume: 0, play: jest.fn().mockResolvedValue(undefined), pause: jest.fn() };
    (global as any).Audio = jest.fn(() => mockAudio);
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
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('uses base filename when no variants configured', async () => {
    // Mock fetch to succeed for base file but fail for custom variants
    global.fetch = jest.fn().mockImplementation((url: string) => {
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
    expect(howl.options.src).toBe('/audio/lobby.mp3');
  });

  test('selects random variant when discovered', async () => {
    // Mock fetch to return success for 2 variants in custom folder only
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/custom/day_1.mp3') || url.includes('/custom/day_2.mp3')) {
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
    Math.random = jest.fn(() => 0.5); // Will select second variant

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
      // Should select day_2 (index 1 of 2 variants) from custom folder
      expect(howl.options.src).toBe('/audio/custom/day_2.mp3');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('caches variants separately', async () => {
    // Mock fetch to succeed for base files but fail for custom variants
    global.fetch = jest.fn().mockImplementation((url: string) => {
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
    expect(MockHowl.instances[0].options.src).toBe('/audio/day.mp3');
    expect(MockHowl.instances[1].options.src).toBe('/audio/night_wolves.mp3');
  });
});

describe('narrator bundled audio', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('uses bundled audio when no assetsBasePath provided', async () => {
    // Mock bundled audio manifest
    const mockBundledUrl = 'blob:http://localhost/bundled-day.mp3';
    jest.spyOn(audioManifest, 'getBundledAudioUrl').mockReturnValue(mockBundledUrl);
    global.fetch = jest.fn().mockResolvedValue({ ok: false });

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
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('day');
  });

  test('unlock uses native Audio with silent data URL (not a Howl)', async () => {
    const mockAudio = { volume: 0, play: jest.fn().mockResolvedValue(undefined), pause: jest.fn() };
    (global as any).Audio = jest.fn(() => mockAudio);

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
    jest.spyOn(audioManifest, 'getBundledAudioUrl').mockReturnValue(mockBundledUrl);

    // Mock fetch to return success for custom audio
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/custom-audio/day.mp3')) {
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
    expect(howl.options.src).toBe('/custom-audio/day.mp3');
    expect(audioManifest.getBundledAudioUrl).not.toHaveBeenCalled();
  });

  test('falls back to bundled audio when assetsBasePath files are unavailable', async () => {
    const mockBundledUrl = 'blob:http://localhost/bundled-night.mp3';
    jest.spyOn(audioManifest, 'getBundledAudioUrl').mockReturnValue(mockBundledUrl);

    // Mock fetch to fail for all custom audio (404 or network error)
    global.fetch = jest.fn().mockResolvedValue({ ok: false });

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
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('night');
  });

  test('falls back to base bundled audio when a cached variant disappears', async () => {
    const mockBundledDayUrl = 'blob:http://localhost/bundled-day.mp3';
    jest.spyOn(audioManifest, 'getBundledAudioUrl').mockImplementation((key: string) => {
      if (key === 'day') return mockBundledDayUrl;
      return undefined;
    });

    let dayVariantExists = true;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/audio/custom/day_1.mp3')) {
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
    expect(firstHowl.options.src).toBe('/audio/custom/day_1.mp3');

    // Simulate removing custom files while app is still running.
    dayVariantExists = false;
    narrator.setEnabled(false);
    narrator.setEnabled(true);
    await flushPromises();

    const secondHowl = MockHowl.instances[1];
    expect(secondHowl.options.src).toBe(mockBundledDayUrl);
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('day');
  });

  test('variants are not discovered when no assetsBasePath', async () => {
    const mockBundledUrl = 'blob:http://localhost/bundled-day.mp3';
    jest.spyOn(audioManifest, 'getBundledAudioUrl').mockReturnValue(mockBundledUrl);
    global.fetch = jest.fn().mockResolvedValue({ ok: false });

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
    expect(audioManifest.getBundledAudioUrl).toHaveBeenCalledWith('day');
  });
});

describe('narrator custom audio override', () => {
  beforeEach(() => {
    MockHowl.reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('uses custom audio when available', async () => {
    // Mock fetch to return success for custom file
    global.fetch = jest.fn().mockImplementation((url: string) => {
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
    expect(howl.options.src).toBe('/audio/custom/day.mp3');
  });

  test('falls back to default audio when custom not available', async () => {
    // Mock fetch to return 404 for custom, succeed for default
    global.fetch = jest.fn().mockImplementation((url: string) => {
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
    expect(howl.options.src).toBe('/audio/night_wolves.mp3');
  });

  test('only discovers custom variants, not default variants', async () => {
    // Mock: custom/day_1 exists, default day_2 exists (but should be ignored)
    global.fetch = jest.fn().mockImplementation((url: string) => {
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
    Math.random = jest.fn(() => 0); // Select first variant

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
      expect(howl.options.src).toBe('/audio/custom/day_1.mp3');

      // Should NOT have checked for default variants (only custom)
      expect(global.fetch).toHaveBeenCalledWith('/audio/custom/day_1.mp3', { method: 'HEAD' });
      expect(global.fetch).not.toHaveBeenCalledWith('/audio/day_2.mp3', { method: 'HEAD' });
    } finally {
      Math.random = originalRandom;
    }
  });

  test('uses standard file when no custom variants exist', async () => {
    // Mock: no custom variants exist, but default files exist
    global.fetch = jest.fn().mockImplementation((url: string) => {
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
    expect(howl.options.src).toBe('/audio/night.mp3');

    // Should have checked for custom variants but not found any
    expect(global.fetch).toHaveBeenCalledWith('/audio/custom/night_1.mp3', { method: 'HEAD' });
  });
});
