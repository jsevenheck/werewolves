# Werewolf: Preparation for Game-Hub Integration

This document describes the pre-integration work performed on the Werewolf standalone
repository and the steps the **game-hub** team will need to complete after moving this
code into `game-hub/games/werewolf/`.

---

## 1. New Directory Structure

```
werewolf/
├── core/
│   └── src/
│       ├── index.ts          # re-exports types, events, constants
│       ├── types.ts           # shared TypeScript interfaces (Role, Room, Player, etc.)
│       ├── events.ts          # Socket.IO event type definitions
│       └── constants.ts       # timing constants (delays, MIN_PLAYERS)
│
├── server/
│   └── src/
│       ├── index.ts           # ★ registerWerewolf(io) – namespace plugin entry
│       ├── standalone.ts      # standalone HTTP server (Express + Socket.IO)
│       ├── config/constants.ts
│       ├── handlers/socketHandlers.ts
│       ├── managers/          # phaseManager, nightManager, voteManager, deathManager, etc.
│       ├── models/            # room.ts, player.ts (in-memory stores)
│       └── utils/helpers.ts
│
├── ui-vue/
│   ├── src/
│   │   ├── index.ts           # ★ exports manifest + GameComponent
│   │   ├── install.ts         # legacy plugin installer (standalone only)
│   │   ├── main.ts            # standalone Vue app bootstrap (createApp + Pinia)
│   │   ├── App.vue            # root game component (accepts hub integration props)
│   │   ├── stores/game.ts     # Pinia store
│   │   ├── composables/       # useSocket, useNarrator
│   │   ├── components/        # Vue phase components, overlays, panels
│   │   ├── types/config.ts    # WerewolvesGameConfig interface
│   │   └── utils/             # UI helpers, narrator logic
│   ├── package.json           # werewolves-ui-vue (Vue + Pinia + socket.io-client)
│   ├── vite.config.ts         # dev server + build config
│   ├── vite.lib.config.ts     # library build (ESM + UMD)
│   └── tsconfig.json          # client-side TypeScript config
│
├── __tests__/                 # Jest unit tests
├── e2e/                       # Playwright E2E tests
├── server.ts                  # legacy entry → delegates to server/src/standalone.ts
├── package.json               # root (server deps + scripts)
└── docs/
    └── werewolf-prep-for-game-hub.md   # this file
```

### What belongs where

| Directory | Responsibility | Dependencies |
|-----------|---------------|-------------|
| `core/`   | Pure game logic types, event interfaces, constants. No Vue, no Socket.IO runtime. | None |
| `server/` | Socket.IO namespace plugin, game state management, event handlers. | `socket.io`, `nanoid`, `express` (standalone only), `core/` |
| `ui-vue/` | Vue 3 UI module. Exports `manifest` + `GameComponent`. Uses Pinia stores but does **not** bootstrap Vue or Pinia. | `vue`, `pinia`, `socket.io-client`, `howler`, `core/` |

---

## 2. Pre-Integration Tasks (Already Done)

### 2.1 Restructured into core / server / ui-vue

- Moved `src/shared/*` &rarr; `core/src/`
- Moved `src/server/*` &rarr; `server/src/`
- Moved `client/*` &rarr; `ui-vue/`
- Updated all import paths across source, tests, and configs

### 2.2 Server namespace plugin

Created `server/src/index.ts` exporting:

```ts
export function registerWerewolf(io: Server): Namespace;
```

- Attaches handlers to `io.of("/g/werewolf")`
- Namespace middleware reads `socket.handshake.auth.{joinToken, sessionId}`
- All internal manager functions now accept `Namespace` instead of `Server`
  (`io.sockets.sockets.get(id)` &rarr; `io.sockets.get(id)`)
- Auto-joins the socket to a Socket.IO room matching `sessionId`

### 2.3 UI module export contract

Created `ui-vue/src/index.ts` exporting:

```ts
export const manifest = {
  id: 'werewolf',
  title: 'Werewolves',
  minPlayers: 5,
  maxPlayers: 20,
} as const;

export const GameComponent = App; // Vue component
```

- `GameComponent` (App.vue) accepts props:
  - `sessionId` – game session / room identifier
  - `joinToken` – auth token for Socket.IO handshake
  - `wsNamespace` – Socket.IO namespace path (e.g. `"/g/werewolf"`)
  - `apiBaseUrl` – optional REST base URL
  - Plus legacy props: `socketUrl`, `socketPath`, `assetsBasePath`, `standalone`
- Pinia is **not** created by the module entry; the hub must install Pinia before
  mounting `GameComponent`.

### 2.4 Standalone entry preserved

`server/src/standalone.ts` boots Express + Socket.IO on its own HTTP server.
`server.ts` (root) re-exports it so existing `tsx server.ts` commands still work.

### 2.5 Removed workspace artifacts

- Deleted `pnpm-workspace.yaml` (hub will have its own workspace config)
- Lockfiles (`pnpm-lock.yaml`, `ui-vue/pnpm-lock.yaml`) kept for standalone CI;
  these will be superseded by the hub's root lockfile after integration
- Updated scripts to use `pnpm -C ui-vue` instead of `pnpm --filter`

### 2.6 Socket.IO types changed to Namespace

All server managers and handlers use `Namespace<C, S>` instead of `Server<C, S>`.
This allows the same handler code to work with both:
- **Standalone**: `io.sockets` (the default namespace)
- **Hub embedded**: `io.of("/g/werewolf")` (a custom namespace)

---

## 3. Integration Tasks (For the Hub Team)

### 3.1 Move files into the monorepo

```bash
# From the game-hub repo root:
mkdir -p games/werewolf
cp -r /path/to/werewolf/{core,server,ui-vue,__tests__,e2e,docs} games/werewolf/
cp /path/to/werewolf/{package.json,tsconfig*.json,jest.config.cjs,jest.setup.ts,playwright.config.ts,server.ts} games/werewolf/
```

### 3.2 Register in the hub's pnpm workspace

Add to the **hub root** `pnpm-workspace.yaml`:

```yaml
packages:
  - "games/werewolf"
  - "games/werewolf/ui-vue"
  # ... other packages
```

### 3.3 Wire the server plugin

In the hub's platform server:

```ts
import { registerWerewolf } from '@werewolf/server';
// or: import { registerWerewolf } from '../games/werewolf/server/src/index';

const io = new Server(httpServer, { cors: { origin: '*' } });
registerWerewolf(io);
```

The function attaches to `io.of("/g/werewolf")` and handles all game events
on that namespace.

### 3.4 Wire the UI module

In the hub's game loader:

```ts
const { manifest, GameComponent } = await import('@werewolf/ui-vue');
// or: await import('../games/werewolf/ui-vue/src/index');

// Render with <component :is="GameComponent" v-bind="hubProps" />
```

Pass the hub integration props:

```vue
<component
  :is="GameComponent"
  :session-id="session.id"
  :join-token="session.joinToken"
  ws-namespace="/g/werewolf"
  :api-base-url="apiBase"
/>
```

### 3.5 Pinia setup

The hub must install Pinia **before** mounting `GameComponent`:

```ts
import { createPinia } from 'pinia';
app.use(createPinia());
// Then mount the game component
```

Do **NOT** call `installWerewolvesGame()` from the hub; that function creates its
own Pinia instance and is only for standalone use.

### 3.6 Namespace auth middleware

The default namespace middleware in `registerWerewolf` accepts all connections and
stores `joinToken`/`sessionId` on `socket.data`. To enforce authentication:

1. Replace or extend the middleware inside `registerWerewolf` to verify the
   `joinToken` against the hub's session store.
2. Reject unauthorized connections with `next(new Error('Unauthorized'))`.

### 3.7 Update package names & paths (optional)

If the monorepo uses scoped packages (e.g. `@game-hub/werewolf-server`), update
the `name` fields in:
- `games/werewolf/package.json`
- `games/werewolf/ui-vue/package.json`

---

## 4. Checklists

### Pre-Move Checklist (this repo)

- [x] Restructured into `core/`, `server/`, `ui-vue/`
- [x] `server/src/index.ts` exports `registerWerewolf(io)`
- [x] `ui-vue/src/index.ts` exports `manifest` + `GameComponent`
- [x] `GameComponent` accepts hub props (`sessionId`, `joinToken`, `wsNamespace`, `apiBaseUrl`)
- [x] Pinia not created in the shared module entry
- [x] Socket.IO handlers use `Namespace` type (not `Server`)
- [x] `useSocket` composable supports `auth` option for namespace handshake
- [x] Deleted `pnpm-workspace.yaml` (hub provides its own)
- [x] Lockfiles kept for standalone CI (will be superseded by hub's root lockfile)
- [x] Standalone server entry preserved (`server/src/standalone.ts`)
- [x] All test imports updated
- [x] All config files updated (tsconfig, jest, playwright, CI, Dockerfile)

### Post-Move Checklist (hub repo)

- [ ] Files copied to `games/werewolf/`
- [ ] Hub `pnpm-workspace.yaml` updated with werewolf paths
- [ ] `pnpm install` succeeds from hub root
- [ ] Hub platform server calls `registerWerewolf(io)` at startup
- [ ] Hub game loader imports `manifest` and `GameComponent` from `ui-vue/src/index.ts`
- [ ] Hub passes `sessionId`, `joinToken`, `wsNamespace` props to `GameComponent`
- [ ] Hub installs Pinia globally; no `installWerewolvesGame()` call
- [ ] Namespace auth middleware enforces join token validation
- [ ] Client connects to `/g/werewolf` namespace with auth in handshake
- [ ] CSS scoping verified (no style leaks between games)
- [ ] Audio assets (`public/audio/`) accessible from hub's static serving
- [ ] Unit tests pass: `pnpm -C games/werewolf test`
- [ ] E2E tests pass (may need hub-specific test setup)
- [ ] Build succeeds: `pnpm -C games/werewolf build`

---

## 5. Gotchas

### 5.1 Duplicate Vue instances

If the hub bundles Vue and the game also bundles Vue, you get two copies at
runtime. This breaks reactivity, provide/inject, and Pinia.

**Fix**: The game's `vite.lib.config.ts` already marks `vue` and `pinia` as
`external`. Ensure the hub's build aliases `vue` and `pinia` to a single
copy. In a monorepo with workspace protocol, pnpm should deduplicate
automatically as long as version ranges are compatible.

### 5.2 Pinia ownership

`GameComponent` calls `useGameStore()` from Pinia. This only works if a Pinia
instance has been installed on the Vue app **before** the component mounts.

- **Hub mode**: the hub creates and installs Pinia.
- **Standalone mode**: `main.ts` or `installWerewolvesGame()` creates Pinia.
- **Never** create two Pinia instances on the same app.

### 5.3 Namespace auth

The default middleware in `registerWerewolf` does **not** reject any
connections. It stores `joinToken` and `sessionId` on `socket.data`. The
hub must extend or replace the middleware to validate tokens against its
session store.

### 5.4 Socket.IO room grouping

The server uses room codes (4-char alphanumeric) for grouping, not
`sessionId`. The `sessionId` is used for Socket.IO room joining
(`socket.join(sessionId)`) but the game logic uses room codes internally.
If the hub maps sessions to game rooms differently, adapt the
`createRoom`/`joinRoom` handlers in `socketHandlers.ts`.

### 5.5 Asset paths

The narrator audio files live in `ui-vue/public/audio/`. In standalone
mode they're served at `/audio/*.mp3`. In the hub, the base path may
differ. Pass `assetsBasePath` prop to `GameComponent` or configure it
via `WerewolvesGameConfig.assetsBasePath`.

**Note**: The narrator supports audio variants (e.g., `day_1.mp3`, `day_2.mp3`) 
for variety. The system auto-detects numbered variants and randomly selects 
one each playback. See `ui-vue/public/audio/README.md` for the naming convention.

### 5.6 CSS isolation

The game's styles are global CSS (`styles.css`). They use a `.werewolves-root`
wrapper class to scope most rules, but some styles (overlays, body-level
teleports) may leak. Consider:
- Wrapping in a Shadow DOM (complex)
- Prefixing all class names with `ww-` (medium effort)
- Reviewing styles after integration for conflicts

### 5.7 In-memory state

The server stores all game rooms in a JavaScript `Map` (`rooms` in
`server/src/models/room.ts`). This is per-process and not persistent.
For the hub:
- Single-process deployment: works as-is
- Multi-process / cluster: needs a shared store (Redis, etc.)

### 5.8 Timers and cleanup

The server uses `setTimeout` / `setInterval` for phase transitions, hunter
shot timeouts, and room cleanup. All timers call `.unref()` to avoid
blocking process exit. In the hub, verify timers don't interfere with
graceful shutdown.

---

## 6. File Moves Summary

| Old Path | New Path |
|----------|----------|
| `src/shared/types.ts` | `core/src/types.ts` |
| `src/shared/events.ts` | `core/src/events.ts` |
| `src/shared/constants.ts` | `core/src/constants.ts` |
| `src/server/config/constants.ts` | `server/src/config/constants.ts` |
| `src/server/handlers/socketHandlers.ts` | `server/src/handlers/socketHandlers.ts` |
| `src/server/models/room.ts` | `server/src/models/room.ts` |
| `src/server/models/player.ts` | `server/src/models/player.ts` |
| `src/server/managers/*.ts` | `server/src/managers/*.ts` |
| `src/server/utils/helpers.ts` | `server/src/utils/helpers.ts` |
| `src/types/howler.d.ts` | `ui-vue/src/types/howler.d.ts` |
| `client/*` | `ui-vue/*` |
| `server.ts` | `server.ts` (now delegates to `server/src/standalone.ts`) |
| `pnpm-workspace.yaml` | **Deleted** (hub provides its own) |
| `pnpm-lock.yaml` | Kept for standalone CI (superseded by hub) |
| `ui-vue/pnpm-lock.yaml` | Kept for standalone CI (superseded by hub) |

New files:
- `core/src/index.ts` – barrel re-exports
- `server/src/index.ts` – `registerWerewolf(io)` export
- `server/src/standalone.ts` – standalone HTTP server entry
- `ui-vue/src/install.ts` – legacy plugin installer (extracted from old index.ts)
