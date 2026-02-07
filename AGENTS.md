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
3. For code changes: `pnpm lint && pnpm run typecheck && pnpm test`
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

- standalone-server/src/index.ts: standalone server entry point (Express + Socket.IO)
- server/src/index.ts: embedded namespace plugin export (registerWerewolf)
- core/src/: shared types, events, constants (alias @shared/\*)
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
- **tests**/: Jest unit tests
- e2e/: Playwright specs

## Change Workflow

- Identify the affected layer(s) before editing.
- Keep handlers small; delegate logic to managers.
- If you change shared types or events, update both sides.
- Verify file paths before referencing them.
- If you add roles, rules, or phases, update docs/spec.md and docs/createNewRoles.md.

## Linting & Formatting

Every change must pass `pnpm lint` (ESLint 9) and `pnpm format:check` (Prettier).
CI runs both before typecheck and tests – a failure there blocks integration.

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `pnpm lint`         | ESLint – 0 errors and 0 warnings required |
| `pnpm lint:fix`     | Auto-fix what ESLint can                  |
| `pnpm format`       | Prettier – rewrite files in place         |
| `pnpm format:check` | Prettier – dry-run, exit 1 on any diff    |

Config files at repo root:

- `eslint.config.mjs` – flat config, env-aware (server / client / tests)
- `.prettierrc` – single quotes, 100-char width, LF line endings

Environment splits in ESLint:

- **Server** (`server/`, `standalone-server/`, `scripts/`) – Node globals, `require()` allowed
- **Client** (`ui-vue/`, `standalone-web/`, `*.vue`) – Browser globals, Vue plugin
- **Tests** (`__tests__/`, `e2e/`) – relaxed `any` / `require` rules

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

## MCP Tool Support

Both Claude Code and Codex have project-scoped MCP servers configured:

| Server       | What it provides                        | Config                        |
| ------------ | --------------------------------------- | ----------------------------- |
| github       | GitHub API (issues, PRs, repos)         | `.mcp.json` / `.codex/config.toml` |
| fetch        | Web content fetching (HTML → Markdown)  | `.mcp.json` / `.codex/config.toml` |
| filesystem   | File system read/write access           | `.mcp.json` / `.codex/config.toml` |
| ripgrep      | Fast code search                        | `.mcp.json` / `.codex/config.toml` |
| pnpm         | Package manager integration             | `.mcp.json` / `.codex/config.toml` |
| playwright   | Browser automation for E2E              | `.mcp.json` / `.codex/config.toml` |

- **Claude Code**: configured via `.mcp.json` (JSON, stdio/http transports)
- **Codex**: configured via `.codex/config.toml` (TOML, includes startup/tool timeouts)
- The GitHub MCP server in Codex requires a `GITHUB_MCP_PAT` env var for authentication.

## When Unsure

- Search for a similar pattern in src/ and tests.
- Leave a short TODO and request review if still unclear.
