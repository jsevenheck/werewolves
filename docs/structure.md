# Werewolves Codebase Structure

This document describes the refactored codebase structure.

## Project Structure

```
werewolves/
|-- server.ts                 # Main server entry point (TypeScript)
|-- src/                      # Server-side code
|   `-- server/
|       |-- config/           # Configuration and constants
|       |   `-- constants.ts  # Game constants, role info, defaults
|       |-- models/           # Data models
|       |   |-- room.ts       # Room creation and management
|       |   `-- player.ts     # Player creation and socket index
|       |-- managers/         # Business logic managers
|       |   |-- roleManager.ts      # Role assignment and validation
|       |   |-- phaseManager.ts     # Game phase transitions
|       |   |-- nightManager.ts     # Night phase logic
|       |   |-- voteManager.ts      # Day voting logic
|       |   |-- deathManager.ts     # Death resolution and win conditions
|       |   `-- broadcastManager.ts # Room state broadcasting
|       |-- handlers/         # Socket event handlers
|       |   `-- socketHandlers.ts   # All socket.io event handlers
|       `-- utils/            # Utility functions
|           `-- helpers.ts    # Helper functions
|-- src/shared/               # Shared types/events for client + server
|   |-- events.ts             # Socket.IO event contracts
|   |-- types.ts              # Shared data shapes (room, player, etc.)
|   `-- constants.ts          # Shared timing constants for UI + server
|-- client/                   # Vite client workspace
|   |-- index.html            # Main HTML file
|   `-- src/                  # Client TypeScript modules
|       |-- main.ts           # Main client entry point
|       |-- style.css         # Styles
|       |-- config/           # Client configuration
|       |   `-- constants.ts  # Role details and constants
|       |-- state/            # State management
|       |   `-- gameState.ts  # Global game state and session storage
|       |-- renderers/        # UI rendering functions
|       |   |-- landingRenderer.ts  # Landing page renderer
|       |   |-- commonRenderers.ts  # Header, players, logs renderers
|       |   `-- phaseRenderers.ts   # Game phase renderers
|       |-- handlers/         # Event handlers
|       |   |-- landingHandlers.ts  # Landing page event handlers
|       |   |-- commonHandlers.ts   # Common UI event handlers
|       |   `-- phaseHandlers.ts    # Game phase event handlers
|       `-- utils/            # Utility functions
|           `-- helpers.ts    # Client helper functions
|-- docs/                     # Documentation
|-- package.json              # Dependencies and scripts
`-- README.md                 # Project README
```

## Server-Side Architecture

### Config Layer
- `constants.ts`: Contains all game constants, role information, and default configurations
- `src/shared/constants.ts`: Shared timing constants (phase/transition delays) used by client + server

### Models Layer
- `room.ts`: Room creation, storage, and retrieval
- `player.ts`: Player creation and socket-player mapping

### Managers Layer
Business logic separated by concern:
- `roleManager.ts`: Role configuration, validation, and assignment
- `phaseManager.ts`: Phase transitions and scheduling
- `nightManager.ts`: Night phase actions (wolf votes, seer, witch)
- `voteManager.ts`: Day voting and elimination
- `deathManager.ts`: Death queue, resolution, and win condition checking
- `broadcastManager.ts`: Room state sanitization and broadcasting

### Handlers Layer
- `socketHandlers.ts`: All Socket.IO event handlers organized by game phase

### Utils Layer
- `helpers.ts`: Common utility functions (shuffle, sanitize, logging)

## Client-Side Architecture

### Config Layer
- `constants.ts`: Role details and UI constants
- `src/shared/constants.ts`: Timing constants used to display transition durations

### State Layer
- `gameState.ts`: Global state management and localStorage session handling

### Renderers Layer
UI rendering functions organized by screen:
- `landingRenderer.ts`: Initial landing page
- `commonRenderers.ts`: Header, players list, event logs
- `phaseRenderers.ts`: All game phase-specific UI (lobby, roleReveal, armor, night, day)

### Handlers Layer
Event handlers separated by functionality:
- `landingHandlers.ts`: Room creation, joining, resuming
- `commonHandlers.ts`: Common actions (toggle role, leave game, hunter overlay)
- `phaseHandlers.ts`: Phase-specific interactions (voting, role actions)

### Utils Layer
- `helpers.ts`: Helper functions for notifications and formatting

## Module Dependencies

### Server Dependencies
```
server.ts
  -> socketHandlers.ts
       -> models/ (room, player)
       -> managers/ (role, phase, night, vote, death, broadcast)
       -> utils/ (helpers)
```

### Client Dependencies
```
main.ts
  -> state/gameState.ts
  -> renderers/ (landing, common, phase)
  -> handlers/ (landing, common, phase)
  -> utils/helpers.ts
```

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
1. Add shared timing constants to `src/shared/constants.ts` when both client + server need them
2. Add server-only constants to `src/server/config/constants.ts`
2. Update models if new data structures are needed
3. Add business logic to appropriate manager
4. Add socket event handlers to `src/server/handlers/socketHandlers.ts`

**Client-side:**
1. Add shared timing constants to `src/shared/constants.ts` when both client + server need them
2. Add client-only constants to `client/src/config/constants.ts`
2. Update state management if needed
3. Add rendering functions to appropriate renderer
4. Add event handlers to appropriate handler module
5. Update `client/src/main.ts` if new top-level functionality is needed

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
