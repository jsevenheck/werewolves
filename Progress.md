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

**Fix:** Removed `preload: 'metadata'` from both `createUnlockHowl` and `createHowl` in `narrator.ts`. Howler's default (`preload: true`) loads the full audio before play, avoiding the race condition.

---

## Summary of Changed Files

| File | Change |
|------|--------|
| `standalone-web/public/` | **Deleted** (entire folder, was dead/unused) |
| `standalone-server/src/staticDir.ts` | Always prefer `standalone-web/dist/`; removed `lifecycleEvent` param |
| `standalone-server/src/index.ts` | Removed `lifecycleEvent` from `resolveStandaloneStaticDir` call |
| `__tests__/standaloneServerStaticDir.test.ts` | Updated tests to match new priority logic |
| `ui-vue/src/utils/narrator.ts` | Fixed content-type check; removed `preload: 'metadata'` |

## Deployment

After these changes, a full rebuild is required:

```bash
pnpm build:standalone
pnpm start:standalone
```
