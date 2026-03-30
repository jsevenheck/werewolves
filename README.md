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
pnpm format          # Prettier â€“ rewrite all files in place
pnpm format:check    # Prettier â€“ dry-run, exit 1 on diffs
```

ESLint 9 flat config lives in [`eslint.config.mjs`](eslint.config.mjs). Rules are split by environment:

- **Server** (`server/`, `scripts/`) â€“ Node.js globals, `require()` allowed.
- **Client** (`ui-vue/`, `*.vue`) â€“ Browser globals, Vue plugin rules.
- **Tests** (`__tests__/`, `e2e/`) â€“ relaxed `any` and `require` rules.

Prettier config is in [`.prettierrc`](.prettierrc); enforced style: single quotes, 100-char width, LF line endings.

**Build:**

```bash
pnpm run build
```

This compiles the server to `dist/server/` and builds the Vite client to `dist/client/`.

## Production build & static hosting

- The client build output goes to `dist/client/` (from Vite `outDir`).
- The server serves built assets via `express.static` pointing at the built client directory.
- Built-in narrator clips are bundled into `dist/client/assets/*.mp3` (hashed asset URLs).
- Optional runtime custom overrides can be served from `/audio` (for example `public/audio/custom/*.mp3`).

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
| `pnpm test`         | Vitest unit tests                            |
| `pnpm test:e2e`     | Playwright E2E (auto-starts server + client) |

## How to Play

1. Host creates a room and shares the 4-letter code.
2. Host configures role counts, then starts the game (minimum 5 players required).
3. Players see their private role on their device and click Ready.
4. Host continues once everyone is ready.
5. Armor links Lovers once, then night/day cycles begin.

## Narrator Audio Files

Mobile browsers require a user gesture before audio can play. If a player enables the narrator and sees "Tap to enable audio," they must tap once to unlock playback (browser autoplay policy requirement).

**Bundled Audio (Default):**

- Built-in narrator audio is bundled with the web component at build time (stored in `ui-vue/src/assets/audio/`)
- Vite automatically imports and bundles the MP3 files as assets
- Works out-of-the-box without requiring separately hosted static files
- No configuration needed - audio just works

**Custom Audio (Optional):**

- To use custom narrator audio, configure the `assetsBasePath` option
- Custom audio files should be placed in a `custom/` subdirectory (e.g., `/audio/custom/day_1.mp3`)
- Fallback chain: custom audio (`${assetsBasePath}/custom/*`) â†’ default override (`${assetsBasePath}/*`) â†’ bundled audio â†’ silent
- Supports audio variants for variety (e.g., `custom/day_1.mp3`, `custom/day_2.mp3`)
- See `ui-vue/public/audio/README.md` for detailed instructions, file naming conventions, and per-file descriptions

## Docker

The Dockerfile uses a multi-stage build to compile TypeScript and bundle the client, then creates a production image with only runtime dependencies.
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
