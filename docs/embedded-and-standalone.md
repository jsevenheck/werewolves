# Embedded and Standalone Modes

This document explains how the Werewolves game can run in two modes:

1. **Embedded mode** – as a game plugin inside the game-hub platform
2. **Standalone mode** – as an independent web application

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
- [Migration to game-hub](#migration-to-game-hub)
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
| `sessionId` | `string` | ✓ (embedded) | Platform session ID, used as room key |
| `joinToken` | `string` | ✓ (embedded) | Auth token for Socket.IO handshake |
| `wsNamespace` | `string` | ✓ (embedded) | Namespace path, e.g. `/g/werewolf` |
| `apiBaseUrl` | `string` | ○ | Base URL for REST calls |
| `socketUrl` | `string` | ○ | Socket.IO server URL (default: same origin) |
| `socketPath` | `string` | ○ | Socket.IO path (default: `/socket.io`) |
| `assetsBasePath` | `string` | ○ | Audio assets path (default: `/audio`) |
| `standalone` | `boolean` | ○ | Enable create/join room flows (auto-false if wsNamespace set) |

**Usage in game-hub:**

```vue
<script setup>
import { GameComponent, manifest } from '@game-hub/werewolf-ui';

const props = defineProps<{
  sessionId: string;
  joinToken: string;
}>();
</script>

<template>
  <component
    :is="GameComponent"
    :session-id="props.sessionId"
    :join-token="props.joinToken"
    ws-namespace="/g/werewolf"
  />
</template>
```

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

**Usage in game-hub:**

```typescript
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerWerewolf } from '@game-hub/werewolf-server';

const httpServer = createServer(app);
const io = new Server(httpServer);

// Register all game namespaces
registerWerewolf(io);  // → /g/werewolf
registerOtherGame(io); // → /g/other

httpServer.listen(3000);
```

---

## Socket.IO Namespace Design

The game uses a dedicated namespace `/g/werewolf` (not the root `/`).

**Why namespaces?**

- Multiple games share one Socket.IO server
- Each game has isolated event handlers
- Room names are scoped per namespace
- Middleware can be namespace-specific

**Namespace middleware (auth):**

```typescript
nsp.use((socket, next) => {
  const { joinToken, sessionId } = socket.handshake.auth;
  
  // Validate token (in production, verify JWT)
  if (!joinToken) {
    return next(new Error('Missing joinToken'));
  }
  
  socket.data.sessionId = sessionId;
  socket.data.joinToken = joinToken;
  next();
});
```

---

## Authentication Flow

### Embedded mode (game-hub)

1. Platform authenticates user, creates session
2. Platform issues `joinToken` (JWT or opaque token) per player
3. Client receives `{ sessionId, joinToken, wsNamespace }`
4. Client connects: `io(wsNamespace, { auth: { joinToken, sessionId } })`
5. Namespace middleware validates token
6. Event handlers use `socket.data.sessionId` as room key

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

Always use `joinToken` + `sessionId` (embedded) or `resumeToken` (standalone).

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
pnpm -C standalone-web install

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
pnpm run build:standalone-web
pnpm run build:server
pnpm start
```

---

## Migration to game-hub

### Before moving to monorepo

1. **Delete workspace artifacts:**
   ```bash
   # These must NOT exist in a nested package
   rm pnpm-lock.yaml
   # pnpm-workspace.yaml should not exist here
   ```

2. **Verify no pnpm-workspace.yaml exists:**
   ```bash
   find . -name "pnpm-workspace.yaml"
   # Should return empty
   ```

3. **Keep only package.json** in each subpackage:
   - `core/package.json` (if needed)
   - `server/package.json` (if needed)
   - `ui-vue/package.json`

### Target folder structure in game-hub

```
game-hub/
├── pnpm-workspace.yaml      # Only here!
├── pnpm-lock.yaml           # Only here!
├── packages/
│   └── platform/            # Hub server + web
└── games/
    └── werewolf/
        ├── core/            # → from this repo
        ├── server/          # → from this repo
        └── ui-vue/          # → from this repo
```

### Integration checklist

- [ ] Platform installs Pinia once at app root
- [ ] Platform calls `registerWerewolf(io)` at server startup
- [ ] Platform renders `<component :is="GameComponent" v-bind="ctx" />`
- [ ] Platform passes `sessionId`, `joinToken`, `wsNamespace` as props
- [ ] Delete standalone-server/ and standalone-web/ (or keep for dev)

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
io(namespace, { auth: { joinToken } });

// ❌ Wrong: emitting after connection
socket.emit('auth', { joinToken });
```

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

---

## Related Documentation

- [Socket.IO Namespaces](https://socket.io/docs/v4/namespaces/)
- [Socket.IO Middleware](https://socket.io/docs/v4/middlewares/)
- [Pinia Outside Components](https://pinia.vuejs.org/core-concepts/outside-component-stores.html)
- [Vite Library Mode](https://vitejs.dev/guide/build.html#library-mode)
