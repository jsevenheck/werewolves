# AGENTS.md - Werewolves

Purpose: concise instructions for coding agents working in this repo.

## Quick Start
1. Read docs/structure.md (source of truth for layout and layers).
2. Install deps: pnpm install
3. For code changes: pnpm run typecheck && pnpm test
4. For end-to-end changes: pnpm run test:e2e

## Docs (Source of Truth)
Keep detailed guidance in docs/ and link to it from here.
- docs/setup.md: local setup and dev workflow
- docs/structure.md: repo layout and architecture
- docs/spec.md: game rules and behavior
- docs/createNewRoles.md: how to add a new role
- docs/test-checklist.md: testing expectations and coverage

## Repo Map
- server.ts: server entry point
- src/server/...
  - config/: server-only constants and role data
  - models/: Room/Player models
  - managers/: business logic
  - handlers/: Socket.IO handlers (thin)
  - utils/: helpers
- src/shared/: types/events/constants shared by client + server (alias @shared/*)
- client/src/...
  - config/, state/, renderers/, handlers/, utils/
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
- Unit tests: __tests__/<module>.test.ts
- Renderer tests: __tests__/renderers/<renderer>.test.ts
- E2E tests: e2e/*.spec.ts (only for user workflows)

## When Unsure
- Search for a similar pattern in src/ and tests.
- Leave a short TODO and request review if still unclear.
