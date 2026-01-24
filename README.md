# Werewolves (Moderator-Free Mafia)

Run a multiplayer Werewolf/Mafia party game in the browser with no human moderator. Players join from their own devices and the app enforces all phases, actions, and win conditions.

## Features
- Lobby with join code and host role configuration.
- Private roles per device, werewolf team awareness, and lover linking.
- Day/night phases with voting and role actions.
- Joker instant win on day vote; Hunter shot on death.
- Reconnect support and mobile-friendly UI.
- Acting host handoff on disconnect, plus skip controls for blocked armor/night steps.
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
2. Host configures role counts and minimum players, then starts the game.
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
docker run --rm -p 3000:3000 werewolves
```

Note: The Docker image defaults to port 3000. Override with `-e PORT=3001` if needed.

## Project Docs
- Setup: `docs/setup.md`
- Data model + phase engine: `docs/spec.md`
- Manual tests: `docs/test-checklist.md`
- Codebase structure: `docs/structure.md`
- Adding roles: `docs/roles.md`
