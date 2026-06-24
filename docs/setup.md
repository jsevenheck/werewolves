# Werewolves Game Setup

## Requirements

- Node.js (>= 24)
- pnpm (via Corepack or standalone install)

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Build the app:

   ```bash
   pnpm run build
   ```

3. Start the server:

   ```bash
   pnpm start
   ```

4. Open the app:
   - Visit `http://localhost:3001`

## Dev Mode

- Run the backend + Vite dev server together:
  ```bash
  pnpm run dev
  ```
- The Vite dev server runs at `http://localhost:5173` and proxies to the backend on `3001`.
- Running the server alone is not equivalent to running the client dev server.
- Run only the client:
  ```bash
  pnpm -C ui-vue dev
  ```

## Production Build & Static Hosting

- The Vite client build outputs to `dist/client/`.
- The server serves built assets via `express.static`.

## E2E Tests

```bash
pnpm exec playwright install  # First time only
pnpm run test:e2e
```

## Basic Flow

- Host configures role counts and starts the game.
- Everyone sees their private role in the role card.
- Players mark ready; host continues once everyone is ready.
- Armor links Lovers once, then night/day cycles begin.
- Host can skip the armor step or a night action step if a player is offline or unresponsive.
- If the host disconnects, another connected player becomes the acting host until the original host reconnects.
- Players can switch between English and German via the language switcher in
  the game header, on the landing page, and on the admin console.

## Admin Console

The server can expose a global admin console for operators (read-only room
observation + emergency kick). It is disabled by default.

1. Set the admin token on the server:

   ```bash
   WEREWOLVES_ADMIN_TOKEN=your-secret pnpm start
   ```

   If the env var is unset, admin endpoints are disabled and a one-shot warning
   is logged at startup. The token is never logged.

2. Open the admin console at `http://localhost:3001/?admin=1` (or your
   production URL with `?admin=1`).

3. Enter the token. The token is stored in `localStorage`
   (`werewolves_admin_token`) and sent only in the Socket.IO handshake.

The admin console can:

- list all active rooms (sanitized; no roles/votes leak),
- drill into a room's player list and kick any player in any phase,
- join a room as a read-only observer and watch live, sanitized state
  (roles and private state are hidden).

Hosts can also perform mid-game kicks from the in-game host side panel. The
first mid-game kick requires the admin token; if the host has not set it yet,
they are prompted to open the admin page once to store it.

## Narrator Audio

- Place MP3 files in `ui-vue/public/audio/` (served at runtime as `/audio/<name>.mp3`).
- Vite serves files from `ui-vue/public/` at `/` during development and copies them into the build output.
- The narrator looks up files by key and falls back to a silent placeholder if missing.
- See `ui-vue/public/audio/README.md` for per-file descriptions and when each clip plays.

## Troubleshooting

- If players cannot connect, ensure the host firewall allows inbound `3001` (or the `PORT` you set).
- If you see an empty page in production, confirm the Vite build output (`dist/client`) exists and the server is running.
- If a player refreshes, use the Resume button or stored session data to reconnect.
