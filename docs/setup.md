# Werewolves Game Setup

## Requirements
- Node.js (>= 18)
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

## Narrator Audio
- Place MP3 files in `client/public/audio/` (served as `/audio/*.mp3`).
- The narrator looks up files by key and falls back to a silent placeholder if missing.
- Expected keys:
  - `lobby.mp3` (also used for the initial audio unlock)
  - `roleReveal.mp3`
  - `armor.mp3`
  - `day.mp3`
  - `night.mp3`
  - `ended.mp3`
  - `night_wolves.mp3`
  - `night_seer.mp3`
  - `night_witch.mp3`
  - `night_resolve.mp3`
  - `night_transition.mp3`
  - `postReveal.mp3`
  - `postArmor.mp3`
  - `nightToDay.mp3`
  - `dayToNight.mp3`

## Troubleshooting
- If players cannot connect, ensure the host firewall allows inbound `3001` (or the `PORT` you set).
- If you see an empty page in production, confirm the Vite build output (`dist/client`) exists and the server is running.
- If a player refreshes, use the Resume button or stored session data to reconnect.
