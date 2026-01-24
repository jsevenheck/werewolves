# Agent Instructions - Werewolves Game

**Role:** Senior Lead Engineer

## Overview

This document provides comprehensive guidance for AI agents working on the Werewolves (Moderator-Free Mafia) repository. The goal is to maintain high code quality, consistent structure, comprehensive test coverage, and clear documentation while making changes to the codebase.

## Repository Structure

This is a TypeScript full-stack application with:
- **Server:** Node.js/Express with Socket.IO (CommonJS)
- **Client:** Vite-powered SPA with Socket.IO client (ES Modules)
- **Shared:** Type-safe Socket.IO events and shared types
- **Package Manager:** pnpm (version 10.28.1)
- **Testing:** Jest for unit tests, Playwright for E2E tests

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

## Aligning Changes to Current Structure

### General Principles

1. **Separation of Concerns:** Keep each module focused on a single responsibility
2. **Layer Organization:** Respect the layered architecture (config → models → managers → handlers)
3. **Shared vs. Specific:** Use `src/shared/` only for types/constants needed by both client and server
4. **Module Patterns:** Use ES6 export/import syntax consistently

### Server-Side Changes

When modifying or adding server-side features:

1. **Constants:** 
   - Add server-only constants to `src/server/config/constants.ts`
   - Add shared timing constants to `src/shared/constants.ts`

2. **Data Models:**
   - Update `src/server/models/room.ts` for room-related data structures
   - Update `src/server/models/player.ts` for player-related data structures

3. **Business Logic:**
   - **Role logic:** `src/server/managers/roleManager.ts`
   - **Phase transitions:** `src/server/managers/phaseManager.ts`
   - **Night actions:** `src/server/managers/nightManager.ts`
   - **Day voting:** `src/server/managers/voteManager.ts`
   - **Death/Win conditions:** `src/server/managers/deathManager.ts`
   - **State broadcasting:** `src/server/managers/broadcastManager.ts`

4. **Socket Handlers:**
   - Add/modify event handlers in `src/server/handlers/socketHandlers.ts`
   - Keep handlers thin - delegate to managers for business logic

5. **Shared Types:**
   - Update `src/shared/types.ts` for data structures
   - Update `src/shared/events.ts` for Socket.IO event contracts

### Client-Side Changes

When modifying or adding client-side features:

1. **Constants:**
   - Add client-only constants to `client/src/config/constants.ts`
   - Add shared timing constants to `src/shared/constants.ts`

2. **State Management:**
   - Update `client/src/state/gameState.ts` for global state
   - Use localStorage for session persistence

3. **UI Rendering:**
   - **Landing page:** `client/src/renderers/landingRenderer.ts`
   - **Common elements:** `client/src/renderers/commonRenderers.ts` (header, players, logs)
   - **Game phases:** `client/src/renderers/phaseRenderers.ts`

4. **Event Handlers:**
   - **Landing actions:** `client/src/handlers/landingHandlers.ts`
   - **Common actions:** `client/src/handlers/commonHandlers.ts`
   - **Phase actions:** `client/src/handlers/phaseHandlers.ts`

5. **Main Entry:**
   - Update `client/src/main.ts` only for new top-level functionality

### Adding New Roles

Follow the guide in `docs/createNewRoles.md` for adding new roles. Key steps:
1. Update `src/server/config/constants.ts` with role definition
2. Update `client/src/config/constants.ts` with role UI details
3. Add role-specific logic to appropriate managers
4. Update UI renderers if role needs special display
5. Add tests for new role behavior

## Test Coverage Requirements

### Unit Testing (Jest)

**Location:** `__tests__/`

**Coverage Standards:**
- All manager modules must have unit tests
- Test files should mirror the source file structure
- Aim for >80% code coverage on critical business logic
- Use mocks for Socket.IO and external dependencies

**Test File Naming:**
- Pattern: `<moduleName>.test.ts`
- Examples: `roleManager.test.ts`, `voteManager.test.ts`

**Running Tests:**
```bash
pnpm test                    # Run all unit tests
pnpm test -- --coverage      # Run with coverage report
pnpm test -- <testName>      # Run specific test file
```

**Required Test Coverage Areas:**
1. **Managers:** All business logic in `src/server/managers/`
2. **Handlers:** Socket event handlers in `src/server/handlers/`
3. **Renderers:** Client rendering functions in `client/src/renderers/`
4. **Handlers:** Client event handlers in `client/src/handlers/`
5. **Edge Cases:** Critical edge cases and error scenarios

**Test Structure:**
```typescript
describe('ModuleName', () => {
  beforeEach(() => {
    // Setup
  });

  describe('functionName', () => {
    it('should handle expected scenario', () => {
      // Test logic
    });

    it('should handle error scenario', () => {
      // Error handling test
    });
  });
});
```

### End-to-End Testing (Playwright)

**Location:** `e2e/`

**Running E2E Tests:**
```bash
pnpm exec playwright install  # Install browsers (first time)
pnpm run test:e2e             # Run E2E tests
```

**E2E Test Guidelines:**
- Test complete user workflows (join game, vote, win conditions)
- Test multi-player scenarios
- Test reconnection and state persistence
- Use Playwright's auto-waiting features
- Keep E2E tests stable and maintainable

### Writing New Tests

When adding new features:
1. **Write tests first** (TDD approach recommended)
2. **Test the interface, not implementation details**
3. **Cover happy path and error cases**
4. **Use descriptive test names** (should read like documentation)
5. **Keep tests independent** (no test should depend on another)
6. **Mock external dependencies** (Socket.IO, timers)

## Documentation Standards

### Code Documentation

1. **JSDoc Comments:**
   - Add JSDoc comments for all exported functions
   - Include `@param` and `@returns` annotations
   - Explain **why** for complex logic, not just **what**

   ```typescript
   /**
    * Assigns roles randomly to players ensuring team balance.
    * @param players - Array of players to assign roles to
    * @param roleConfig - Configuration of role counts
    * @returns Updated players array with assigned roles
    */
   export function assignRoles(players: Player[], roleConfig: RoleConfig): Player[] {
     // Implementation
   }
   ```

2. **Inline Comments:**
   - Use sparingly, only for non-obvious logic
   - Explain **why**, not **what**
   - Keep comments up-to-date with code changes

3. **Type Definitions:**
   - Use TypeScript types extensively
   - Define interfaces for all data structures
   - Use strict TypeScript settings (already configured)

### Project Documentation

**Location:** `docs/`

**Existing Documentation:**
- `docs/setup.md` - Development environment setup
- `docs/spec.md` - Data model and phase engine specification
- `docs/structure.md` - Codebase structure (THIS IS THE SOURCE OF TRUTH)
- `docs/test-checklist.md` - Manual testing procedures
- `docs/createNewRoles.md` - Guide for adding new roles

**Documentation Guidelines:**
1. **Update existing docs** when making structural changes
2. **Keep README.md current** with setup and usage instructions
3. **Document breaking changes** clearly
4. **Include examples** in documentation
5. **Link related docs** for better navigation

### When to Update Documentation

- **Always:** Update `docs/structure.md` if changing folder/file organization
- **Always:** Update README.md if changing setup, build, or run commands
- **Always:** Update type definitions in `src/shared/` when changing contracts
- **If adding features:** Update relevant doc in `docs/`
- **If adding roles:** Follow `docs/createNewRoles.md` and update it if process changes

## Code Quality and Best Practices

### TypeScript Standards

1. **Strict Mode:** Already enabled - maintain strict typing
2. **No `any`:** Avoid `any` type - use proper types or `unknown` with type guards
3. **Path Aliases:** Use `@shared/*` for shared imports (already configured)
4. **Module Exports:** Use named exports, avoid default exports

### Code Style

1. **Naming Conventions:**
   - `camelCase` for variables, functions, properties
   - `PascalCase` for types, interfaces, classes
   - `UPPER_SNAKE_CASE` for constants
   - Descriptive names (avoid abbreviations)

2. **File Organization:**
   - One main responsibility per file
   - Group related functions together
   - Keep files under 300 lines when possible

3. **Function Design:**
   - Single Responsibility Principle
   - Pure functions when possible
   - Avoid side effects where reasonable
   - Max 3-4 parameters (use objects for more)

4. **Error Handling:**
   - Always handle errors explicitly
   - Use try-catch for async operations
   - Log errors with context
   - Return error states, don't throw in handlers

### Socket.IO Best Practices

1. **Type Safety:**
   - Define all events in `src/shared/events.ts`
   - Use typed socket interfaces
   - Validate event data

2. **Event Naming:**
   - Use consistent naming: `object:action` (e.g., `room:join`, `vote:cast`)
   - Document events in `src/shared/events.ts`

3. **State Management:**
   - Server is the source of truth
   - Broadcast state changes to all clients
   - Use room-specific broadcasts (`io.to(roomCode).emit(...)`)

### Security Considerations

1. **Input Validation:**
   - Validate all user inputs
   - Sanitize room codes and player names
   - Check player authorization for actions

2. **State Protection:**
   - Don't send sensitive data to unauthorized clients
   - Sanitize state before broadcasting (see `broadcastManager.ts`)
   - Verify player identity before processing actions

3. **Rate Limiting:**
   - Consider rate limiting for user actions
   - Prevent spam and abuse

## Development Workflow

### Setup and Build

```bash
# Install dependencies
pnpm install

# Type checking
pnpm run typecheck

# Development (with hot reload)
pnpm run dev                # Runs both server and client
pnpm run dev:server         # Server only (port 3001)
pnpm run dev:client         # Client only (port 5173)

# Build
pnpm run build              # Build both
pnpm run build:server       # Build server only
pnpm run build:client       # Build client only

# Run production
pnpm start                  # Runs built server (port 3001)
```

### Pre-Commit Checklist

Before committing changes:
1. ✅ Run `pnpm run typecheck` - ensure no TypeScript errors
2. ✅ Run `pnpm test` - ensure all tests pass
3. ✅ Run `pnpm run build` - ensure build succeeds
4. ✅ Test changes manually in browser
5. ✅ Update relevant documentation
6. ✅ Add/update tests for new functionality
7. ✅ Review git diff to avoid committing unintended changes

### Git Workflow

1. **Commits:**
   - Write clear, descriptive commit messages
   - Use present tense ("Add feature" not "Added feature")
   - Reference issue numbers when applicable

2. **Branches:**
   - Use descriptive branch names
   - Format: `feature/<feature-name>` or `fix/<bug-name>`

3. **Pull Requests:**
   - Fill out PR description template
   - Link related issues
   - Request reviews from team members

### Common Commands

```bash
# Package management
pnpm install <package>       # Add dependency
pnpm install -D <package>    # Add dev dependency

# Testing
pnpm test                    # Run unit tests
pnpm test -- --watch         # Watch mode
pnpm test:e2e                # Run E2E tests

# Docker
docker build -t werewolves .
docker run --rm -p 3000:3000 werewolves
```

## Troubleshooting

### Common Issues

1. **Port conflicts:**
   - Server default: 3001
   - Vite dev: 5173
   - Set `PORT` env variable to change server port

2. **TypeScript errors:**
   - Run `pnpm run typecheck` to see all errors
   - Check `tsconfig.*.json` files for configuration
   - Ensure path aliases are configured correctly

3. **Test failures:**
   - Check for timing issues with async code
   - Ensure mocks are properly reset between tests
   - Use `--verbose` flag for detailed output

4. **Build issues:**
   - Clear `dist/` and rebuild
   - Check for circular dependencies
   - Ensure all imports use correct paths

## Key Files to Reference

- **Structure:** `docs/structure.md` (ALWAYS read this first)
- **Game Spec:** `docs/spec.md`
- **Setup Guide:** `docs/setup.md`
- **Adding Roles:** `docs/createNewRoles.md`
- **Manual Testing:** `docs/test-checklist.md`
- **README:** `README.md`

## Agent Guidelines Summary

As a Senior Lead Engineer agent:

1. **Understand before changing:** Read `docs/structure.md` and relevant docs first
2. **Follow the architecture:** Respect the layered structure and separation of concerns
3. **Test thoroughly:** Write tests, run existing tests, test manually
4. **Document changes:** Update docs when changing structure or behavior
5. **Maintain quality:** Run typecheck, build, and tests before committing
6. **Think about users:** Consider UX, mobile users, and edge cases
7. **Security first:** Validate inputs, sanitize outputs, protect state
8. **Be consistent:** Follow existing patterns and conventions
9. **Ask when unclear:** If the right approach is ambiguous, seek clarification
10. **Leave code better:** Clean up as you go, refactor when needed

## Contact and Resources

- **Repository:** https://github.com/jsevenheck/werewolves
- **Documentation:** See `docs/` folder
- **Issues:** Check GitHub issues for context
- **Questions:** Ask the repository maintainers

---

**Last Updated:** 2026-01-24

**Version:** 1.0.0

**Maintained by:** Project maintainers
