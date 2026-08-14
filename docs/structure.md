# Werewolves Codebase Structure

This document describes the codebase structure for the Werewolves standalone application.

## Quick Summary

- **core/**: Shared types, events, constants (used by both client and server)
- **server/**: Node.js + Express + Socket.IO backend with managers for game logic
- **ui-vue/**: Vue 3 frontend with Pinia stores and phase components
- **.agents/**: Local agent skills and supporting references
- **.claude/** / **.pi/** / **.github/**: AI assistant and editor-specific guidance/config
- **\_\_tests\_\_/**: Vitest unit tests
- **e2e/**: Playwright E2E tests

## Project Structure

```
werewolves/
├── .agents/                  # Local skills for coding agents
│   └── skills/
├── .claude/                  # Claude local permissions/settings
├── .github/                  # GitHub metadata, including Copilot instructions
├── .pi/                      # PI agent extensions and policies
├── core/                     # Shared types, events, constants
│   └── src/
│       ├── types.ts          # Shared types (Role, Phase, Player, Room, etc.)
│       ├── events.ts         # Socket.IO event contracts
│       └── constants.ts      # Shared constants (timing, limits, thresholds)
├── server/                   # Node.js + Express + Socket.IO backend
│   └── src/
│       ├── index.ts          # Server entry point (Express + Socket.IO + static)
│       ├── config/           # Server-only constants and role data
│       ├── handlers/         # Socket.IO event handlers (game + admin)
│       ├── managers/         # Business logic (role, phase, vote, death, admin, etc.)
│       ├── models/           # Room and Player models
│       └── utils/            # Server helpers (incl. admin auth)
├── ui-vue/                   # Vue 3 frontend (Vite)
│   ├── index.html
│   └── src/
│       ├── main.ts           # App entry (Pinia + config)
│       ├── App.vue           # Root component with phase switching
│       ├── components/       # Phase screens, panels, overlays, admin page, settings
│       ├── composables/      # Socket, narrator hooks, i18n helpers, admin socket
│       │   ├── useGameI18n.ts
│       │   ├── useAdminSocket.ts
│       │   └── useHostAdminKick.ts
│       ├── i18n/             # vue-i18n setup and locale message files
│       │   ├── index.ts
│       │   ├── messages/
│       │   │   ├── de.ts
│       │   │   └── en.ts
│       │   └── types.ts
│       ├── stores/           # Pinia stores (game, admin)
│       ├── types/            # Client types (config.ts)
│       ├── utils/            # Client helpers
│       └── assets/           # CSS, audio
├── __tests__/                # Vitest unit tests (incl. i18n + admin contracts)
├── e2e/                      # Playwright E2E tests (incl. admin token, language switch)
└── docs/                     # Documentation
```

## Agent And Editor Tooling

- `CLAUDE.md` is the source of truth for coding-agent behavior in this repo.
- `.agents/skills/` contains reusable local skills such as Vue, Pinia, Playwright, pnpm, and UI/UX guidance.
- `.claude/settings.json` stores local Claude permissions.
- `.pi/extensions/policy.ts` defines PI extension allow/deny behavior for tool access.

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
- `broadcastManager.ts`: Room state sanitization and broadcasting (player views + admin observer view)
- `adminManager.ts`: Admin observer registry (socket → room mapping, fan-out)

### Handlers Layer

- `socketHandlers.ts`: Player Socket.IO event handlers organized by game phase
- `adminSocketHandlers.ts`: Admin-only event handlers (list/join/leave rooms,
  admin kick, host mid-game kick). Every handler checks `socket.data.adminToken`
  before mutating state.

### Utils Layer

- `helpers.ts`: Common utility functions (shuffle, sanitize, logging, localized messages)
- `adminAuth.ts`: Admin token verification (`crypto.timingSafeEqual`) and socket stamping

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

- `AdminPage.vue`: Global admin console (`?admin=1` route). Token prompt, room
  list, room detail, and live read-only observer view. Uses its own socket and
  Pinia store; never touches player game state.
- `panels/HostControlPanel.vue`: Collapsible host side panel for mid-game kicks
  (lobby kicks still use `PlayersPanel.vue`).
- `settings/LanguageSwitcher.vue`: Locale dropdown (EN/DE), used in the Header,
  Landing, and Admin page.

### Composables

Reusable client logic in `ui-vue/src/composables/`:

- `useSocket.ts`: Socket.IO setup and typed event helpers.
- `useNarrator.ts`: Audio playback, gesture unlock, and state management.
- `useGameI18n.ts`: Centralized translation helpers for roles, teams, phases,
  night steps, seer results, server-originated messages, and errors. Exports
  `deathReasonKey` for the server/client death-reason contract test.
- `useAdminSocket.ts`: Admin Socket.IO setup tagging the handshake with
  `auth.adminToken`. Used only by `AdminPage.vue`.
- `useHostAdminKick.ts`: Lazily opens a short-lived admin socket for the
  host's mid-game kick (`hostMidGameKickPlayer`), since the host's regular
  player socket has no admin token.

## Internationalization

The client uses `vue-i18n` with English (`en`) as the fallback locale and German
(`de`) as the second supported locale. Locale detection order:

1. Stored choice in `localStorage` (`werewolves.locale`).
2. Browser language preference.
3. English fallback.

Server-originated display text (errors, room logs, winner reasons, day results,
death reasons) is sent as stable message keys plus params. The client resolves
those keys through `useGameI18n().localizeMessage()` / `localizeError()`.
Internal protocol values such as role ids, phases, socket events, and seer
result payloads remain English and language-neutral.

When adding user-facing text, prefer new translation keys in
`ui-vue/src/i18n/messages/en.ts` and `ui-vue/src/i18n/messages/de.ts` over
hardcoded strings. When adding a new role or passive role, add keys for its
name and description to both locale files.

### Stores

Pinia stores in `ui-vue/src/stores/`:

- `game.ts`: Player session, room state, pending prompts (hunter/mayor).
- `admin.ts`: Admin console state (token, room list, observer view). Kept
  separate from `game.ts` because admin observers are never players.

### Utils

Helper functions in `ui-vue/src/utils/`.

## Admin Console

The global admin console is a read-only observer and emergency-kick surface for
operators, gated by a shared secret.

- **Route**: `?admin=1` (no Vue Router; `App.vue` branches on the query param).
- **Auth**: `WEREWOLVES_ADMIN_TOKEN` env var. Clients present it in the Socket.IO
  handshake (`auth.adminToken`); the namespace middleware verifies it with
  `crypto.timingSafeEqual` and stamps `socket.data.adminToken = true`. A wrong
  token rejects the connection (`connect_error`) so the UI can re-prompt.
- **Admin observers are not players**: they are never in `room.players`, never
  receive `self`, never vote/act, and cannot be targeted by game logic. They are
  tracked by `adminManager.ts` and receive sanitized `roomUpdate` events built
  by `buildAdminRoomView()` (which strips `self`, all `player.role`,
  `mayorId`, `seerResult`, `witchState`, `wolfVotes`, `wolfPeers`, `wolfIds`,
  `guardedTarget`, `harlotVisitedTarget`, `loverName`, `loversKnown`, and
  Hunter/Mayor identity).
- **Events** (all admin-gated; see `core/src/events.ts`):
  - `adminListRooms` — list every room as a sanitized `RoomSummary`.
  - `adminJoinRoom` / `adminLeaveRoom` — observe / stop observing a room.
  - `adminKickPlayer` — admin override kick, works in ANY phase. If it empties
    the room, the room is torn down immediately (observers get `roomClosed`).
  - `adminCloseRoom` — admin close-session: deletes the room entirely
    (disconnects all players with `roomClosed`, releases admin observers).
  - `hostMidGameKickPlayer` — host-only mid-game kick; the acting socket must be
    BOTH admin (token) AND the current host (`room.hostId === playerId`).
- **Host side panel**: `HostControlPanel.vue` is shown only to hosts outside the
  lobby. Mid-game kicks use `useHostAdminKick` to spin up a short-lived admin
  socket (the host's player socket has no admin token). If no admin token is
  stored locally, the host is prompted to open the admin page once to set it.

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
  └── registerNamespace(io)
        ├── setupSocketHandlers(nsp, socket)     # player events
        └── setupAdminSocketHandlers(nsp, socket) # admin events
             ├── models/ (room, player)
             ├── managers/ (role, phase, night, vote, death, broadcast, admin)
             └── utils/ (helpers, adminAuth)
```

The namespace middleware validates `auth.adminToken` against
`WEREWOLVES_ADMIN_TOKEN` and stamps `socket.data.adminToken = true`. Admin
sockets are never added to `room.players`; they are tracked by
`adminManager.ts` and receive sanitized `roomUpdate` events via
`broadcastRoomToAdmins`.

### Client Dependencies

```
App.vue
  ├── stores/ (game, admin)
  ├── composables/ (socket, narrator, useGameI18n)
  ├── components/ (phases, panels, overlays, AdminPage, HostControlPanel)
  └── utils/helpers.ts, narrator.ts
```

When `?admin=1` is present, `App.vue` renders `AdminPage.vue` instead of the
phase UI and does NOT wire the player socket; the admin page creates its own
socket via `useAdminSocket`.

**Narrator**: The `utils/narrator.ts` module handles audio playback with support
for multiple audio variants per clip. Variants are discovered only in
`/audio/custom/` (e.g., `custom/day_1.mp3`, `custom/day_2.mp3`) via HEAD requests
and one is randomly selected per playback. Narration is derived from semantic
game cues rather than every server pacing state: `transition`, `resolve`,
`postMayor`, and `nightToDay` remain visible game states but do not trigger
redundant audio. A monotonically increasing request ID prevents an older,
slow-loading clip from playing after a newer room state; a separate cache
generation prevents a pending old-locale clip from surviving a language
change. The reviewed German
scripts and versioned generation command live in
`ui-vue/src/assets/audio/scripts.de.json` and
`tools/generate-german-narrator.py`.

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

CI runs the same checks (typecheck, lint, format check, build, and tests).

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
