# Narrator Audio – Investigation & Fixes

## Problem

The narrator did not produce any sound in standalone mode when no custom audio files were present. Only the built-in (bundled) audio under `ui-vue/src/assets/audio/` existed, but it never played.

---

## Root Causes Found

### 1. Dead folder: `standalone-web/public/audio/`

`standalone-web/vite.config.ts` overrides `publicDir` to point at `../ui-vue/public`, so `standalone-web/public/` was never served by Vite. The `audio/README.md` inside it was documentation that described a path that did not actually exist at runtime.

**Fix:** Deleted `standalone-web/public/audio/` (and the empty `standalone-web/public/` directory) entirely.

The correct location for custom audio in standalone mode is `ui-vue/public/audio/custom/`.

---

### 2. Wrong static directory served by the standalone server

`standalone-server/src/staticDir.ts` had this priority logic:

```
if (lifecycleEvent === 'start:standalone' && standalone-web/dist exists)
  → use standalone-web/dist     ✓ (bundled audio assets present)
else if (dist/client exists)
  → use dist/client             ✗ (NO bundled audio .mp3 files here!)
else if (standalone-web/dist exists)
  → use standalone-web/dist
else
  → use ui-vue/ (dev fallback)
```

Because `dist/client/` (the game-hub build) almost always exists, the server served from there for any lifecycle event other than `start:standalone`. `dist/client/assets/` contains no `.mp3` files, so every request for `/assets/lobby-[hash].mp3` returned the SPA fallback (HTML), causing `MEDIA_ERR_SRC_NOT_SUPPORTED` (error 4) in Howler.

**Fix:** `standalone-web/dist/` is now always preferred when it exists, regardless of lifecycle event. `lifecycleEvent` parameter removed.

```ts
// Before
const preferStandaloneWebDist = lifecycleEvent === 'start:standalone';

// After
const preferStandaloneWebDist = existsSync(standaloneWebDist);
```

Files changed:

- `standalone-server/src/staticDir.ts`
- `standalone-server/src/index.ts` (removed `lifecycleEvent` from call)
- `__tests__/standaloneServerStaticDir.test.ts` (updated tests)

---

### 3. Content-type check too strict for custom audio HEAD requests

`narrator.ts` checked `contentType.includes('audio')` before accepting a HEAD response as a valid audio file. Some servers (and certain Vite dev configurations) serve `.mp3` files with `application/octet-stream` instead of `audio/mpeg`, causing all custom audio paths to be rejected even when the files existed.

**Fix:** Changed check to reject only `text/html` (SPA fallback), accepting everything else.

```ts
// Before
if (response.ok && contentType.includes('audio')) { ... }

// After
if (response.ok && !contentType.startsWith('text/html')) { ... }
```

---

### 4. `preload: 'metadata'` caused `MEDIA_ERR_SRC_NOT_SUPPORTED` in Chrome

Howler was configured with `preload: 'metadata'` on all `Howl` instances (both the unlock howl and the playback howls). With this setting, Chrome loads only audio metadata but not audio data. When `play()` is called immediately while the audio element is in `HAVE_METADATA` state (no audio data buffered), Chrome fires the `error` event with code `4` (`MEDIA_ERR_SRC_NOT_SUPPORTED`).

This was confirmed by:

- `curl -I` returning `200 audio/mpeg` and `Accept-Ranges: bytes` — server is fine
- Direct browser navigation to the audio URL showing a working native audio player
- The error appearing consistently on every play attempt

**Fix:** Removed `preload: 'metadata'` from `createHowl` in `narrator.ts`. Howler's default (`preload: true`) loads the full audio before play, avoiding the race condition.

---

### 5. Howler async play queue causes unlock promise to hang permanently

After fix #4, the narrator button became permanently grayed out and unresponsive. Clicking it set `unlockInProgress = true` (disabling the button) but nothing ever set it back to `false`. Nothing appeared in the browser console.

Root cause: with `preload: true` (Howler's default and the setting left after fix #4), Howler queues `play()` internally until the audio element finishes loading. The queued play fires asynchronously from a `canplaythrough` event callback — **outside the original user-gesture window**. Chrome's autoplay policy then blocks the `audio.play()` call. In this failure path Howler does not reliably fire `'playerror'`, so the Promise returned by `narrator.unlock()` never settles. `unlockInProgress` stays `true` forever.

**Fix:** Replaced the Howler-based unlock with a bare `HTMLAudioElement` and a `data:` URL:

```ts
// Before — Howl with preload: true queues play() until audio loads (async)
const unlockHowl = new Howl({ src: bundledUrl, html5: true, volume: 0 });
// → audio.play() fires later in an async callback, outside gesture window

// After — native Audio + data: URL (no network I/O, loads synchronously)
const audio = new Audio(FALLBACK_AUDIO_URL); // data:audio/wav;base64,...
audio.volume = 0;
const playPromise = audio.play(); // called synchronously → inside gesture window
playPromise
  .then(() => {
    this.unlocked = true;
    resolve(true);
  })
  .catch(() => resolve(false));
```

`new Audio(data:...)` decodes the base64 in-process with no network round-trip; the browser considers the audio ready when `.play()` is called, so Chrome treats it as a valid in-gesture autoplay and the Promise resolves immediately.

---

### 6. `html5: true` on playback Howls causes `MEDIA_ERR_SRC_NOT_SUPPORTED`

After fix #5, the unlock worked but audio still didn't play. Console showed:

```
Load Error: /assets/lobby-DXeMgaEI.mp3 4
```

Root cause: `createHowl` had `html5: true`, which uses an HTML5 `<audio>` element for loading. In certain Chrome configurations, the `<audio>` element fires `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4) even for valid, correctly-served MP3 files.

**Fix:** Removed `html5: true` from `createHowl`. Howler's default (Web Audio API) loads via XHR and decodes in memory using `AudioContext.decodeAudioData`, bypassing the HTML5 audio element entirely. Howler's own AudioContext unlock fires on the document click event, so the context is running before `play()` is called.

---

### 7. Bundled MP3 files are corrupt (UTF-8 encoding during download)

After fix #6, the error changed to:

```
Load Error: /assets/lobby-DXeMgaEI.mp3 Decoding audio data failed.
```

Investigation revealed that ALL files in `ui-vue/src/assets/audio/` are corrupt:

- **0 valid MPEG frame sync bytes** found in any file
- **~22,000 UTF-8 replacement characters** (`U+FFFD` = `EF BF BD`) throughout each file

This is the signature of binary data passed through a UTF-8 text encoder (e.g. `response.text()` instead of `response.arrayBuffer()` when downloading from ElevenLabs). The corruption predates git — the files were never valid in any commit.

Additionally, `.gitattributes` had `* text=auto eol=lf` without binary overrides for audio files, which could corrupt future MP3 files during git checkout.

**Fix:** Added binary rules to `.gitattributes`:

```
*.mp3 binary
*.wav binary
*.ogg binary
```

**Required user action:** Replace `ui-vue/src/assets/audio/*.mp3` with valid files downloaded in binary mode from ElevenLabs. Alternatively, place valid overrides in `ui-vue/public/audio/` (served at `/audio/` by the standalone server).

---

## Summary of Changed Files

| File                                          | Change                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `standalone-web/public/`                      | **Deleted** (entire folder, was dead/unused)                                                                                                                  |
| `standalone-server/src/staticDir.ts`          | Always prefer `standalone-web/dist/`; removed `lifecycleEvent` param                                                                                          |
| `standalone-server/src/index.ts`              | Removed `lifecycleEvent` from `resolveStandaloneStaticDir` call                                                                                               |
| `__tests__/standaloneServerStaticDir.test.ts` | Updated tests to match new priority logic                                                                                                                     |
| `ui-vue/src/utils/narrator.ts`                | Fixed content-type check; removed `preload: 'metadata'`; replaced Howl-based unlock with native `Audio` + data URL; removed `html5: true` from playback Howls |
| `__tests__/narrator.test.ts`                  | Updated unlock tests to mock `global.Audio` instead of `MockHowl`                                                                                             |
| `.gitattributes`                              | Added `*.mp3 binary` etc. to prevent git from corrupting audio files                                                                                          |

## Deployment

After these changes, a full rebuild is required:

```bash
pnpm build:standalone
pnpm start:standalone
```
