# AGENTS.md - Werewolves

Purpose: concise instructions for coding agents working in this repo.
Role: Senior Lead Engineer

## What Is This?
Werewolves is a moderator-free social deduction game (like Mafia). It has:
- A **Vue 3 + TypeScript** frontend (`ui-vue/`)
- A **Node.js + Socket.IO** backend (`server/`)
- Shared types/events in `core/`
- Can run standalone or embedded in a game-hub platform

## Quick Start
1. Read docs/structure.md (source of truth for layout and layers).
2. Install deps: `pnpm install`
3. For code changes: `pnpm run typecheck && pnpm test`
4. For end-to-end changes: `pnpm run test:e2e`
5. Run dev server: `pnpm run dev` (Vite on :5173, server on :3001)

## Docs (Source of Truth)
Keep detailed guidance in docs/ and link to it from here.
- docs/setup.md: local setup and dev workflow
- docs/structure.md: repo layout and architecture
- docs/spec.md: game rules and behavior
- docs/createNewRoles.md: how to add a new role
- docs/test-checklist.md: testing expectations and coverage

## Repo Map
- server.ts: server entry point
- core/src/: shared types, events, constants (alias @shared/*)
- server/src/...
  - config/: server-only constants and role data
  - models/: Room/Player models
  - managers/: business logic
  - handlers/: Socket.IO handlers (thin)
  - utils/: helpers
- ui-vue/src/...
  - components/: Vue phase screens, panels, overlays
  - composables/: socket, narrator hooks
  - stores/: Pinia stores
  - utils/: helpers
- __tests__/: Jest unit tests
- e2e/: Playwright specs

## Change Workflow
- Identify the affected layer(s) before editing.
- Keep handlers small; delegate logic to managers.
- If you change shared types or events, update both sides.
- Verify file paths before referencing them.
- If you add roles, rules, or phases, update docs/spec.md and docs/createNewRoles.md.

## Code Rules
- TypeScript is strict: avoid any and @ts-ignore.
- No console.log in production code.
- Prefer constants over magic numbers.
- Avoid mutating inputs when practical.

## Tests
- Unit tests: `__tests__/<module>.test.ts`
- E2E tests: `e2e/*.spec.ts` (Playwright, for user workflows)
- Run unit tests: `pnpm test`
- Run E2E tests: `pnpm run test:e2e`
- First-time E2E setup: `pnpm exec playwright install`

## Key Patterns
- **Managers** contain business logic (not handlers)
- **Handlers** are thin - validate input, call managers, broadcast
- **broadcastRoom()** sanitizes room state per-player before sending
- **Socket events** defined in `core/src/events.ts` (shared contract)
- **Phase flow**: lobby → roleReveal → mayor? → armor? → night ↔ day → ended

## When Unsure
- Search for a similar pattern in src/ and tests.
- Leave a short TODO and request review if still unclear.
