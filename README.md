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

## How to Play
1. Host creates a room and shares the 4-letter code.
2. Host configures role counts, then starts the game (minimum 5 players required).
3. Players see their private role on their device and click Ready.
4. Host continues once everyone is ready.
5. Armor links Lovers once, then night/day cycles begin.

## Narrator Audio (Mobile-Friendly)
Mobile browsers require a user gesture before audio can play. If a player enables the narrator and sees "Tap to enable audio," they must tap once to unlock playback (this is a browser autoplay policy requirement).

Audio files are loaded by key using `/audio/<narrationKey>.mp3` (HTML5 Howler playback). The narrator expects externally provided assets, so you can supply them without committing binaries by:
- Adding files locally in `client/public/audio/` for development.
- Copying or mounting audio files into the built app's `/audio/` directory at deploy time.
- Serving `/audio/` from a CDN or asset pipeline routed by your web server.

Narration keys map to filenames as follows:
For per-file meanings and when each clip plays, see `client/public/audio/README.md`.
- `phaseTransition` values (e.g. `dayToNight`, `nightToDay`) -> `/audio/<phaseTransition>.mp3`
- Night steps (e.g. `wolves`, `seer`) -> `/audio/night_<step>.mp3`
- Phases (e.g. `day`, `night`, `lobby`) -> `/audio/<phase>.mp3`

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

## Vue Client (Embeddable)

A Vue 3 + Pinia client is available in `client-vue/`. It is designed to be embeddable in other Vue applications (e.g. Game Hub).

**Development:**
```bash
pnpm run dev:client-vue
```
Runs Vue dev server on port 5174.

**Build for Library:**
```bash
pnpm run build:client-vue
```
Outputs UMD/ESM bundles to `client-vue/dist/`.

**E2E Tests:**
```bash
pnpm run test:e2e:vue
```
Runs Playwright tests against the Vue client.

**Embedding usage:**
```typescript
import { installWerewolvesGame } from 'werewolves-game-vue';
import 'werewolves-game-vue/dist/style.css'; // if applicable

app.use(installWerewolvesGame, {
  socketUrl: 'https://your-server.com',
  socketPath: '/socket.io',
  assetsBasePath: '/audio',
  standalone: false
});
```

**Configuration Props:**
- `socketUrl`: URL of the backend server (default: same origin)
- `socketPath`: Socket.IO path (default: `/socket.io`)
- `assetsBasePath`: Base path for audio files (default: `/audio`)
- `standalone`: If true, applies full page styling. If false (embed mode), avoids polluting global styles (default: `true`).
