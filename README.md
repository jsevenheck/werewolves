# Werewolves (Moderator-Free Mafia)

Run a multiplayer Werewolf/Mafia party game in the browser with no human moderator. Players join from their own devices and the app enforces all phases, actions, and win conditions.

## Features
- Lobby with join code and host role configuration.
- Private roles per device, werewolf team awareness, and lover linking.
- Day/night phases with voting and role actions.
- Joker instant win on day vote; Hunter shot on death.
- Mayor election with tie-breaking and succession on death.
- Reconnect support and mobile-friendly UI.
- Acting host handoff on disconnect, plus skip controls for blocked armor/night steps.
- Automatic timeouts (60s) for hunter shots and mayor succession to prevent game stalls.
- Automatic room cleanup (24h idle, 1h after game ends) to prevent memory leaks.
- Full TypeScript codebase with type-safe Socket.IO events and shared types.
- Vite-powered client development with hot module replacement.

## Quick Start

**Production mode:**
```bash
pnpm install
pnpm run build
pnpm start
```

Open `http://localhost:3001` (or set `PORT` for another port).

**Development mode** (with hot reload):
```bash
pnpm install
pnpm run dev
```

This runs the backend server on port 3001 and Vite dev server on port 5173 with automatic proxy configuration. Open `http://localhost:5173` for development.

## Dev workflow

- Run `pnpm run dev` from the repo root to start **both** the server and the Vite client.
- The Vite dev server serves the client on port 5173 and proxies to the server on port 3001.
- Running the server alone (e.g. `pnpm run dev:server` or `pnpm start`) is **not** equivalent to running the client dev server.

The Vue client lives in the `ui-vue/` package (pnpm workspace). You can run only the client with:
```bash
pnpm --filter werewolves-ui-vue dev
```

## Development

**Type checking:**
```bash
pnpm run typecheck
```

**Build:**
```bash
pnpm run build
```

This compiles the TypeScript server code to `dist/` and builds the Vite client to `dist/client/`.

## Production build & static hosting

- The client build output goes to `dist/client/` (from Vite `outDir`).
- The server serves built assets via `express.static` pointing at the built client directory.
- As a result, `/audio/*` is available in production once the client is built and audio files exist in the build output.

## Tests

**Unit tests:**
```bash
pnpm test
```

**End-to-end tests:**
```bash
pnpm exec playwright install
pnpm run test:e2e
```

## Workspace scripts
- `pnpm dev`: runs server + client together.
- `pnpm build`: builds server + client for production.
- `pnpm test`: runs unit tests.
- `pnpm test:e2e`: runs Playwright. The Playwright config starts the server (`tsx server.ts`) and the client package (`pnpm --filter werewolves-client dev`).

## How to Play
1. Host creates a room and shares the 4-letter code.
2. Host configures role counts, then starts the game (minimum 5 players required).
3. Players see their private role on their device and click Ready.
4. Host continues once everyone is ready.
5. Armor links Lovers once, then night/day cycles begin.

## Narrator Audio Files

Mobile browsers require a user gesture before audio can play. If a player enables the narrator and sees "Tap to enable audio," they must tap once to unlock playback (browser autoplay policy requirement).

- Canonical location: `ui-vue/public/audio/`
- Runtime URL expectation: `/audio/<name>.mp3`
- Vite serves files in `ui-vue/public/` at `/` during development and copies them into the build output as-is (so `ui-vue/public/audio/*.mp3` becomes `dist/client/audio/*.mp3`).
- MP3 files are stored in git (AI-generated). Custom recordings can be placed in `ui-vue/public/audio/custom/` (not tracked by git) and will override the defaults.
- See `ui-vue/public/audio/README.md` for per-file meanings, audio variants, and custom audio override instructions.

## Docker

The Dockerfile uses a multi-stage build to compile TypeScript and bundle the client, then creates a production image with only runtime dependencies.

```bash
docker build -t werewolves .
docker run --rm -p 3001:3001 werewolves
```

Note: The Docker image defaults to port 3000. Override with `-e PORT=3001` if needed.

## Project Docs
- Setup: `docs/setup.md`
- Data model + phase engine: `docs/spec.md`
- Manual tests: `docs/test-checklist.md`
- Codebase structure: `docs/structure.md`
- Adding roles: `docs/createNewRoles.md`

## Embedding / host integration notes

- The Vue client lives in `ui-vue/` and can be built as a library with:
  ```bash
  pnpm --filter werewolves-ui-vue build:lib
  ```
  This outputs UMD/ESM bundles to `ui-vue/dist-lib/`.
- The Socket.IO `path` must match between client and server unless a proxy rewrites it.
- Configuration options (when embedding via `installWerewolvesGame`):
  - `socketUrl` (default: same origin)
  - `socketPath` (default: `/socket.io`)
  - `assetsBasePath` (default: `/audio`)
  - `standalone` (default: `true`)
- Relative `assetsBasePath` values are resolved against Vite's base URL (`import.meta.env.BASE_URL`) for non-root deployments.

## Migration / removal caveat

- The legacy vanilla frontend has been removed; there is no parallel fallback client.
- Correctness now relies on tests and E2E coverage:
  - `pnpm run typecheck`
  - `pnpm test`
  - `pnpm run test:e2e`
- If a future migration needs a fallback, it must reintroduce a parallel client directory.
