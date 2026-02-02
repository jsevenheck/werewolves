# Werewolves Codebase Structure

This document describes the codebase structure, designed to support both
standalone operation and embedding into the Game Hub platform.

## Quick Summary
- **core/**: Shared types, events, constants (used by both client and server)
- **server/**: Node.js + Socket.IO backend with managers for game logic
- **ui-vue/**: Vue 3 frontend with Pinia stores and phase components
- **standalone-*/**: Thin wrappers for running without Game Hub
- **__tests__/**: Jest unit tests
- **e2e/**: Playwright E2E tests

## Project Structure

```
werewolves/
|-- core/                     # Pure game logic (no Vue, Pinia, Socket.IO, DOM)
|   `-- src/
|       |-- types.ts          # Shared types (Role, Phase, Player, Room, etc.)
|       |-- events.ts         # Socket.IO event contracts
|       `-- constants.ts      # Shared timing constants
|-- server/                   # Server-side game logic
|   `-- src/
|       |-- index.ts          # definition/register/handler + registerWerewolf
|       |-- config/           # Server-only constants and role data
|       |-- handlers/         # Socket.IO event handlers
|       |-- managers/         # Business logic (role, phase, vote, death, etc.)
|       |-- models/           # Room and Player models
|       `-- utils/            # Server helpers
|-- ui-vue/                   # Vue 3 game UI
|   `-- src/
|       |-- index.ts          # Hub exports: manifest, GameComponent
|       |-- main.ts           # Local dev entry (with Pinia)
|       |-- App.vue           # Root component with phase switching
|       |-- components/       # Phase screens, panels, overlays
|       |-- composables/      # Socket, narrator hooks
|       |-- stores/           # Pinia stores
|       |-- types/            # Client-only types
|       `-- utils/            # Client helpers
|-- standalone-server/        # Thin wrapper for standalone server
|   `-- src/
|       `-- index.ts          # HTTP + Socket.IO + registerWerewolf()
|-- standalone-web/           # Thin wrapper for standalone web client
|   |-- index.html
|   |-- vite.config.ts
|   `-- src/
|       `-- main.ts           # Vue app + Pinia + GameComponent
|-- docs/                     # Documentation
|-- __tests__/                # Jest unit tests
`-- e2e/                      # Playwright E2E tests
```

## Embedded vs Standalone

| Aspect | Embedded (Game Hub) | Standalone |
|--------|---------------------|------------|
| Vue app | Created by hub | Created by standalone-web |
| Pinia | Installed by hub | Installed by standalone-web |
| Socket.IO server | Hub calls `register()` or `registerWerewolf()` | standalone-server creates + calls |
| Room creation | Room codes via UI unless you adapt to use `sessionId` | Room codes via UI |
| Auth | `joinToken` or `token` stored from handshake (not enforced) + `resumeToken` for reconnect | `resumeToken` for reconnect |

See [embedded-and-standalone.md](./embedded-and-standalone.md) for full details.

## Server-Side Architecture

### Entry Points

- `server/src/index.ts`: Exports `definition`, `register()`, `handler`, `registerWerewolf()`
- `standalone-server/src/index.ts`: Standalone wrapper

### Namespace Plugin Pattern

The server exports a definition plus a register helper that attaches handlers to a Socket.IO namespace:

```typescript
// server/src/index.ts
export function register(io: Server, namespace = '/g/werewolves') {
  const nsp = io.of(namespace);
  
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
  nsp.on('connection', (socket) => {
    setupSocketHandlers(nsp, socket);
  });
  
  return nsp;
}
```

### Config Layer
- `server/src/config/constants.ts`: Server-only constants, role data, timing (E2E override)
- `core/src/constants.ts`: Shared timing constants for client + server

### Models Layer
- `server/src/models/room.ts`: Room creation, storage, and retrieval
- `server/src/models/player.ts`: Player creation and socket-player mapping

### Managers Layer
Business logic separated by concern:
- `roleManager.ts`: Role configuration, validation, and assignment
- `phaseManager.ts`: Phase transitions and scheduling
- `nightManager.ts`: Night phase actions (wolf votes, seer, witch)
- `voteManager.ts`: Day voting and elimination (includes mayor tie-breaking)
- `mayorManager.ts`: Mayor election and succession
- `deathManager.ts`: Death queue, resolution, hunter shots, win checking
- `broadcastManager.ts`: Room state sanitization and broadcasting

### Handlers Layer
- `socketHandlers.ts`: All Socket.IO event handlers organized by game phase

### Utils Layer
- `helpers.ts`: Common utility functions (shuffle, sanitize, logging)

## Client-Side Architecture

### Entry Points

- `ui-vue/src/index.ts`: Hub exports (manifest, GameComponent)
- `ui-vue/src/main.ts`: Local dev entry with Pinia
- `standalone-web/src/main.ts`: Standalone wrapper

### Components
Phase-specific screens in `ui-vue/src/components/*Phase.vue`. Shared UI in
`ui-vue/src/components/panels` and `ui-vue/src/components/overlays`.

### Composables
Reusable client logic (socket setup, narrator audio) in `ui-vue/src/composables/`.

### Stores
Pinia stores in `ui-vue/src/stores/` (game/session state, pending actions).

### Utils
Helper functions in `ui-vue/src/utils/`.

## Module Dependencies

### Server Dependencies
```
register(io)
  `-- setupSocketHandlers(nsp, socket)
       |-- models/ (room, player)
       |-- managers/ (role, phase, night, vote, death, broadcast)
       `-- utils/ (helpers)
```

### Client Dependencies
```
GameComponent (App.vue)
  |-- stores/ (game)
  |-- composables/ (socket, narrator)
  |-- components/ (phases, panels, overlays)
  `-- utils/helpers.ts, narrator.ts
```

**Narrator**: The `utils/narrator.ts` module handles audio playback with support
for multiple audio variants per clip. Variants are discovered only in
`/audio/custom/` (e.g., `custom/day_1.mp3`, `custom/day_2.mp3`) via HEAD requests
and one is randomly selected per playback.

## Benefits of This Structure

1. **Separation of Concerns**: Each module has a single, clear responsibility
2. **Maintainability**: Easy to locate and modify specific functionality
3. **Testability**: Modules can be tested independently
4. **Scalability**: Easy to add new features without affecting existing code
5. **Code Reusability**: Shared logic is centralized in utility modules
6. **Readability**: Clear naming and organization makes the code self-documenting

## Development Guidelines

### Adding New Features

**Server-side:**
1. Add shared timing constants to `core/src/constants.ts` when both client + server need them
2. Add server-only constants to `server/src/config/constants.ts`
3. Update models if new data structures are needed
4. Add business logic to appropriate manager
5. Add socket event handlers to `server/src/handlers/socketHandlers.ts`

**Client-side:**
1. Add shared timing constants to `core/src/constants.ts` when both client + server need them
2. Update client state in `ui-vue/src/stores/` if needed
3. Add UI in `ui-vue/src/components/` and wiring in `ui-vue/src/App.vue`
4. Add client-only helpers in `ui-vue/src/utils/` or `ui-vue/src/composables/`

### Module Export/Import Pattern

**Server (CommonJS output):**
```typescript
// Exporting
export { functionName };

// Importing
import { functionName } from './path/to/module';
```

**Client (ES Modules):**
```typescript
// Exporting
export { functionName };

// Importing
import { functionName } from './path/to/module';
```

## Workspace Layout Notes

- The main folders are `core/`, `server/`, `ui-vue/`, plus standalone wrappers.
- In development, Vite runs on port 5173 and proxies `/socket.io` to port 3001.
- Standalone-web and standalone-server reuse embedded modules as thin wrappers.
- Game Hub export is produced by `scripts/transform-for-gamehub.js` into
  `game-export/werewolves/{web,server,shared}`.
- See [embedded-and-standalone.md](./embedded-and-standalone.md) for integration details.
