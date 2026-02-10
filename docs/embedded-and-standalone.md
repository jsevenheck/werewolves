# Embedded and Standalone Modes

This document explains how the Werewolves game can run in two modes.

1. Embedded mode: as a game plugin inside the Game Hub platform.
2. Standalone mode: as an independent web application.

## Architecture Overview

- `core/src`: shared types, events, constants
- `server/src`: Socket.IO handlers and game logic (embedded)
- `ui-vue/src`: Vue UI and Pinia stores (embedded)
- `standalone-server/src`: thin wrapper for standalone server
- `standalone-web/src`: thin wrapper for standalone web client

## Export Contracts

### ui-vue exports

File: `ui-vue/src/index.ts`

```ts
export const manifest = {
  id: 'werewolves',
  title: 'Werewolves',
  minPlayers: 5,
  maxPlayers: 20,
} as const;

export const GameComponent = WerewolvesGameRoot;

export type { GameComponentProps, HubIntegrationProps } from './types/config';
```

**GameComponent Props:**

| Prop             | Type      | Required            | Description                                                                                        |
| ---------------- | --------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| `playerId`       | `string`  | optional            | Stable platform player id – used directly as the in-game ID when present                           |
| `playerName`     | `string`  | optional            | Display name shown in-game; falls back to `playerId` when omitted                                  |
| `sessionId`      | `string`  | required (embedded) | Platform session ID – triggers `autoJoinRoom`; server maps it to an internal room code             |
| `joinToken`      | `string`  | required (embedded) | Auth token for Socket.IO handshake (also accepted as `token`, stored but not enforced server-side) |
| `wsNamespace`    | `string`  | required (embedded) | Namespace path, e.g. `/g/werewolves`                                                               |
| `apiBaseUrl`     | `string`  | optional            | Base URL for REST calls                                                                            |
| `socketUrl`      | `string`  | optional            | Socket.IO server URL (default: same origin)                                                        |
| `socketPath`     | `string`  | optional            | Socket.IO path (default: `/socket.io`)                                                             |
| `assetsBasePath` | `string`  | optional            | Custom audio path for overrides (default: uses bundled audio)                                      |
| `standalone`     | `boolean` | optional            | `true` → Landing page (create/join UI); `false` + `sessionId` → `autoJoinRoom` fires automatically |

**Usage in Game Hub:**

Game Hub emits `party:gameStarted` with `{ gameId, sessionId, wsNamespace, joinToken }`.
The host UI passes these props into the game component:

- `gameId` (string, Game Hub internal identifier)
- `sessionId` (string, triggers `autoJoinRoom`; server maps it to an internal room code)
- `joinToken` (string, per-player auth token)
- `wsNamespace` (string, `/g/<gameId>`)
- `apiBaseUrl` (string, optional REST base URL)
- Optional `playerId` from `localStorage.getItem('game-hub:player-id')` – used directly as the in-game player ID
- Optional `playerName` (string) for in-game display
- Optional `socketUrl` (string) when Socket.IO is served from a different origin/base path

Once `standalone=false` and `sessionId` are present the component skips the Landing
page and emits `autoJoinRoom` automatically on connect.

### server exports

File: `server/src/index.ts`

```ts
export const definition: GameDefinition;
export function register(io: Server, namespace?: string): Namespace;
export const handler: { definition: GameDefinition; register: typeof register };
export function registerWerewolf(io: Server, namespace?: string): Namespace;
```

**Usage (standalone or manual host):**

```ts
import { registerWerewolf } from '../server/src/index';

// Attaches handlers to /g/werewolves
registerWerewolf(io, '/g/werewolves');
```

## Socket.IO Namespace Design

- The game uses a dedicated namespace `/g/werewolves` (not the root `/`).
- Game Hub convention is `/g/<gameId>`.
- Room names are scoped per namespace.

Namespace middleware (auth):

```ts
nsp.use((socket, next) => {
  const { joinToken, token, sessionId, playerId } = socket.handshake.auth as {
    joinToken?: string;
    token?: string;
    sessionId?: string;
    playerId?: string;
  };
  socket.data.sessionId = sessionId ?? null;
  socket.data.joinToken = joinToken ?? token ?? null;
  socket.data.playerId = playerId ?? null;
  next();
});
```

## Authentication Flow

### Embedded mode (Game Hub)

Party creation/join and lobby live on `/platform`; the game only connects to `/g/<gameId>`.

1. Platform issues `joinToken` (per player) and `sessionId` (shared) on `party:gameStarted`.
2. Client connects: `io(wsNamespace, { auth: { token, joinToken, sessionId, playerId } })`.
3. Namespace middleware stores auth data on `socket.data`.
4. Client emits `autoJoinRoom({ sessionId, playerId, name })` – the server either
   creates a new room and persists a `sessionId → roomCode` mapping, or reuses
   the existing room if one was already linked to this `sessionId`.
5. The hub-supplied `playerId` is stored directly as the player's in-game ID, so the
   platform can correlate game state back to its user records without an extra lookup.
6. Reconnects use the `resumeToken` that was returned by `autoJoinRoom`; no second
   room is created.
7. If auto-join fails or state load times out, the UI shows an error with a `Retry`
   button so the player can reconnect without a full page reload.

### Standalone mode

1. Player creates or joins a room via UI (room code flow).
2. Server issues `resumeToken` on join.
3. Client stores `resumeToken` in localStorage.
4. On reconnect, client sends `resumePlayer` with `resumeToken`.

## Narrator Audio

**Built-in audio is bundled with the web component** (as of the bundled audio update):

- All narrator audio files are imported and bundled at build time (`ui-vue/src/assets/audio/`)
- Works out-of-the-box in all environments without requiring host-served static files
- No need for Game Hub or host platforms to copy/serve `public/audio/` files
- Eliminates dependency on absolute `/audio/...` paths

**Custom audio overrides (optional):**

- Pass `assetsBasePath` prop pointing to your custom audio directory
- Narrator will look for custom audio at `${assetsBasePath}/custom/${key}.mp3` (with variants)
- Falls back to `${assetsBasePath}/${key}.mp3`, then bundled audio, then silent fallback
- Supports variant discovery (e.g., `custom/day_1.mp3`, `custom/day_2.mp3`, etc.)

**Fallback chain:**

1. Custom variants from `${assetsBasePath}/custom/${key}_N.mp3` (if provided)
2. Default override from `${assetsBasePath}/${key}.mp3`
3. Bundled audio (always available)
4. Silent audio data URL (last resort)

This approach ensures narrator audio works in Game Hub production builds without manual setup.

## Standalone Wrappers

### standalone-server

File: `standalone-server/src/index.ts`

A thin wrapper that:

1. Creates Express + HTTP server
2. Creates Socket.IO server
3. Calls `registerWerewolf(io)`
4. Serves static files (built client or dev fallback)
5. Provides health endpoint (`/health`)
6. Handles server listen errors (e.g. `EADDRINUSE`)
7. Graceful shutdown on `SIGTERM`/`SIGINT` (closes Socket.IO → HTTP, 10s force-exit timeout)

**Audio:** `standalone-web/src/main.ts` sets `assetsBasePath: '/audio'` by default.
Runtime order is `/audio/custom/*` -> `/audio/*` -> bundled audio -> silent.
If `/audio` files are missing, bundled audio is still used automatically.

### standalone-web

File: `standalone-web/src/main.ts`

A thin Vite app that:

1. Creates Vue app instance
2. Installs Pinia (required)
3. Renders `GameComponent` with standalone props

## Running Standalone Locally

```bash
pnpm install
pnpm -C standalone-server install
pnpm -C standalone-web install

pnpm run dev:standalone-server
pnpm run dev:standalone-web
```

## Game Hub Integration

Game Hub expects games under `games/<gameId>/{web,server,shared}`. This repo integrates
via `scripts/transform-for-gamehub.js`, which generates `game-export/werewolves/` in
that structure.

### Transform Script Output

The transform script creates:

- **web/**: Vue components + bundled assets
  - `src/` - UI components with bundled audio (copied from `ui-vue/src/`)
  - `package.json` - includes `pinia`, `howler`, and `@types/howler` dependencies
  - Note: Narrator audio is bundled at build time (~2.3 MB total), not copied to public/
- **server/**: Socket.IO handlers
  - `src/` - Game logic (copied from `server/src/`)
  - `tsconfig.build.json` - tsup-compatible config (`composite: false`)
  - `tsup.config.ts` - builds to ESM
- **shared/**: TypeScript types and constants
  - `src/` - Shared contracts (copied from `core/src/`)
  - `package.json` - includes subpath `exports` for `/events`, `/types`, `/constants`
  - `tsconfig.build.json` - tsup-compatible config (`composite: false`)
  - `tsup.config.ts` - builds multiple entry points for subpath imports

### Recommended flow

1. Run `node scripts/transform-for-gamehub.js` (CI does this after tests).
2. Copy `game-export/werewolves` into the Game Hub repo at `games/werewolves/`.
3. The transform rewrites `@shared/*` and `core/src/*` imports to `@game-hub/werewolves-shared/*`.
   - Supports both regular imports (`from '@shared/types'`) and TypeScript inline imports (`import('@shared/types')`)
   - Supports subpath imports: `@game-hub/werewolves-shared/events`, `/types`, `/constants`
4. Update `web/src/Werewolves.vue` to mount `GameComponent` and pass Game Hub props
   (`sessionId`, `joinToken`, `wsNamespace`, `apiBaseUrl`) plus optional
   `playerId` (from localStorage), `playerName`, and `socketUrl`.
   - Generated wrapper default: `assetsBasePath = '/audio'` (runtime custom overrides with bundled fallback).
5. `sessionId` → room mapping is handled automatically: the server's `autoJoinRoom`
   handler creates or reuses a room keyed by `sessionId`, and accepts the hub-supplied
   `playerId` directly – no manual mapping step required.
6. Ensure the server package registers `register(io, namespace)` (or `registerWerewolf(io)`) under `/g/<gameId>`.
7. Update `shared/src/*` imports to `@game-hub/contracts` if needed.
8. Register the game in the server registry (`apps/platform-server/src/games/registry.ts`).
9. Register the game in the web registry (`apps/platform-web/src/gameRegistry.ts`).

### Notes

1. `register(io, '/g/werewolves')` attaches to the game namespace.
2. `game-export/` is git-ignored; it is regenerated by the transform script on every CI run.
3. Game Hub emits `party:gameStarted` with `{ gameId, sessionId, wsNamespace, joinToken }`.
4. Narrator audio files are bundled with the web component at build time (~2.3 MB total).

## Gotchas and Best Practices

### Warning: Duplicate Vue/Pinia instances

Problem: If ui-vue bundles its own Vue or creates its own Pinia, state won't sync with the hub.

Solution:

- `vite.lib.config.ts` externalizes `vue` and `pinia`.
- ui-vue never calls `createPinia()` or `createApp()`.
- Hub app installs Pinia before rendering GameComponent.

### Warning: socket.id instability

Problem: `socket.id` changes on every reconnect.

Solution:

- `joinToken` (or `token`) is sent via handshake but is not enforced server-side today.
- Store `resumeToken` in localStorage for reconnection.
- Server identifies returning players via `resumeToken` (and `playerId` in embedded mode), not socket.id.

### Warning: Handshake auth timing

Correct:

```ts
io(namespace, { auth: { token, joinToken, sessionId, playerId } });
```

Wrong:

```ts
socket.emit('auth', { joinToken });
```

### Warning: Namespace vs root

Correct:

```ts
const nsp = io.of('/g/werewolves');
nsp.on('connection', handler);
```

Wrong:

```ts
io.on('connection', handler);
```

### Warning: Room scoping

Room "game-123" in `/g/werewolves` is separate from room "game-123" in `/g/othergame`.

### Note: SessionId vs room code

Game logic still uses 4-letter room codes internally. In embedded mode the
`autoJoinRoom` handler maintains a `sessionId → roomCode` map in memory so that
every player in the same platform session lands in the same room without needing to
know the code. The map is cleaned up automatically when the room is deleted.

### Warning: playerId is required for reconnection in embedded mode

`autoJoinRoom` identifies returning players by looking up `playerId` in the room's
player map. If the platform does **not** supply a `playerId`, the server has no way
to match the incoming request to an existing player — it will always treat the
connection as a new player and create a duplicate slot (blocked only by the lobby
phase and duplicate-name checks).

Game Hub provides `playerId` via `localStorage` (`game-hub:player-id`); make sure
that value is passed through as the `playerId` prop whenever `autoJoinRoom` is the
expected join path.
