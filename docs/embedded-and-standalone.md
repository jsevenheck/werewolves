# Embedded and Standalone Modes

This document explains how the Werewolves game can run in two modes:

1. **Embedded mode** - as a game plugin inside the Game Hub platform
2. **Standalone mode** - as an independent web application

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Export Contracts](#export-contracts)
  - [ui-vue exports (manifest + GameComponent)](#ui-vue-exports)
  - [server exports (registerWerewolf)](#server-exports)
- [Socket.IO Namespace Design](#socketio-namespace-design)
- [Authentication Flow](#authentication-flow)
- [Standalone Wrappers](#standalone-wrappers)
  - [standalone-server](#standalone-server)
  - [standalone-web](#standalone-web)
- [Running Standalone Locally](#running-standalone-locally)
- [Game Hub integration](#game-hub-integration)
- [Gotchas and Best Practices](#gotchas-and-best-practices)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         Shared Core                              │
│  core/src/                                                       │
│    ├── types.ts      (Role, Phase, Player, Room, etc.)          │
│    ├── events.ts     (Socket.IO event contracts)                 │
│    └── constants.ts  (timing constants, MIN_PLAYERS)            │
└──────────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   server/src/   │ │   ui-vue/src/   │ │  (game-hub)     │
│                 │ │                 │ │                 │
│ registerWerewolf│ │ GameComponent   │ │ Calls register  │
│ (namespace      │ │ manifest        │ │ Renders comp    │
│  plugin)        │ │                 │ │                 │
└────────┬────────┘ └────────┬────────┘ └─────────────────┘
         │                   │
         ▼                   ▼
┌─────────────────────────────────────────┐
│         Standalone Wrappers             │
│  (THIN layers for local development)    │
│                                         │
│  standalone-server/   standalone-web/   │
│  └── starts HTTP      └── Vite app      │
│      + Socket.IO          mounts        │
│      + calls              GameComponent │
│      registerWerewolf     + Pinia       │
└─────────────────────────────────────────┘
```

---

## Export Contracts

### ui-vue exports

**File:** `ui-vue/src/index.ts`

```typescript
// Game manifest – metadata for the platform
export const manifest = {
  id: 'werewolf',
  title: 'Werewolves',
  minPlayers: 5,
  maxPlayers: 20,
} as const;

// Primary Vue component
export const GameComponent = WerewolvesGameRoot;

// Types for props
export type { GameComponentProps, HubIntegrationProps } from './types/config';
```

**GameComponent Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `sessionId` | `string` | ✓ (embedded) | Platform session ID, used for socket room grouping (game logic still uses room codes unless adapted) |
| `joinToken` | `string` | ✓ (embedded) | Auth token for Socket.IO handshake |
| `wsNamespace` | `string` | ✓ (embedded) | Namespace path, e.g. `/g/werewolf` |
| `apiBaseUrl` | `string` | ○ | Base URL for REST calls |
| `socketUrl` | `string` | ○ | Socket.IO server URL (default: same origin) |
| `socketPath` | `string` | ○ | Socket.IO path (default: `/socket.io`) |
| `assetsBasePath` | `string` | ○ | Audio assets path (default: `/audio`) |
| `standalone` | `boolean` | ○ | Currently affects styling only; create/join UI is still shown unless you customize it |

**Usage in Game Hub:**

Game Hub renders the game component and passes these props:
- `gameId` (string, Game Hub internal identifier)
- `sessionId` (string, used for socket room grouping; game logic still uses room codes unless adapted)
- `joinToken` (string, per-player auth token)
- `wsNamespace` (string, `/g/<gameId>`)
- `apiBaseUrl` (string, optional REST base URL)

This component consumes `sessionId`, `joinToken`, `wsNamespace`, and `apiBaseUrl`. `gameId` is passed by the platform but not used by the component.

### server exports

**File:** `server/src/index.ts`

```typescript
import type { Server } from 'socket.io';

/**
 * Register the Werewolf game as a Socket.IO namespace plugin.
 * Call this once at server startup.
 */
export function registerWerewolf(io: Server): Namespace;
```

**Usage (standalone or manual host):**

```typescript
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerWerewolf } from '../server/src/index';

const httpServer = createServer(app);
const io = new Server(httpServer);

// Attaches handlers to /g/werewolf
registerWerewolf(io);

httpServer.listen(3000);
```

---

## Socket.IO Namespace Design

The game uses a dedicated namespace `/g/werewolf` (not the root `/`). Game Hub
convention is `/g/<gameId>`, so `gameId = werewolf` maps to `/g/werewolf`.
The legacy standalone server also registers handlers on the root namespace `/`
to support the `ui-vue` dev server when `wsNamespace` is not provided.

**Why namespaces?**

- Multiple games share one Socket.IO server
- Each game has isolated event handlers
- Room names are scoped per namespace
- Middleware can be namespace-specific

**Namespace middleware (auth):**

```typescript
nsp.use((socket, next) => {
  const { joinToken, sessionId } = socket.handshake.auth as {
    joinToken?: string;
    sessionId?: string;
  };
  // Default implementation stores auth data but does not validate it.
  socket.data.sessionId = sessionId ?? null;
  socket.data.joinToken = joinToken ?? null;
  next();
});
```
If you need strict auth, add validation in this middleware (for example, verify the join token against the Game Hub platform token service).

---

## Authentication Flow

### Embedded mode (Game Hub)

1. Platform authenticates user and starts a game session for the party
2. Platform issues a per-player `joinToken` and a shared `sessionId`
3. Client receives `{ gameId, sessionId, wsNamespace, joinToken }`
4. Client connects: `io(wsNamespace, { auth: { joinToken, sessionId } })`
5. Namespace middleware stores auth data (validation is optional/host-specific)
6. Event handlers use `socket.data.sessionId` for socket room grouping (game logic still uses room codes internally)
7. Reconnects still use `resumeToken`; `joinToken` is not used for reconnect logic

### Standalone mode

1. Player visits standalone-web
2. Creates or joins a room via UI (room code flow)
3. Server issues `resumeToken` on join
4. Client stores token in localStorage
5. On reconnect, client sends `resumePlayer` with token

**Important:** Never use `socket.id` as stable identity. It changes on:
- Page refresh
- Network reconnection
- Server restart

Always use `resumeToken` for reconnects. `joinToken` + `sessionId` are handshake-only data in embedded mode.

---

## Standalone Wrappers

### standalone-server

**File:** `standalone-server/src/index.ts`

A thin wrapper that:
1. Creates Express + HTTP server
2. Creates Socket.IO server
3. Calls `registerWerewolf(io)`
4. Serves static files
5. Provides health endpoint

```typescript
import { Server } from 'socket.io';
import { registerWerewolf } from '../../server/src/index';

const io = new Server(httpServer, { cors: { origin: '*' } });
registerWerewolf(io);

httpServer.listen(3001);
```

### standalone-web

**File:** `standalone-web/src/main.ts`

A thin Vite app that:
1. Creates Vue app instance
2. Installs Pinia (required!)
3. Renders `GameComponent` with standalone props

```typescript
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { GameComponent } from '../../ui-vue/src/index';

const app = createApp({
  render: () => h(GameComponent, {
    standalone: true,
    wsNamespace: '/g/werewolf',
  }),
});

app.use(createPinia());
app.mount('#app');
```

---

## Running Standalone Locally

### Quick start

```bash
# Install dependencies
pnpm install
pnpm -C standalone-server install
pnpm -C standalone-web install
# Or: pnpm run install:standalone

# Terminal 1: Start server
pnpm run dev:standalone-server

# Terminal 2: Start web client
pnpm run dev:standalone-web

# Open http://localhost:5173
```

### With legacy scripts

```bash
# Uses server/src/standalone.ts (backward compatible)
pnpm run dev

# Open http://localhost:5173
```

### Production build

```bash
pnpm run build:standalone
pnpm run start:standalone
```

---

## Game Hub Integration

Game Hub expects games under `games/<gameId>/{web,server,shared}`. This repo integrates
via `scripts/transform-for-gamehub.js`, which generates `game-export/werewolves/` in
that structure.

### Recommended flow
1. Run `node scripts/transform-for-gamehub.js` (CI does this after tests).
2. Copy `game-export/werewolves` into the Game Hub repo at `games/werewolves/`.
3. Update `web/src/Werewolves.vue` to mount `GameComponent` and wire Game Hub props
   (`gameId`, `sessionId`, `joinToken`, `wsNamespace`, `apiBaseUrl`).
4. Update `server/src/index.ts` to register Socket.IO handlers (or call `registerWerewolf(io)`).
5. Update `shared/src/*` imports to `@game-hub/contracts` if needed.
6. Register the game in the server registry (`apps/platform-server/src/games/registry.ts`).
7. Register the game in the web registry (`apps/platform-web/src/gameRegistry.ts`).

### Notes
1. `registerWerewolf(io)` attaches to `/g/werewolf` (Game Hub uses `/g/<gameId>`).
2. The transform output is a template and requires manual adaptation before it works in Game Hub.
3. The generated `web/src/Werewolves.vue` template still references legacy props and must be updated to the current Game Hub props.

---

## Gotchas and Best Practices

### ⚠️ Duplicate Vue/Pinia instances

**Problem:** If ui-vue bundles its own Vue or creates its own Pinia, state won't sync with the hub.

**Solution:**
- `vite.lib.config.ts` externalizes `vue` and `pinia`
- ui-vue NEVER calls `createPinia()` or `createApp()`
- Hub app installs Pinia before rendering GameComponent

### ⚠️ socket.id instability

**Problem:** `socket.id` changes on every reconnect.

**Solution:**
- Use `joinToken` for authentication (sent via handshake)
- Store `resumeToken` in localStorage for reconnection
- Server identifies players by token, not socket.id

### ⚠️ Handshake auth timing

**Problem:** Auth data must be available before connection.

**Solution:**
```typescript
// ✅ Correct: auth in connection options
io(namespace, { auth: { joinToken, sessionId } });

// ❌ Wrong: emitting after connection
socket.emit('auth', { joinToken });
```
This game expects `joinToken` and `sessionId` keys in `socket.handshake.auth` (not `token`).

### ⚠️ Namespace vs root

**Problem:** Handlers attached to `io` don't see namespace connections.

**Solution:**
```typescript
// ✅ Correct: attach to namespace
const nsp = io.of('/g/werewolf');
nsp.on('connection', handler);

// ❌ Wrong: only sees root connections
io.on('connection', handler);
```

### ⚠️ Room scoping

**Problem:** Socket.IO rooms are per-namespace.

**Solution:**
```typescript
// Room "game-123" in /g/werewolf is separate from
// Room "game-123" in /g/othergame
socket.join(sessionId);
nsp.to(sessionId).emit('roomUpdate', data);
```

### ⚠️ SessionId vs room code

**Problem:** Game logic still uses 4-letter room codes internally, while `sessionId`
is only used for Socket.IO room grouping in embedded mode.

**Solution:** If Game Hub needs sessionId-based rooms, adapt `createRoom`/`joinRoom`
handlers to use the provided `sessionId` (or map sessionId to a room code).

---

## Related Documentation

- [Socket.IO Namespaces](https://socket.io/docs/v4/namespaces/)
- [Socket.IO Middleware](https://socket.io/docs/v4/middlewares/)
- [Pinia Outside Components](https://pinia.vuejs.org/core-concepts/outside-component-stores.html)
- [Vite Library Mode](https://vitejs.dev/guide/build.html#library-mode)
