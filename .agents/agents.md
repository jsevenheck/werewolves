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
  export const MAX_PLAYERS_PER_ROOM = 20;
  export const ROOM_CODE_LENGTH = 6;
  ```

- **Shared timing constants:** `src/shared/constants.ts`
  ```typescript
  export const NIGHT_PHASE_DURATION = 60000; // 60 seconds
  export const DAY_PHASE_DURATION = 120000;  // 2 minutes
  ```

#### 2. Data Models

- **Room data:** `src/server/models/room.ts`
- **Player data:** `src/server/models/player.ts`

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

#### 5. Shared Types

- **Event contracts:** `src/shared/events.ts`
- **Shared data structures:** `src/shared/types.ts`

### Client-Side Changes

When modifying or adding client-side features:

- **Constants:** `client/src/config/constants.ts`
- **State:** `client/src/state/gameState.ts`
- **Renderers:** `client/src/renderers/`
- **Handlers:** `client/src/handlers/`
- **Main entry:** `client/src/main.ts`

### Adding New Roles

**Follow the guide in `docs/createNewRoles.md`**.

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
- **Keep tests independent**
- **Use descriptive test names**

### Unit Testing (Jest)

**Location:** `__tests__/`

#### Coverage Standards

- All manager modules must have unit tests
- Test files should mirror the source file structure
- Aim for **>80% code coverage** on critical business logic
- Use mocks for Socket.IO and external dependencies

#### Test File Naming

- Pattern: `<moduleName>.test.ts`

#### Running Tests

```bash
pnpm test
pnpm test -- --coverage
pnpm test -- --watch
pnpm test -- <testName>
```

### End-to-End Testing (Playwright)

**Location:** `e2e/`

```bash
pnpm exec playwright install
pnpm run test:e2e
pnpm exec playwright test --ui
```

---

## Documentation Standards

- Add JSDoc for exported functions
- Inline comments explain **why**
- Keep docs updated in the same PR as code changes
- `docs/structure.md` is the source of truth for structure

---

## Code Quality and Best Practices

- Strict TypeScript, avoid `any`
- Use `@shared/*` imports for shared types/constants
- Prefer named exports
- Keep socket handlers thin
- Validate inputs and sanitize state before broadcasting

---

## Common Pitfalls (and how to avoid them)

- Business logic in socket handlers → move to managers
- Broadcasting raw room state → sanitize per-player
- Shared types in client-only or server-only folders → move to `src/shared/`
- Unhandled async errors → use `try/catch`
- Mutating parameters → return new objects/arrays
- Magic numbers → use constants
- Missing tests → add unit/E2E tests as appropriate

---

## Development Workflow

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run dev
```

### Pre-Commit Checklist

```bash
pnpm run typecheck && pnpm test && pnpm run build
git diff
```

---

## Quick Reference

| What? | Where? |
|-------|--------|
| Shared constant | `src/shared/constants.ts` |
| Server constant | `src/server/config/constants.ts` |
| Client constant | `client/src/config/constants.ts` |
| Shared type | `src/shared/types.ts` |
| Socket event | `src/shared/events.ts` |
| Business logic | `src/server/managers/<manager>.ts` |
| UI rendering | `client/src/renderers/<renderer>.ts` |
| Unit test | `__tests__/<module>.test.ts` |
| E2E test | `e2e/<feature>.spec.ts` |

---

## Troubleshooting

### Port Conflicts

```bash
lsof -i :3001
PORT=3002 pnpm run dev:server
```

### TypeScript Errors

```bash
pnpm run typecheck
```

### Test Failures

```bash
pnpm test -- --verbose
pnpm test -- <testName>
```

---

## Agent Guidelines Summary

1. Read `docs/structure.md` before changing structure.
2. Keep handlers thin; put logic in managers.
3. Keep shared contracts/types in `src/shared/`.
4. Add tests for new behavior (unit + E2E when relevant).
5. Validate inputs and sanitize broadcasts.
6. Run `typecheck`, `test`, and `build` before commit.

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

1. Check `docs/` first
2. Search GitHub issues
3. Look at existing implementations
4. Open an issue with repro steps and logs if still stuck

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
