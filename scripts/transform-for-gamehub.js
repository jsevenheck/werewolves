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

  console.log('âœ“ Created package.json files');
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

  console.log('âœ“ Created tsconfig.json files');
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

  console.log('âœ“ Created tsup.config.ts files');
}

/**
 * Create Vue component wrapper for Game Hub integration
 */
function createVueWrapper() {
  const wrapperContent = `<template>
  <div class="werewolves-game">
    <GameComponent
      :standalone="false"
      :session-id="props.sessionId"
      :join-token="props.joinToken"
      :ws-namespace="props.wsNamespace"
      :api-base-url="props.apiBaseUrl || ''"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { GameComponent } from './index';

// Game Hub integration props (from party:gameStarted)
interface Props {
  gameId: string;
  sessionId: string;
  wsNamespace: string;
  joinToken: string;
  apiBaseUrl?: string;
  onReady: () => void;
  onError: (error: Error) => void;
}

const props = defineProps<Props>();

onMounted(() => {
  try {
    props.onReady();
  } catch (error) {
    props.onError(error as Error);
  }
});
</script>

<style scoped>
.werewolves-game {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
`;

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'web', 'src', 'Werewolves.vue'),
    wrapperContent
  );

  console.log('Created Werewolves.vue wrapper component');
}

/**
 * Create README for the exported game
 */
function createReadme() {
  const readmeContent = `# Werewolves Game - Game Hub Integration

This directory contains the Werewolves game structured for Game Hub integration.

## Important: Manual Adaptation Required

This export is a TEMPLATE that still needs integration work:

### Web Component (web/src/Werewolves.vue)
- [ ] Pass Game Hub props from \`party:gameStarted\` (\`sessionId\`, \`joinToken\`, \`wsNamespace\`, \`apiBaseUrl\`).
- [ ] Decide how to map platform \`sessionId\` to the game's room-code flow (auto-create/join or a mapping table).
- [ ] Hide or replace the room-code landing UI if you want a seamless hub experience.
- [ ] Call onReady() when initialized and onError() on failures.

### Server Handler (server/src/index.ts)
- [ ] The server package already exports \`registerWerewolf(io)\` for namespace setup.
- [ ] Ensure the hub registers it under \`/g/<gameId>\` (gameId = \`werewolves\`).
- [ ] Add any platform-specific auth checks in the namespace middleware if required.

### Shared Types (shared/src/)
- [ ] Review and ensure all types are exported correctly.
- [ ] Update import paths if needed for Game Hub structure.
- [ ] Verify no standalone-only assumptions leak through.

## Structure

\`\`\`
werewolves/
+-- web/           # Vue component
|   +-- package.json
|   +-- tsconfig.json
|   +-- src/
|       +-- Werewolves.vue  # Game Hub wrapper (TEMPLATE)
|       +-- ...             # Original UI components
+-- server/        # Socket.IO handler
|   +-- package.json
|   +-- tsconfig.json
|   +-- tsup.config.ts
|   +-- src/
|       +-- index.ts        # registerWerewolf(io) export
|       +-- ...             # Original server code
+-- shared/        # Shared types
    +-- package.json
    +-- tsconfig.json
    +-- tsup.config.ts
    +-- src/
        +-- ...    # Shared types and constants
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

- [ ] Web wrapper passes \`sessionId\`, \`joinToken\`, and \`wsNamespace\` into GameComponent
- [ ] SessionId-to-room mapping implemented (or alternate flow agreed)
- [ ] Server registers \`registerWerewolf(io)\` under \`/g/werewolves\`
- [ ] Type checking passes for all sub-packages
- [ ] Manual testing in Game Hub environment successful

## Notes

- The transform script creates this structure automatically on CI
- Manual adaptation is required before the game is fully functional in Game Hub
- The game uses room codes internally; the platform session is not automatically mapped
`;

  fs.writeFileSync(
    path.join(EXPORT_DIR, 'README.md'),
    readmeContent
  );

  console.log('Created README.md');
}
/**
 * Main transform function
 */
function transform() {
  console.log('Starting Werewolves â†’ Game Hub transformation...\n');

  // Clean and create export directory
  if (fs.existsSync(EXPORT_DIR)) {
    fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
    console.log('âœ“ Cleaned existing export directory');
  }

  // Copy source files
  console.log('\nCopying source files...');
  copyDir(SOURCE_DIRS.web, TARGET_DIRS.web);
  console.log('âœ“ Copied ui-vue/src â†’ web/src');

  copyDir(SOURCE_DIRS.server, TARGET_DIRS.server);
  console.log('âœ“ Copied server/src â†’ server/src');

  copyDir(SOURCE_DIRS.shared, TARGET_DIRS.shared);
  console.log('âœ“ Copied core/src â†’ shared/src');

  // Create configuration files
  console.log('\nCreating configuration files...');
  createPackageJsonFiles();
  createTsConfigFiles();
  createTsupConfigs();

  // Create integration templates
  console.log('\nCreating integration templates...');
  createVueWrapper();

  createReadme();

  console.log('\nâœ… Transformation complete!');
  console.log(`\nExported to: ${EXPORT_DIR}`);
  console.log('\nâš ï¸  Remember: This is a TEMPLATE that requires manual adaptation.');
  console.log('See game-export/werewolves/README.md for integration checklist.\n');
}

// Run the transform
try {
  transform();
} catch (error) {
  console.error('\nâŒ Transformation failed:', error);
  process.exit(1);
}





