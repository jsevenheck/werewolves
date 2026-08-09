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

### Local development

Create a `.env` file in the repo root (gitignored) — the server loads it
automatically on startup via Node's `process.loadEnvFile`:

```bash
# .env
WEREWOLVES_ADMIN_TOKEN=your-secret
PORT=3001
```

A `.env.example` template is committed; copy it to `.env` and fill in the
value. Then run `pnpm run dev` as usual. Alternatively set the var inline:

```bash
WEREWOLVES_ADMIN_TOKEN=your-secret pnpm run dev
```

If the env var is unset, admin endpoints are disabled and a one-shot warning
is logged at startup. The token is never logged.

### Production (Hostinger VPS via GitHub Actions)

The token is injected from a GitHub Secret — never commit it.

1. In the repo: Settings → Secrets and variables → Actions → New secret:
   name `WEREWOLVES_ADMIN_TOKEN`, value your secret.
2. The deploy workflow (`.github/workflows/deploy.yml`) passes it through to
   the VPS environment.
3. `docker-compose.yml` substitutes it into the container via
   `WEREWOLVES_ADMIN_TOKEN=${WEREWOLVES_ADMIN_TOKEN:-}` (empty/unset = admin
   disabled, no crash).

If you run the container manually on the VPS instead, set the var in a
`.env` next to `docker-compose.yml` or via the hPanel environment.

### Opening the console

Open `http://localhost:3001/?admin=1` (or your production URL with
`?admin=1`). Enter the token. It is stored in `localStorage`
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

- Built-in EN/DE MP3 files live under `ui-vue/src/assets/audio/` and are bundled
  by Vite with hashed asset URLs.
- Runtime custom overrides can be placed under `ui-vue/public/audio/` and are
  served as `/audio/<name>.mp3` when `assetsBasePath` is configured.
- Resolution checks the active locale, then English, then the silent fallback.
- Regenerate the reviewed German set with
  `uv run tools/generate-german-narrator.py` (requires `ffmpeg`).
- See `ui-vue/public/audio/README.md` for per-file descriptions and when each clip plays.

## Troubleshooting

- If players cannot connect, ensure the host firewall allows inbound `3001` (or the `PORT` you set).
- If you see an empty page in production, confirm the Vite build output (`dist/client`) exists and the server is running.
- If a player refreshes, use the Resume button or stored session data to reconnect.
