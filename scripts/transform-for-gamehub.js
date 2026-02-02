#!/usr/bin/env node

/**
 * Transform Werewolves game into Game Hub-compatible structure
 * 
 * This script creates a game-export/ directory with the Werewolves game
 * structured for integration into the Game Hub platform.
 * 
 * Usage: node scripts/transform-for-gamehub.js
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXPORT_DIR = path.join(ROOT_DIR, 'game-export', 'werewolves');

// Source directories
const SOURCE_DIRS = {
  web: path.join(ROOT_DIR, 'ui-vue', 'src'),
  server: path.join(ROOT_DIR, 'server', 'src'),
  shared: path.join(ROOT_DIR, 'core', 'src'),
};

// Target directories
const TARGET_DIRS = {
  web: path.join(EXPORT_DIR, 'web', 'src'),
  server: path.join(EXPORT_DIR, 'server', 'src'),
  shared: path.join(EXPORT_DIR, 'shared', 'src'),
};

/**
 * Recursively copy directory
 */
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Warning: Source directory does not exist: ${src}`);
    return;
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Create package.json files for each sub-package
 */
function createPackageJsonFiles() {
  const webPackageJson = {
    name: '@game-hub/game-werewolves-web',
    version: '1.0.0',
    type: 'module',
    main: 'src/Werewolves.vue',
    scripts: {
      typecheck: 'vue-tsc --noEmit',
    },
    dependencies: {
      '@game-hub/game-werewolves-shared': 'workspace:*',
      'socket.io-client': '^4.8.3',
      'vue': '^3.5.0',
    },
    devDependencies: {
      'vue-tsc': '^2.2.1',
      'typescript': '^5.9.3',
    },
  };

  const serverPackageJson = {
    name: '@game-hub/game-werewolves-server',
    version: '1.0.0',
    type: 'module',
    main: 'dist/index.js',
    scripts: {
      build: 'tsup',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@game-hub/game-werewolves-shared': 'workspace:*',
      'socket.io': '^4.8.3',
      'nanoid': '^5.1.6',
    },
    devDependencies: {
      'tsup': '^8.4.2',
      'typescript': '^5.9.3',
      '@types/node': '^22.19.7',
    },
  };

  const sharedPackageJson = {
    name: '@game-hub/game-werewolves-shared',
    version: '1.0.0',
    type: 'module',
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    scripts: {
      build: 'tsup',
      typecheck: 'tsc --noEmit',
    },
    devDependencies: {
      'tsup': '^8.4.2',
      'typescript': '^5.9.3',
    },
  };

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'web', 'package.json'),
    JSON.stringify(webPackageJson, null, 2) + '\n'
  );

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'server', 'package.json'),
    JSON.stringify(serverPackageJson, null, 2) + '\n'
  );

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'shared', 'package.json'),
    JSON.stringify(sharedPackageJson, null, 2) + '\n'
  );

  console.log('✓ Created package.json files');
}

/**
 * Create tsconfig.json files for each sub-package
 */
function createTsConfigFiles() {
  const webTsConfig = {
    extends: '../../../tsconfig.base.json',
    compilerOptions: {
      jsx: 'preserve',
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      types: ['vite/client'],
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      allowImportingTsExtensions: true,
      noEmit: true,
    },
    include: ['src/**/*'],
  };

  const serverTsConfig = {
    extends: '../../../tsconfig.base.json',
    compilerOptions: {
      module: 'ESNext',
      target: 'ES2022',
      lib: ['ES2022'],
      moduleResolution: 'bundler',
      outDir: 'dist',
      rootDir: 'src',
    },
    include: ['src/**/*'],
  };

  const sharedTsConfig = {
    extends: '../../../tsconfig.base.json',
    compilerOptions: {
      module: 'ESNext',
      target: 'ES2022',
      lib: ['ES2022'],
      moduleResolution: 'bundler',
      outDir: 'dist',
      rootDir: 'src',
      declaration: true,
    },
    include: ['src/**/*'],
  };

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'web', 'tsconfig.json'),
    JSON.stringify(webTsConfig, null, 2) + '\n'
  );

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'server', 'tsconfig.json'),
    JSON.stringify(serverTsConfig, null, 2) + '\n'
  );

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'shared', 'tsconfig.json'),
    JSON.stringify(sharedTsConfig, null, 2) + '\n'
  );

  console.log('✓ Created tsconfig.json files');
}

/**
 * Create tsup config files for server and shared packages
 */
function createTsupConfigs() {
  const serverTsupConfig = `import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
`;

  const sharedTsupConfig = `import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
`;

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'server', 'tsup.config.ts'),
    serverTsupConfig
  );

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'shared', 'tsup.config.ts'),
    sharedTsupConfig
  );

  console.log('✓ Created tsup.config.ts files');
}

/**
 * Create Vue component wrapper for Game Hub integration
 */
function createVueWrapper() {
  const wrapperContent = `<template>
  <div class="werewolves-game">
    <!-- 
      TODO: Integrate the Werewolves game with Game Hub
      
      This is a TEMPLATE component that needs manual adaptation.
      
      Game Hub Props:
      - partyId: string - The party/room ID
      - playerId: string - The current player's ID
      - isHost: boolean - Whether the player is the party host
      - gameSocket: Socket - Socket.IO connection for game communication
      - onReady: () => void - Callback to signal game is ready
      - onError: (error: Error) => void - Callback for error reporting
      
      Integration Steps:
      1. Import the main App component from './App.vue'
      2. Set up socket event handlers using gameSocket
      3. Pass partyId and playerId to the game state
      4. Connect isHost to the game's host detection logic
      5. Call onReady() when the game UI is initialized
      6. Call onError() if any critical errors occur
      7. Handle game-specific socket events (join, vote, etc.)
      
      Example socket setup:
        gameSocket.emit('werewolf:join', { partyId, playerId, ...playerData });
        gameSocket.on('werewolf:state', (state) => { ... });
      
      See the original App.vue and socket composables for the full implementation.
    -->
    <div class="game-placeholder">
      <h2>Werewolves Game - Integration Needed</h2>
      <p>Party ID: {{ partyId }}</p>
      <p>Player ID: {{ playerId }}</p>
      <p>Is Host: {{ isHost }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import type { Socket } from 'socket.io-client';

// Game Hub integration props
interface Props {
  partyId: string;
  playerId: string;
  isHost: boolean;
  gameSocket: Socket;
  onReady: () => void;
  onError: (error: Error) => void;
}

const props = defineProps<Props>();

onMounted(() => {
  try {
    // TODO: Initialize game state
    // TODO: Set up socket event listeners
    // TODO: Join the game room
    
    // Signal that the game is ready
    props.onReady();
  } catch (error) {
    props.onError(error as Error);
  }
});

onUnmounted(() => {
  // TODO: Clean up socket listeners
  // TODO: Leave the game room
});
</script>

<style scoped>
.werewolves-game {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.game-placeholder {
  padding: 2rem;
  text-align: center;
}
</style>
`;

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'web', 'src', 'Werewolves.vue'),
    wrapperContent
  );

  console.log('✓ Created Werewolves.vue wrapper component');
}

/**
 * Create server entry point with game definition
 */
function createServerEntry() {
  const serverEntryContent = `/**
 * Werewolves Game - Game Hub Integration Entry Point
 * 
 * This file exports the game definition and initialization function
 * for Game Hub integration.
 * 
 * TODO: This is a TEMPLATE that needs manual adaptation.
 * 
 * Integration Steps:
 * 1. Import socket handlers from the copied server code
 * 2. Set up the socket.io event listeners in initializeGame()
 * 3. Map Game Hub's context (partyId, playerId) to Werewolves' room/player model
 * 4. Ensure proper namespacing of socket events (e.g., 'werewolf:join')
 * 5. Handle cleanup when the game ends or party disbands
 * 
 * See the original server/src/handlers/socketHandlers.ts for the full implementation.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';

export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  icon: string;
}

export interface GameContext {
  partyId: string;
  playerId: string;
  isHost: boolean;
}

export const gameDefinition: GameDefinition = {
  id: 'werewolves',
  name: 'Werewolves',
  description: 'A moderator-free social deduction game. Villagers try to identify werewolves during the day, while werewolves hunt at night. Special roles add strategic depth.',
  minPlayers: 5,
  maxPlayers: 20,
  icon: '🐺',
};

/**
 * Initialize the Werewolves game for a specific party
 * 
 * @param io - Socket.IO server instance
 * @param socket - The client socket connection
 * @param context - Game Hub context (partyId, playerId, isHost)
 */
export function initializeGame(
  io: SocketIOServer,
  socket: Socket,
  context: GameContext
): void {
  // TODO: Set up socket event handlers
  // TODO: Map partyId to room code
  // TODO: Handle player joins/leaves
  // TODO: Delegate to existing Werewolves socket handlers
  
  console.log(\`Werewolves game initialized for party \${context.partyId}\`);
  
  // Example event handler structure:
  socket.on('werewolf:join', (data) => {
    // Handle player join
  });
  
  socket.on('werewolf:startGame', (data) => {
    // Handle game start
  });
  
  socket.on('werewolf:vote', (data) => {
    // Handle voting
  });
  
  socket.on('disconnect', () => {
    // Handle player disconnect
  });
  
  // More event handlers...
}
`;

  // Also create an index.ts that exports from the entry point
  const indexContent = `export { gameDefinition, initializeGame } from './index';
export type { GameDefinition, GameContext } from './index';
`;

  const targetServerSrc = path.join(EXPORT_DIR, 'server', 'src');
  
  // Rename the copied index.ts if it exists to avoid conflicts
  const originalIndexPath = path.join(targetServerSrc, 'index.ts');
  if (fs.existsSync(originalIndexPath)) {
    fs.renameSync(originalIndexPath, path.join(targetServerSrc, 'server-original.ts'));
    console.log('✓ Renamed original server index.ts to server-original.ts');
  }

  fs.writeFileSync(
    originalIndexPath,
    serverEntryContent
  );

  console.log('✓ Created server entry point');
}

/**
 * Create README for the exported game
 */
function createReadme() {
  const readmeContent = `# Werewolves Game - Game Hub Integration

This directory contains the Werewolves game structured for Game Hub integration.

## ⚠️ Important: Manual Adaptation Required

This export is a **TEMPLATE** that requires manual integration work:

### Web Component (web/src/Werewolves.vue)
- [ ] Import and integrate the main App.vue component
- [ ] Connect Game Hub props (partyId, playerId, isHost, gameSocket)
- [ ] Set up socket event handlers using the provided gameSocket
- [ ] Call onReady() when initialized and onError() on failures
- [ ] Map Game Hub's party/player model to Werewolves' room/player structure

### Server Handler (server/src/index.ts)
- [ ] Import socket handlers from the copied server code
- [ ] Implement initializeGame() to set up all socket listeners
- [ ] Map Game Hub's partyId to Werewolves' room code system
- [ ] Ensure proper event namespacing (e.g., 'werewolf:join')
- [ ] Handle cleanup on game end or party disband

### Shared Types (shared/src/)
- [ ] Review and ensure all types are exported correctly
- [ ] Update import paths if needed for Game Hub structure
- [ ] Verify no standalone-specific types leak through

## Structure

\`\`\`
werewolves/
├── web/           # Vue component
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── Werewolves.vue  # Game Hub integration wrapper (TEMPLATE)
│       └── ...             # Original UI components
├── server/        # Socket.IO handler
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   └── src/
│       ├── index.ts              # Game Hub entry point (TEMPLATE)
│       ├── server-original.ts    # Original server entry
│       └── ...                   # Original server code
└── shared/        # Shared types
    ├── package.json
    ├── tsconfig.json
    ├── tsup.config.ts
    └── src/
        └── ...    # Shared types and constants
\`\`\`

## Game Info

- **Name:** Werewolves
- **Type:** Social Deduction / Party Game
- **Players:** 5-20
- **Description:** A moderator-free implementation of the classic Mafia/Werewolf party game

## Development

Each sub-package can be type-checked independently:

\`\`\`bash
cd web && pnpm typecheck
cd server && pnpm typecheck
cd shared && pnpm typecheck
\`\`\`

Build server and shared packages:

\`\`\`bash
cd server && pnpm build
cd shared && pnpm build
\`\`\`

## Source Repository

This game was generated from: https://github.com/jsevenheck/werewolves

Original standalone deployment is available at the source repository.

## Integration Checklist

Before submitting a PR to Game Hub:

- [ ] Vue wrapper component properly integrates with Game Hub props
- [ ] Server handlers use Game Hub's socket and context
- [ ] All socket events are properly namespaced
- [ ] Game state syncs correctly with party state
- [ ] Player joins/leaves are handled
- [ ] Error handling calls onError() appropriately
- [ ] No standalone-specific code remains
- [ ] Type checking passes for all sub-packages
- [ ] Manual testing in Game Hub environment successful

## Notes

- The transform script creates this structure automatically on CI
- Manual adaptation is required before the game is fully functional in Game Hub
- See the original source repository for the complete standalone implementation
`;

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'README.md'),
    readmeContent
  );

  console.log('✓ Created README.md');
}

/**
 * Main transform function
 */
function transform() {
  console.log('Starting Werewolves → Game Hub transformation...\n');

  // Clean and create export directory
  if (fs.existsSync(EXPORT_DIR)) {
    fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
    console.log('✓ Cleaned existing export directory');
  }

  // Copy source files
  console.log('\nCopying source files...');
  copyDir(SOURCE_DIRS.web, TARGET_DIRS.web);
  console.log('✓ Copied ui-vue/src → web/src');

  copyDir(SOURCE_DIRS.server, TARGET_DIRS.server);
  console.log('✓ Copied server/src → server/src');

  copyDir(SOURCE_DIRS.shared, TARGET_DIRS.shared);
  console.log('✓ Copied core/src → shared/src');

  // Create configuration files
  console.log('\nCreating configuration files...');
  createPackageJsonFiles();
  createTsConfigFiles();
  createTsupConfigs();

  // Create integration templates
  console.log('\nCreating integration templates...');
  createVueWrapper();
  createServerEntry();
  createReadme();

  console.log('\n✅ Transformation complete!');
  console.log(`\nExported to: ${EXPORT_DIR}`);
  console.log('\n⚠️  Remember: This is a TEMPLATE that requires manual adaptation.');
  console.log('See game-export/werewolves/README.md for integration checklist.\n');
}

// Run the transform
try {
  transform();
} catch (error) {
  console.error('\n❌ Transformation failed:', error);
  process.exit(1);
}
