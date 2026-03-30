# Werewolves Codebase Structure

This document describes the codebase structure for the Werewolves standalone application.

## Quick Summary

- **core/**: Shared types, events, constants (used by both client and server)
- **server/**: Node.js + Express + Socket.IO backend with managers for game logic
- **ui-vue/**: Vue 3 frontend with Pinia stores and phase components
- **\_\_tests\_\_/**: Vitest unit tests
- **e2e/**: Playwright E2E tests

## Project Structure

```
werewolves/
├── core/                     # Shared types, events, constants
│   └── src/
│       ├── types.ts          # Shared types (Role, Phase, Player, Room, etc.)
│       ├── events.ts         # Socket.IO event contracts
│       └── constants.ts      # Shared constants (timing, limits, thresholds)
├── server/                   # Node.js + Express + Socket.IO backend
│   └── src/
│       ├── index.ts          # Server entry point (Express + Socket.IO + static)
│       ├── config/           # Server-only constants and role data
│       ├── handlers/         # Socket.IO event handlers
│       ├── managers/         # Business logic (role, phase, vote, death, etc.)
│       ├── models/           # Room and Player models
│       └── utils/            # Server helpers
├── ui-vue/                   # Vue 3 frontend (Vite)
│   ├── index.html
│   └── src/
│       ├── main.ts           # App entry (Pinia + config)
│       ├── App.vue           # Root component with phase switching
│       ├── components/       # Phase screens, panels, overlays
│       ├── composables/      # Socket, narrator hooks
│       ├── stores/           # Pinia stores
│       ├── types/            # Client types (config.ts)
│       ├── utils/            # Client helpers
│       └── assets/           # CSS, audio
├── __tests__/                # Vitest unit tests
├── e2e/                      # Playwright E2E tests
└── docs/                     # Documentation
```

## Server-Side Architecture

### Entry Point

`server/src/index.ts` is the server entry point. It creates an Express app with
Socket.IO, sets up event handlers on a namespace, and serves the built client
assets via `express.static`.

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

### Entry Point

`ui-vue/src/main.ts` creates the Vue app with Pinia and mounts the root component.

### Configuration

The client accepts optional configuration via `WerewolvesGameConfig`:

```typescript
export interface WerewolvesGameConfig {
  assetsBasePath?: string; // Custom audio path
}
```

### Components

Phase-specific screens in `ui-vue/src/components/*Phase.vue`. Shared UI in
`ui-vue/src/components/panels` and `ui-vue/src/components/overlays`.

### Composables

Reusable client logic (socket setup, narrator audio) in `ui-vue/src/composables/`.

### Stores

Pinia stores in `ui-vue/src/stores/` (game/session state, pending actions).

### Utils

Helper functions in `ui-vue/src/utils/`.

## Import Conventions

### Server Imports

- **Shared modules**: Use `@shared/*` alias (maps to `core/src/*` via tsconfig paths)
  - Example: `import type { Role } from '@shared/types';`
- **Internal imports**: Use relative paths
  - Example: `import { broadcastRoom } from './broadcastManager';`

### Client Imports (ui-vue/)

- **Shared modules**: Use `@shared/*` alias (maps to `core/src/*` via tsconfig paths)
  - Example: `import type { RoomView } from '@shared/types';`
- **Internal imports**: Use relative paths (NOT `@/` alias)
  - Example: `import { useGameStore } from './stores/game';`
  - Example: `import Landing from './components/Landing.vue';`

## Module Dependencies

### Server Dependencies

```
server/src/index.ts
  └── setupSocketHandlers(nsp, socket)
       ├── models/ (room, player)
       ├── managers/ (role, phase, night, vote, death, broadcast)
       └── utils/ (helpers)
```

### Client Dependencies

```
App.vue
  ├── stores/ (game)
  ├── composables/ (socket, narrator)
  ├── components/ (phases, panels, overlays)
  └── utils/helpers.ts, narrator.ts
```

**Narrator**: The `utils/narrator.ts` module handles audio playback with support
for multiple audio variants per clip. Variants are discovered only in
`/audio/custom/` (e.g., `custom/day_1.mp3`, `custom/day_2.mp3`) via HEAD requests
and one is randomly selected per playback.

## Build Output

- **Server**: `dist/server/src/index.js` (compiled TypeScript)
- **Client**: `dist/client/` (Vite build output)
- **Start**: `node dist/server/src/index.js` (or `pnpm start`)

## Benefits of This Structure

1. **Separation of Concerns**: Each module has a single, clear responsibility
2. **Maintainability**: Easy to locate and modify specific functionality
3. **Testability**: Modules can be tested independently
4. **Scalability**: Easy to add new features without affecting existing code
5. **Code Reusability**: Shared logic is centralized in utility modules
6. **Readability**: Clear naming and organization makes the code self-documenting

## Development Guidelines

### Quality gates (run before every commit)

```bash
pnpm lint            # ESLint – must be 0 errors
pnpm format:check    # Prettier – no diffs allowed
pnpm typecheck       # tsc + vue-tsc
pnpm test            # Vitest unit tests
```

CI runs these in the same order.

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

- The main folders are `core/`, `server/`, and `ui-vue/`.
- In development, Vite runs on port 5173 and proxies `/socket.io` to port 3001.
- In production, the server serves the built client from `dist/client/`.
