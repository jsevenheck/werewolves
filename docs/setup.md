## Setup

### Prereqs
- Node.js 18+ (includes npm).
- A modern browser for each player device on the same LAN.

### Install
```bash
npm install
```

### Run
```bash
npm start
```

Server starts at `http://localhost:3001` by default.

If port 3001 is busy, set another port:
```bash
$env:PORT=3000
npm start
```

Then open `http://localhost:3000`.

### Tests
Unit/UI tests:
```bash
npm test
```

End-to-end tests:
```bash
npx playwright install
npm run test:e2e
```

### Docker
Build:
```bash
docker build -t werewolves .
```

Run:
```bash
docker run --rm -p 3001:3001 werewolves
```

If port 3001 is busy, map a different host port:
```bash
docker run --rm -p 3000:3001 werewolves
```

Then open `http://localhost:3000`.

### Play From Other Devices
1. Find the host machine LAN IP (e.g. `ipconfig` on Windows).
2. Open `http://<HOST_IP>:3001` on each phone/laptop (or the `PORT` you set).
3. Host creates a lobby and shares the 4-letter room code.

### Basic Flow
- Host configures role counts and starts the game.
- Everyone sees their private role in the role card.
- Players mark ready; host continues once everyone is ready.
- Armor links Lovers once, then night/day cycles begin.
- Host can skip a night action step if a player is offline or unresponsive.

### Troubleshooting
- If players cannot connect, ensure the host firewall allows inbound `3001` (or the `PORT` you set).
- If you see an empty page, confirm `public/` is being served and that the server is running.
- If a player refreshes, use the Resume button or stored session data to reconnect.
