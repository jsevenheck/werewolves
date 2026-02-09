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
- **Automatic CI/CD integration with [Game Hub](https://github.com/jsevenheck/game-hub)** - tests pass -> PR created automatically

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

The Vue client lives in the `ui-vue/` package. You can run only the client with:

```bash
pnpm -C ui-vue dev
```

## Development

**Type checking:**

```bash
pnpm run typecheck
```

**Linting & formatting:**

```bash
pnpm lint            # ESLint check (0 errors and 0 warnings required)
pnpm lint:fix        # Auto-fix fixable issues
pnpm format          # Prettier – rewrite all files in place
pnpm format:check    # Prettier – dry-run, exit 1 on diffs
```

ESLint 9 flat config lives in [`eslint.config.mjs`](eslint.config.mjs). Rules are split by environment:

- **Server** (`server/`, `standalone-server/`, `scripts/`) – Node.js globals, `require()` allowed.
- **Client** (`ui-vue/`, `standalone-web/`, `*.vue`) – Browser globals, Vue plugin rules.
- **Tests** (`__tests__/`, `e2e/`) – relaxed `any` and `require` rules.

Prettier config is in [`.prettierrc`](.prettierrc); enforced style: single quotes, 100-char width, LF line endings.

**Build:**

```bash
pnpm run build
```

This compiles the standalone server to `dist/standalone-server/` and builds the Vite client to `dist/client/`.

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

| Script              | What it does                                 |
| ------------------- | -------------------------------------------- |
| `pnpm dev`          | Server + Vite client together                |
| `pnpm build`        | Production build (server + client)           |
| `pnpm typecheck`    | `tsc` + `vue-tsc`                            |
| `pnpm lint`         | ESLint check                                 |
| `pnpm lint:fix`     | ESLint auto-fix                              |
| `pnpm format`       | Prettier rewrite                             |
| `pnpm format:check` | Prettier dry-run                             |
| `pnpm test`         | Jest unit tests                              |
| `pnpm test:e2e`     | Playwright E2E (auto-starts server + client) |

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
- In standalone mode the server also mounts `ui-vue/public/audio/` at `/audio`, so the standalone web build does not need its own audio copies.
- MP3 files are stored in git (AI-generated). Custom recordings can be placed in `ui-vue/public/audio/custom/` (not tracked by git) and will override the defaults.
- See `ui-vue/public/audio/README.md` for per-file meanings, audio variants, and custom audio override instructions.

## Docker

The Dockerfile uses a multi-stage build to compile TypeScript and bundle the client, then creates a production image with only runtime dependencies.
It is intended for the standalone build only; Game Hub uses its own build/container in the game-hub repository.
BuildKit cache mounts are enabled for pnpm so repeated builds are significantly faster.

```bash
docker build -t werewolves .
docker run --rm -p 3001:3001 werewolves
```

Note: The Docker image defaults to port 3001 (see `ENV PORT=3001`). Override with `-e PORT=<port>` if needed.

Troubleshooting:

- If you previously saw `Cannot find module .../ui-vue/node_modules/vue-tsc/bin/vue-tsc.js`, the root cause was that `ui-vue` is not a pnpm workspace package in this repo.
- The Dockerfile now installs `ui-vue` dependencies explicitly in the builder stage and sets `CI=true` so pnpm can run non-interactively in Docker.

## Project Docs

- Setup: `docs/setup.md`
- Data model + phase engine: `docs/spec.md`
- Manual tests: `docs/test-checklist.md`
- Codebase structure: `docs/structure.md`
- Adding roles: `docs/createNewRoles.md`
- Embedded vs standalone: `docs/embedded-and-standalone.md`

## Embedding / host integration notes

- The Vue client lives in `ui-vue/` and can be built as a library with:
  ```bash
  pnpm -C ui-vue build:lib
  ```
  This outputs UMD/ESM bundles to `ui-vue/dist-lib/`.
- The Socket.IO `path` must match between client and server unless a proxy rewrites it.
- Configuration options (direct `GameComponent` props or `app.provide` config):
  - `socketUrl` (default: same origin)
  - `socketPath` (default: `/socket.io`)
  - `assetsBasePath` (default: `/audio`)
- `standalone` (default: `true`, controls Landing vs auto-join flow and standalone styling)
- Game Hub passes these props to the Vue component after `party:gameStarted`:
  - `gameId` (used to choose `/g/<gameId>` namespace)
  - `sessionId` (used by `autoJoinRoom`; server maps it to an internal room code automatically)
  - `joinToken` (sent via Socket.IO handshake auth; also accepted as `token`)
  - `wsNamespace` (e.g. `/g/werewolves`)
  - `apiBaseUrl` (optional REST base URL)
  - Optional `playerId` from `localStorage.getItem('game-hub:player-id')`
  - Optional `playerName` – display name inside the game (falls back to `playerId`)
- Relative `assetsBasePath` values are resolved against Vite's base URL (`import.meta.env.BASE_URL`) for non-root deployments.

## Game Hub Integration

This repository automatically integrates with [Game Hub](https://github.com/jsevenheck/game-hub) via CI/CD. On pushes to `main` or `pre-main-vue`, the workflow runs tests, transforms the game into Game Hub's structure, and opens a PR automatically.
Game Hub gameId is `werewolves` (namespace `/g/werewolves`).

### How It Works

1. Push to `main` or `pre-main-vue` triggers the workflow
2. All tests run (typecheck, unit tests, E2E tests)
3. If tests pass, `scripts/transform-for-gamehub.js` transforms the game
4. A PR is created in the Game Hub repository with the transformed game

### Setup Requirements

To enable the integration, add a GitHub Personal Access Token (PAT) as a repository secret:

1. Create a PAT with `repo` and `workflow` permissions at [GitHub Settings -> Developer settings -> Personal access tokens](https://github.com/settings/tokens)
2. Add it as a secret named `GAMEHUB_PAT` in this repository's Settings -> Secrets and variables -> Actions

### Manual Transform

To test the transform locally without pushing:

```bash
node scripts/transform-for-gamehub.js
```

This creates `game-export/werewolves/` with `web/`, `server/`, and `shared/` packages matching Game Hub's layout.

**Note:** The transformed output is a template that requires manual adaptation for full Game Hub integration. See `game-export/werewolves/README.md` for the integration checklist.

### Hub Auto-Join Flow

When the game runs inside Game Hub (`standalone = false`), the client emits an `autoJoinRoom` event on connect instead of showing the Landing page. The server uses a `sessionId → roomCode` mapping to locate or create the room transparently:

1. Client connects and emits `autoJoinRoom({ sessionId, playerId, name })`.
2. Server checks `sessionId` → if a room already exists for this session it is reused; otherwise a new room is created and the mapping is stored.
3. The hub-supplied `playerId` is used directly, so Game Hub can correlate game state back to its own user records without a separate lookup.
4. On reconnect the client resumes via the stored `resumeToken`; no second room is created.

The `game-export/` directory (generated by the transform script) is git-ignored – it is a build artefact.
