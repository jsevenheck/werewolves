# Werewolves Codebase Structure

This document describes the refactored codebase structure.

## Project Structure

```
werewolves/
├── server.js                 # Main server entry point
├── src/                      # Server-side code
│   └── server/
│       ├── config/           # Configuration and constants
│       │   └── constants.js  # Game constants, role info, defaults
│       ├── models/           # Data models
│       │   ├── room.js       # Room creation and management
│       │   └── player.js     # Player creation and socket index
│       ├── managers/         # Business logic managers
│       │   ├── roleManager.js      # Role assignment and validation
│       │   ├── phaseManager.js     # Game phase transitions
│       │   ├── nightManager.js     # Night phase logic
│       │   ├── voteManager.js      # Day voting logic
│       │   ├── deathManager.js     # Death resolution and win conditions
│       │   └── broadcastManager.js # Room state broadcasting
│       ├── handlers/         # Socket event handlers
│       │   └── socketHandlers.js   # All socket.io event handlers
│       └── utils/            # Utility functions
│           └── helpers.js    # Helper functions
├── public/                   # Client-side code
│   ├── index.html            # Main HTML file
│   ├── style.css             # Styles
│   ├── app.js                # Main client entry point
│   └── js/                   # Client JavaScript modules
│       ├── config/           # Client configuration
│       │   └── constants.js  # Role details and constants
│       ├── state/            # State management
│       │   └── gameState.js  # Global game state and session storage
│       ├── renderers/        # UI rendering functions
│       │   ├── landingRenderer.js  # Landing page renderer
│       │   ├── commonRenderers.js  # Header, players, logs renderers
│       │   └── phaseRenderers.js   # Game phase renderers
│       ├── handlers/         # Event handlers
│       │   ├── landingHandlers.js  # Landing page event handlers
│       │   ├── commonHandlers.js   # Common UI event handlers
│       │   └── phaseHandlers.js    # Game phase event handlers
│       └── utils/            # Utility functions
│           └── helpers.js    # Client helper functions
├── docs/                     # Documentation
├── package.json              # Dependencies and scripts
└── README.md                 # Project README
```

## Server-Side Architecture

### Config Layer
- `constants.js`: Contains all game constants, role information, and default configurations

### Models Layer
- `room.js`: Room creation, storage, and retrieval
- `player.js`: Player creation and socket-player mapping

### Managers Layer
Business logic separated by concern:
- `roleManager.js`: Role configuration, validation, and assignment
- `phaseManager.js`: Phase transitions and scheduling
- `nightManager.js`: Night phase actions (wolf votes, seer, witch)
- `voteManager.js`: Day voting and elimination
- `deathManager.js`: Death queue, resolution, and win condition checking
- `broadcastManager.js`: Room state sanitization and broadcasting

### Handlers Layer
- `socketHandlers.js`: All Socket.IO event handlers organized by game phase

### Utils Layer
- `helpers.js`: Common utility functions (shuffle, sanitize, logging)

## Client-Side Architecture

### Config Layer
- `constants.js`: Role details and UI constants

### State Layer
- `gameState.js`: Global state management and localStorage session handling

### Renderers Layer
UI rendering functions organized by screen:
- `landingRenderer.js`: Initial landing page
- `commonRenderers.js`: Header, players list, event logs
- `phaseRenderers.js`: All game phase-specific UI (lobby, roleReveal, armor, night, day)

### Handlers Layer
Event handlers separated by functionality:
- `landingHandlers.js`: Room creation, joining, resuming
- `commonHandlers.js`: Common actions (toggle role, leave game, hunter overlay)
- `phaseHandlers.js`: Phase-specific interactions (voting, role actions)

### Utils Layer
- `helpers.js`: Helper functions for notifications and formatting

## Module Dependencies

### Server Dependencies
```
server.js
  └─> socketHandlers.js
       ├─> models/ (room, player)
       ├─> managers/ (role, phase, night, vote, death, broadcast)
       └─> utils/ (helpers)
```

### Client Dependencies
```
app.js
  ├─> state/gameState.js
  ├─> renderers/ (landing, common, phase)
  ├─> handlers/ (landing, common, phase)
  └─> utils/helpers.js
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
1. Add constants to `src/server/config/constants.js`
2. Update models if new data structures are needed
3. Add business logic to appropriate manager
4. Add socket event handlers to `src/server/handlers/socketHandlers.js`

**Client-side:**
1. Add constants to `public/js/config/constants.js`
2. Update state management if needed
3. Add rendering functions to appropriate renderer
4. Add event handlers to appropriate handler module
5. Update `app.js` if new top-level functionality is needed

### Module Export/Import Pattern

**Server (CommonJS):**
```javascript
// Exporting
module.exports = { functionName };

// Importing
const { functionName } = require('./path/to/module');
```

**Client (ES Modules):**
```javascript
// Exporting
export { functionName };

// Importing
import { functionName } from './path/to/module.js';
```

## Testing

To test the refactored application:

```bash
# Install dependencies
npm install

# Start the server
npm start

# The server will be available at http://localhost:3001
```

Test basic functionality:
- Create a room
- Join as multiple players
- Start a game
- Test all role actions
- Complete a full game cycle

## Migration Notes

All functionality from the original two-file structure has been preserved:
- Original `server.js` (871 lines) → Modular server structure (22 files)
- Original `public/app.js` (907 lines) → Modular client structure (11 files)

No breaking changes were introduced. The application behavior remains identical.
