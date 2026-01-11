# Werewolves (Moderator-Free Mafia)

Run a multiplayer Werewolf/Mafia party game in the browser with no human moderator. Players join from their own devices and the app enforces all phases, actions, and win conditions.

## Features
- Lobby with join code and host role configuration.
- Private roles per device, werewolf team awareness, and lover linking.
- Day/night phases with voting and role actions.
- Joker instant win on day vote; Hunter shot on death.
- Reconnect support and mobile-friendly UI.

## Quick Start
```bash
npm install
npm start
```

Open `http://localhost:3001` (or set `PORT` for another port).

## How to Play
1. Host creates a room and shares the 4-letter code.
2. Host configures role counts and minimum players, then starts the game.
3. Players see their private role on their device and click Ready.
4. Host continues once everyone is ready.
5. Armor links Lovers once, then night/day cycles begin.

## Docker
```bash
docker build -t werewolves .
docker run --rm -p 3001:3001 werewolves
```

## Project Docs
- Setup: `docs/setup.md`
- Data model + phase engine: `docs/spec.md`
- Manual tests: `docs/test-checklist.md`
- Codebase structure: `docs/structure.md`
