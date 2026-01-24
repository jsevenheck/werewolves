# Agent Instructions - Werewolves Game

**Role:** Senior Lead Engineer

**Version:** 1.1.0 | **Last Updated:** 2026-01-24

---

## Table of Contents

1. [Quick Start for Agents](#quick-start-for-agents)
2. [Overview](#overview)
3. [Repository Structure](#repository-structure)
4. [Decision Trees](#decision-trees)
5. [Aligning Changes to Current Structure](#aligning-changes-to-current-structure)
6. [Test Coverage Requirements](#test-coverage-requirements)
7. [Documentation Standards](#documentation-standards)
8. [Code Quality and Best Practices](#code-quality-and-best-practices)
9. [Common Pitfalls (and how to avoid them)](#common-pitfalls-and-how-to-avoid-them)
10. [Development Workflow](#development-workflow)
11. [Quick Reference](#quick-reference)
12. [Troubleshooting](#troubleshooting)
13. [Agent Guidelines Summary](#agent-guidelines-summary)
14. [Contact and Resources](#contact-and-resources)
15. [Document Changelog](#document-changelog)

---

## Quick Start for Agents

### First-time setup (do this first)

1. **Read `docs/structure.md`** (5 min) - This is the SOURCE OF TRUTH for codebase organization
2. **Install dependencies:** `pnpm install`
3. **Verify setup:** `pnpm run typecheck && pnpm test`
4. **Scan this document's Table of Contents** to understand available guidance

### Before making any change

1. **Identify which layer(s) are affected:**
   - Config layer (constants, role definitions)
   - Model layer (data structures)
   - Manager layer (business logic)
   - Handler layer (event handling)
   - Renderer layer (UI)

2. **Check existing tests** for similar patterns in `__tests__/` or `e2e/`

3. **Plan your change:**
   - What needs to change?
   - What tests are needed?
   - What documentation needs updating?

4. **Use the [Decision Trees](#decision-trees)** section if unsure where code belongs

---

## Overview

This document provides comprehensive guidance for AI agents working on the Werewolves (Moderator-Free Mafia) repository. The goal is to maintain high code quality, consistent structure, comprehensive test coverage, and clear documentation while making changes to the codebase.

### Technology Stack

- **Server:** Node.js/Express with Socket.IO (CommonJS)
- **Client:** Vite-powered SPA with Socket.IO client (ES Modules)
- **Shared:** Type-safe Socket.IO events and shared types
- **Package Manager:** pnpm (version 10.28.1)
- **Testing:** Jest for unit tests, Playwright for E2E tests
- **Language:** TypeScript (strict mode)

---

## Repository Structure

### Core Directory Structure

```
werewolves/
├── server.ts                    # Main server entry point
├── src/
│   ├── server/                  # Server-side code
│   │   ├── config/              # Game constants and configuration
│   │   ├── models/              # Data models (Room, Player)
│   │   ├── managers/            # Business logic (phases, voting, deaths, etc.)
│   │   ├── handlers/            # Socket.IO event handlers
│   │   └── utils/               # Helper functions
│   └── shared/                  # Shared types and events (client + server)
│       ├── events.ts            # Socket.IO event contracts
│       ├── types.ts             # Shared data structures
│       └── constants.ts         # Shared timing constants
├── client/                      # Vite client workspace
│   ├── index.html
│   └── src/
│       ├── main.ts              # Client entry point
│       ├── config/              # Client constants
│       ├── state/               # State management
│       ├── renderers/           # UI rendering
│       ├── handlers/            # Event handlers
│       └── utils/               # Client helpers
├── __tests__/                   # Jest unit tests
├── e2e/                         # Playwright E2E tests
├── docs/                        # Documentation
└── dist/                        # Build output (not committed)
```

### Architecture Layers

```
┌─────────────────────────────────────────┐
│         Handlers Layer                  │  ← Socket.IO event handlers (thin)
├─────────────────────────────────────────┤
│         Managers Layer                  │  ← Business logic (thick)
├─────────────────────────────────────────┤
│         Models Layer                    │  ← Data structures
├─────────────────────────────────────────┤
│         Config Layer                    │  ← Constants & configuration
└─────────────────────────────────────────┘
```

**Key Principle:** Data flows down, dependencies flow down. Handlers depend on managers, managers depend on models, models depend on config.

---

## Decision Trees

### "Where does this code belong?"

#### For Constants

```
Is it a constant?
├─ Shared by client AND server?
│  └─ → src/shared/constants.ts
├─ Server-only?
│  └─ → src/server/config/constants.ts
└─ Client-only?
   └─ → client/src/config/constants.ts
```

#### For Business Logic

```
Is it business logic?
├─ Role assignment or role-specific behavior?
│  └─ → src/server/managers/roleManager.ts
├─ Phase transitions (day/night/discussion)?
│  └─ → src/server/managers/phaseManager.ts
├─ Night actions (werewolf kills, seer checks, etc.)?
│  └─ → src/server/managers/nightManager.ts
├─ Voting mechanics?
│  └─ → src/server/managers/voteManager.ts
├─ Death resolution or win condition checking?
│  └─ → src/server/managers/deathManager.ts
└─ Broadcasting state to clients?
   └─ → src/server/managers/broadcastManager.ts
```

#### For Data Structures

```
Is it a data structure/type?
├─ Shared between client and server?
│  ├─ Socket.IO event contract?
│  │  └─ → src/shared/events.ts
│  └─ Shared data type (Player, Room, etc.)?
│     └─ → src/shared/types.ts
├─ Server-only model?
│  ├─ Room-related?
│  │  └─ → src/server/models/room.ts
│  └─ Player-related?
│     └─ → src/server/models/player.ts
└─ Client-only state?
   └─ → client/src/state/gameState.ts
```

#### For UI Code

```
Is it UI-related?
├─ Landing page (join/create room)?
│  ├─ Rendering → client/src/renderers/landingRenderer.ts
│  └─ Event handling → client/src/handlers/landingHandlers.ts
├─ Common elements (header, player list, logs)?
│  ├─ Rendering → client/src/renderers/commonRenderers.ts
│  └─ Event handling → client/src/handlers/commonHandlers.ts
└─ Game phase UI (night/day/voting)?
   ├─ Rendering → client/src/renderers/phaseRenderers.ts
   └─ Event handling → client/src/handlers/phaseHandlers.ts
```

#### For Tests

```
What am I testing?
├─ Pure business logic (no I/O)?
│  └─ → __tests__/<moduleName>.test.ts (Jest unit test)
├─ Complete user workflow?
│  └─ → e2e/<feature>.spec.ts (Playwright E2E test)
└─ UI rendering?
   └─ → __tests__/renderers/<renderer>.test.ts (Jest with DOM mocks)
```

---

## Aligning Changes to Current Structure

### General Principles

1. **Separation of Concerns:** Keep each module focused on a single responsibility
2. **Layer Organization:** Respect the layered architecture (config → models → managers → handlers)
3. **Shared vs. Specific:** Use `src/shared/` only for types/constants needed by both client and server
4. **Module Patterns:** Use ES6 export/import syntax consistently
5. **Type Safety First:** Define types before implementing logic

### Server-Side Changes

When modifying or adding server-side features:

#### 1. Constants

- **Server-only constants:** `src/server/config/constants.ts`
  ```typescript
  // Example: Server-only configuration
  export const MAX_PLAYERS_PER_ROOM = 20;
  export const ROOM_CODE_LENGTH = 6;
  ```

- **Shared timing constants:** `src/shared/constants.ts`
  ```typescript
  // Example: Timing constants used by both client and server
  export const NIGHT_PHASE_DURATION = 60000; // 60 seconds
  export const DAY_PHASE_DURATION = 120000;  // 2 minutes
  ```

#### 2. Data Models

- **Room data:** `src/server/models/room.ts`
  ```typescript
  export interface Room {
    code: string;
    players: Player[];
    phase: GamePhase;
    // ...
  }
  ```

- **Player data:** `src/server/models/player.ts`
  ```typescript
  export interface Player {
    id: string;
    name: string;
    role: Role;
    // ...
  }
  ```

#### 3. Business Logic (Managers)

| Manager | Responsibility |
|---------|---------------|
| `roleManager.ts` | Role assignment, role-specific abilities |
| `phaseManager.ts` | Phase transitions, phase timers |
| `nightManager.ts` | Night action processing (kills, checks, protections) |
| `voteManager.ts` | Vote tracking, vote resolution |
| `deathManager.ts` | Death processing, win condition checking |
| `broadcastManager.ts` | State sanitization and broadcasting to clients |

**Key Rule:** Managers contain the "thick" business logic. Handlers should be "thin" and delegate to managers.

#### 4. Socket Handlers

- **Location:** `src/server/handlers/socketHandlers.ts`
- **Pattern:**
  ```typescript
  socket.on('vote:cast', (data: VoteCastData) => {
    // 1. Validate input
    // 2. Delegate to manager
    const result = voteManager.castVote(socket.id, data.targetId);
    // 3. Broadcast result
    broadcastManager.broadcastVoteUpdate(io, roomCode);
  });
  ```

**Keep handlers thin** - they should:
- Validate input
- Call manager functions
- Handle errors
- NOT contain business logic

#### 5. Shared Types

- **Event contracts:** `src/shared/events.ts`
  ```typescript
  export interface ServerToClientEvents {
    'room:joined': (data: { roomCode: string; players: Player[] }) => void;
    'phase:changed': (data: { phase: GamePhase; duration: number }) => void;
  }

  export interface ClientToServerEvents {
    'room:join': (data: { roomCode: string; playerName: string }) => void;
    'vote:cast': (data: { targetId: string }) => void;
  }
  ```

- **Shared data structures:** `src/shared/types.ts`
  ```typescript
  export type Role = 'werewolf' | 'villager' | 'seer' | 'doctor';
  export type GamePhase = 'lobby' | 'night' | 'day' | 'discussion' | 'voting' | 'ended';
  ```

### Client-Side Changes

When modifying or adding client-side features:

#### 1. Constants

- **Client-only constants:** `client/src/config/constants.ts`
  ```typescript
  // Example: UI-specific constants
  export const ROLE_COLORS = {
    werewolf: '#8B0000',
    villager: '#228B22',
    seer: '#4169E1',
    doctor: '#FFD700',
  };
  ```

#### 2. State Management

- **Global state:** `client/src/state/gameState.ts`
  ```typescript
  export interface GameState {
    roomCode: string | null;
    playerId: string | null;
    players: Player[];
    phase: GamePhase;
    // ...
  }
  ```

- **Persistence:** Use localStorage for session persistence
  ```typescript
  localStorage.setItem('playerId', playerId);
  const savedPlayerId = localStorage.getItem('playerId');
  ```

#### 3. UI Rendering

| Renderer | Responsibility |
|----------|---------------|
| `landingRenderer.ts` | Render join/create room screens |
| `commonRenderers.ts` | Render header, player list, game logs |
| `phaseRenderers.ts` | Render phase-specific UI (night actions, voting) |

**Pattern:**
```typescript
export function renderPlayerList(players: Player[], currentPlayerId: string): void {
  const container = document.getElementById('player-list');
  if (!container) return;

  container.innerHTML = players.map(p => `
    <div class="player ${p.id === currentPlayerId ? 'self' : ''}">
      ${p.name} ${p.isAlive ? '✓' : '☠'}
    </div>
  `).join('');
}
```

#### 4. Event Handlers

| Handler | Responsibility |
|---------|---------------|
| `landingHandlers.ts` | Handle join/create room actions |
| `commonHandlers.ts` | Handle common game actions |
| `phaseHandlers.ts` | Handle phase-specific actions (vote, night action) |

**Pattern:**
```typescript
export function setupVoteHandlers(socket: Socket): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('vote-button')) {
      const targetId = target.dataset.playerId;
      socket.emit('vote:cast', { targetId });
    }
  });
}
```

#### 5. Main Entry

- **Location:** `client/src/main.ts`
- **Purpose:** Initialize socket, set up global handlers, manage app lifecycle
- **Rule:** Only update for new top-level functionality (new socket listeners, global state initialization)

### Adding New Roles

**Follow the guide in `docs/createNewRoles.md`** for detailed instructions.

**Quick checklist:**
1. ✅ Add role definition to `src/server/config/constants.ts`
2. ✅ Add role UI details to `client/src/config/constants.ts`
3. ✅ Add role-specific logic to appropriate managers
4. ✅ Update UI renderers if role needs special display
5. ✅ Add unit tests for role behavior
6. ✅ Add E2E test for role workflow
7. ✅ Update documentation

---

## Test Coverage Requirements

### Testing Philosophy

- **Test the interface, not the implementation**
- **Write tests first** (TDD approach recommended)
- **Cover happy path AND error cases**
- **Keep tests independent** (no test should depend on another)
- **Use descriptive test names** (should read like documentation)

### Unit Testing (Jest)

**Location:** `__tests__/`

#### Coverage Standards

- All manager modules must have unit tests
- Test files should mirror the source file structure
- Aim for **>80% code coverage** on critical business logic
- Use mocks for Socket.IO and external dependencies

#### Test File Naming

- **Pattern:** `<moduleName>.test.ts`
- **Examples:** 
  - `__tests__/roleManager.test.ts`
  - `__tests__/voteManager.test.ts`
  - `__tests__/renderers/phaseRenderers.test.ts`

#### Running Tests

```bash
pnpm test                    # Run all unit tests
pnpm test -- --coverage      # Run with coverage report
pnpm test -- --watch         # Watch mode for development
pnpm test -- <testName>      # Run specific test file
```

#### Required Test Coverage Areas

1. **Managers:** All business logic in `src/server/managers/`
2. **Handlers:** Socket event handlers in `src/server/handlers/`
3. **Renderers:** Client rendering functions in `client/src/renderers/`
4. **Handlers:** Client event handlers in `client/src/handlers/`
5. **Edge Cases:** Critical edge cases and error scenarios

#### Test Structure

```typescript
describe('RoleManager', () => {
  let mockPlayers: Player[];

  beforeEach(() => {
    // Setup - reset state before each test
    mockPlayers = [
      { id: '1', name: 'Alice', role: 'villager', isAlive: true },
      { id: '2', name: 'Bob', role: 'werewolf', isAlive: true },
    ];
  });

  describe('assignRoles', () => {
    it('should assign roles to all players', () => {
      const result = assignRoles(mockPlayers, { werewolves: 1, seers: 1 });
      expect(result.every(p => p.role !== undefined)).toBe(true);
    });

    it('should maintain werewolf/villager balance', () => {
      const result = assignRoles(mockPlayers, { werewolves: 1, seers: 0 });
      const werewolves = result.filter(p => p.role === 'werewolf');
      expect(werewolves.length).toBe(1);
    });

    it('should throw error if not enough players', () => {
      expect(() => assignRoles([], { werewolves: 1 }))
        .toThrow('Not enough players');
    });
  });

  afterEach(() => {
    // Cleanup if needed
  });
});
```

### Test Writing Workflow

#### 1. Identify test type needed

- **Pure logic (no I/O)?** → Unit test in `__tests__/`
- **User workflow?** → E2E test in `e2e/`
- **Component rendering?** → Unit test with DOM mocks

#### 2. Write test skeleton

```typescript
describe('Feature X', () => {
  it('should handle happy path', () => {
    // TODO: Implement
  });

  it('should handle error case Y', () => {
    // TODO: Implement
  });

  it('should validate edge case Z', () => {
    // TODO: Implement
  });
});
```

#### 3. Implement tests (TDD preferred)

1. Write failing test
2. Implement minimum code to pass
3. Refactor
4. Repeat

#### 4. Verify coverage

```bash
pnpm test -- --coverage
```

Check that:
- Statements: >80%
- Branches: >80%
- Functions: >80%
- Lines: >80%

### End-to-End Testing (Playwright)

**Location:** `e2e/`

#### Setup

```bash
# First time only - install browsers
pnpm exec playwright install

# Run E2E tests
pnpm run test:e2e

# Run with UI
pnpm exec playwright test --ui

# Run specific test
pnpm exec playwright test e2e/game-flow.spec.ts
```

#### E2E Test Guidelines

1. **Test complete user workflows**
   - Join game → Assign roles → Play night → Vote → Win condition

2. **Test multi-player scenarios**
   - Use multiple browser contexts
   - Test player interactions

3. **Test reconnection and state persistence**
   - Disconnect and reconnect
   - Verify state is restored

4. **Use Playwright's auto-waiting features**
   ```typescript
   await page.click('button:has-text("Join Game")');
   await page.waitForSelector('.game-lobby');
   ```

5. **Keep tests stable and maintainable**
   - Use data-testid attributes
   - Avoid brittle selectors
   - Use page object pattern for complex flows

#### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test.describe('Game Flow', () => {
  test('should complete a full game with werewolf win', async ({ page, context }) => {
    // Create room
    await page.goto('http://localhost:3001');
    await page.fill('input[name="playerName"]', 'Alice');
    await page.click('button:has-text("Create Room")');

    // Wait for room creation
    await page.waitForSelector('.room-code');
    const roomCode = await page.textContent('.room-code');

    // Join as second player
    const page2 = await context.newPage();
    await page2.goto('http://localhost:3001');
    await page2.fill('input[name="playerName"]', 'Bob');
    await page2.fill('input[name="roomCode"]', roomCode);
    await page2.click('button:has-text("Join Room")');

    // Start game
    await page.click('button:has-text("Start Game")');

    // Verify night phase
    await expect(page.locator('.phase-indicator')).toContainText('Night');

    // ... continue testing game flow
  });
});
```

### Writing New Tests

When adding new features:

1. **Write tests first** (TDD approach)
   ```typescript
   // 1. Write the test
   it('should process werewolf kill', () => {
     const result = nightManager.processKill('victim-id');
     expect(result.success).toBe(true);
   });

   // 2. Implement the function
   // 3. Run test to verify
   ```

2. **Test the interface, not implementation**
   ```typescript
   // ❌ Bad - testing implementation
   it('should call internal helper function', () => {
     const spy = jest.spyOn(manager, '_internalHelper');
     manager.publicMethod();
     expect(spy).toHaveBeenCalled();
   });

   // ✅ Good - testing interface
   it('should return correct result', () => {
     const result = manager.publicMethod();
     expect(result).toEqual(expectedOutput);
   });
   ```

3. **Cover happy path and error cases**
   ```typescript
   describe('voteManager.castVote', () => {
     it('should record valid vote', () => { /* ... */ });
     it('should reject vote from dead player', () => { /* ... */ });
     it('should reject vote for non-existent player', () => { /* ... */ });
     it('should reject duplicate vote', () => { /* ... */ });
   });
   ```

4. **Use descriptive test names**
   ```typescript
   // ❌ Bad
   it('test 1', () => { /* ... */ });

   // ✅ Good
   it('should assign werewolf role to exactly one player when config specifies one werewolf', () => { /* ... */ });
   ```

5. **Keep tests independent**
   ```typescript
   // ❌ Bad - tests depend on execution order
   let globalState;
   it('test 1', () => { globalState = setup(); });
   it('test 2', () => { expect(globalState).toBeDefined(); });

   // ✅ Good - each test is independent
   beforeEach(() => { state = setup(); });
   it('test 1', () => { /* uses state */ });
   it('test 2', () => { /* uses state */ });
   ```

6. **Mock external dependencies**
   ```typescript
   // Mock Socket.IO
   const mockSocket = {
     emit: jest.fn(),
     on: jest.fn(),
   };

   // Mock timers
   jest.useFakeTimers();
   phaseManager.startPhase('night');
   jest.advanceTimersByTime(60000);
   expect(phaseManager.getCurrentPhase()).toBe('day');
   ```

---

## Documentation Standards

### Code Documentation

#### 1. JSDoc Comments

Add JSDoc comments for all exported functions:

```typescript
/**
 * Assigns roles randomly to players ensuring team balance.
 * Ensures the number of werewolves does not exceed villagers.
 * 
 * @param players - Array of players to assign roles to
 * @param roleConfig - Configuration specifying count for each role type
 * @returns Updated players array with assigned roles
 * @throws {Error} If not enough players for the role configuration
 * 
 * @example
 * const players = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }];
 * const config = { werewolves: 1, seers: 1, doctors: 0 };
 * const assigned = assignRoles(players, config);
 */
export function assignRoles(players: Player[], roleConfig: RoleConfig): Player[] {
  // Implementation
}
```

**Include:**
- Brief description (what it does)
- `@param` for each parameter
- `@returns` for return value
- `@throws` for errors
- `@example` for non-trivial usage

#### 2. Inline Comments

Use sparingly, only for non-obvious logic:

```typescript
// ❌ Bad - states the obvious
// Increment counter
counter++;

// ✅ Good - explains why
// Skip dead players as they cannot vote
if (!player.isAlive) continue;

// ✅ Good - explains complex logic
// Use Fisher-Yates shuffle to ensure uniform random distribution
// This prevents bias that simple random selection would introduce
for (let i = players.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [players[i], players[j]] = [players[j], players[i]];
}
```

**Rules:**
- Explain **why**, not **what**
- Keep comments up-to-date with code changes
- Remove commented-out code (use git history instead)

#### 3. Type Definitions

Use TypeScript types extensively:

```typescript
// ✅ Define interfaces for all data structures
export interface Player {
  id: string;
  name: string;
  role: Role;
  isAlive: boolean;
  votedFor?: string;
}

// ✅ Use union types for finite sets
export type Role = 'werewolf' | 'villager' | 'seer' | 'doctor';
export type GamePhase = 'lobby' | 'night' | 'day' | 'discussion' | 'voting' | 'ended';

// ✅ Use type guards for runtime checking
export function isWerewolf(player: Player): boolean {
  return player.role === 'werewolf';
}

// ✅ Document complex types
/**
 * Configuration for role distribution in a game.
 * All values must be non-negative integers.
 * Total must not exceed MAX_PLAYERS_PER_ROOM.
 */
export interface RoleConfig {
  werewolves: number;
  seers: number;
  doctors: number;
}
```

### Project Documentation

**Location:** `docs/`

#### Existing Documentation

| Document | Purpose | When to Update |
|----------|---------|----------------|
| `docs/structure.md` | Codebase organization (SOURCE OF TRUTH) | Whenever file/folder structure changes |
| `docs/spec.md` | Data model and phase engine specification | When game rules or data structures change |
| `docs/setup.md` | Development environment setup | When setup process changes |
| `docs/test-checklist.md` | Manual testing procedures | When new features need manual testing |
| `docs/createNewRoles.md` | Guide for adding new roles | When role creation process changes |
| `README.md` | Project overview and quick start | When setup, build, or run commands change |

#### Documentation Guidelines

1. **Update existing docs** when making structural changes
   ```markdown
   ❌ Don't: Make changes and forget to update docs
   ✅ Do: Update docs in the same commit as code changes
   ```

2. **Keep README.md current** with setup and usage instructions
   - Verify all commands work
   - Update dependencies if changed
   - Keep screenshots current

3. **Document breaking changes** clearly
   ```markdown
   ## Breaking Changes in v2.0.0

   - **Socket.IO events:** Renamed `player:join` to `room:join`
   - **Migration:** Update client code: `socket.emit('room:join', data)`
   ```

4. **Include examples** in documentation
   ```markdown
   ## Adding a New Phase

   1. Add phase to type definition:
      ```typescript
      export type GamePhase = 'lobby' | 'night' | 'discussion' | 'newphase';
      ```

   2. Add phase transition logic: ...
   ```

5. **Link related docs** for better navigation
   ```markdown
   See also:
   - [Phase Engine Specification](./spec.md#phase-engine)
   - [Adding New Roles](./createNewRoles.md)
   ```

#### When to Update Documentation

| Change Type | Documentation to Update |
|-------------|------------------------|
| File/folder reorganization | `docs/structure.md` (ALWAYS) |
| Setup/build/run commands | `README.md` (ALWAYS) |
| Socket.IO event contracts | `src/shared/events.ts` comments (ALWAYS) |
| New feature | Relevant doc in `docs/` + README if user-facing |
| New role | `docs/createNewRoles.md` if process changes |
| Game rules change | `docs/spec.md` |
| Testing procedures | `docs/test-checklist.md` |

---

## Code Quality and Best Practices

### TypeScript Standards

#### 1. Strict Mode

Strict mode is already enabled - maintain strict typing:

```typescript
// ✅ Enabled in tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

#### 2. No `any` Type

Avoid `any` - use proper types or `unknown` with type guards:

```typescript
// ❌ Bad
function processData(data: any) {
  return data.value;
}

// ✅ Good - use proper type
function processData(data: { value: string }) {
  return data.value;
}

// ✅ Good - use unknown with type guard
function processData(data: unknown) {
  if (isValidData(data)) {
    return data.value;
  }
  throw new Error('Invalid data');
}

function isValidData(data: unknown): data is { value: string } {
  return typeof data === 'object' && data !== null && 'value' in data;
}
```

#### 3. Path Aliases

Use `@shared/*` for shared imports (already configured):

```typescript
// ✅ Good - use path alias
import { Player, GamePhase } from '@shared/types';
import { NIGHT_PHASE_DURATION } from '@shared/constants';

// ❌ Bad - relative paths for shared code
import { Player } from '../../shared/types';
```

#### 4. Module Exports

Use named exports, avoid default exports:

```typescript
// ✅ Good - named exports
export function assignRoles(players: Player[]): Player[] { /* ... */ }
export function getRoleCount(players: Player[], role: Role): number { /* ... */ }

// ❌ Bad - default export
export default function assignRoles(players: Player[]): Player[] { /* ... */ }
```

**Why?** Named exports:
- Provide better IDE autocomplete
- Make refactoring easier
- Prevent naming conflicts
- Are more explicit

### Code Style

#### 1. Naming Conventions

```typescript
// camelCase for variables, functions, properties
const playerCount = 5;
function calculateWinner() { /* ... */ }

// PascalCase for types, interfaces, classes
interface Player { /* ... */ }
type GamePhase = 'night' | 'day';
class RoomManager { /* ... */ }

// UPPER_SNAKE_CASE for constants
const MAX_PLAYERS_PER_ROOM = 20;
const DEFAULT_NIGHT_DURATION = 60000;

// Descriptive names (avoid abbreviations)
// ✅ Good
const werewolfPlayers = players.filter(p => p.role === 'werewolf');

// ❌ Bad
const wwPlayers = players.filter(p =>] Test manually in browser
- [ ] Update documentation
- [ ] Review git diff
- [ ] Commit with clear message
```

### Quality Gates

All changes must pass:

```bash
✅ pnpm run typecheck  # No TypeScript errors
✅ pnpm test          # All tests pass
✅ pnpm run build     # Build succeeds
✅ Manual testing     # Feature works as expected
✅ Documentation      # Docs are updated
```

### Red Flags

Watch out for these code smells:

- ❌ Business logic in socket handlers
- ❌ Using `any` type
- ❌ Hardcoded values instead of constants
- ❌ Mutating function parameters
- ❌ No error handling
- ❌ No tests for new code
- ❌ Shared types in client-only or server-only files
- ❌ Broadcasting raw state without sanitization
- ❌ No input validation
- ❌ Comments explaining what instead of why

---

## Contact and Resources

### Documentation

- **Repository:** https://github.com/jsevenheck/werewolves
- **Structure (SOURCE OF TRUTH):** `docs/structure.md`
- **Game Specification:** `docs/spec.md`
- **Setup Guide:** `docs/setup.md`
- **Testing Checklist:** `docs/test-checklist.md`
- **Adding Roles:** `docs/createNewRoles.md`
- **This Guide:** `docs/agents.md`

### External Resources

- **TypeScript:** https://www.typescriptlang.org/docs/
- **Socket.IO:** https://socket.io/docs/v4/
- **Jest:** https://jestjs.io/docs/getting-started
- **Playwright:** https://playwright.dev/docs/intro
- **Vite:** https://vitejs.dev/guide/

### Getting Help

1. **Documentation:** Check `docs/` folder first
2. **Issues:** Search GitHub issues
3. **Code:** Look at existing implementations
4. **Maintainers:** Contact repository maintainers

---

## Document Changelog

### v1.1.0 (2026-01-24)

**Added:**
- Quick Start for Agents section
- Decision Trees for code placement
- Common Pitfalls section with solutions
- Quick Reference section
- Expanded testing guidelines with workflows
- Security checklist
- More detailed examples throughout
- Pre-commit checklist
- Git workflow guidelines
- Troubleshooting section

**Improved:**
- Better TypeScript examples
- More concrete Socket.IO patterns
- Clearer error handling guidelines
- Enhanced code quality section
- Better organization with ToC

### v1.0.0 (2026-01-24)

- Initial version
- Core guidelines for AI agents
- Repository structure
- Test coverage requirements
- Documentation standards
- Code quality best practices

---

**Maintained by:** Project Maintainers  
**For Questions:** Open a GitHub issue or contact maintainers

---

*This document is a living guide. As the codebase evolves, so should this document. Keep it updated!*
