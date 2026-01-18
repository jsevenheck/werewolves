# Werewolves Game Setup

## Requirements
- Node.js (>= 18)
- npm

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the app:
   ```bash
   npm run build
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open the app:
   - Visit `http://localhost:3001`

## Dev Mode
- Run the backend + Vite dev server together:
  ```bash
  npm run dev
  ```
- The Vite dev server runs at `http://localhost:5173` and proxies to the backend on `3001`.

## E2E Tests
```bash
npx playwright test
```

## Basic Flow
- Host configures role counts and starts the game.
- Everyone sees their private role in the role card.
- Players mark ready; host continues once everyone is ready.
- Armor links Lovers once, then night/day cycles begin.
- Host can skip a night action step if a player is offline or unresponsive.

## Troubleshooting
- If players cannot connect, ensure the host firewall allows inbound `3001` (or the `PORT` you set).
- If you see an empty page in production, confirm the Vite build output (`dist/client`) exists and the server is running.
- If a player refreshes, use the Resume button or stored session data to reconnect.
