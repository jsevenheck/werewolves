# Internationalization Progress

This document tracks the plan and implementation progress for adding German UI support to the Werewolves app.

## Scope

- Add German and English UI translations.
- Keep internal game values, socket events, role IDs, phases, and server logic language-neutral.
- Translate user-facing Vue UI first.
- Migrate server-originated messages to localizable message keys after the static UI is covered.

## Plan

### 1. Foundation

- [x] Create this progress tracker.
- [x] Review current Vue UI text surfaces and server-originated text surfaces.
- [x] Add an i18n library and wire it into the Vue app.
- [x] Create English and German message catalogs.
- [x] Add locale detection, fallback behavior, and persisted user language choice.
- [x] Add a small language switcher to the in-game shell/header.

### 2. Static Vue UI Translation

- [x] Translate app-level transition/status UI in `ui-vue/src/App.vue`.
- [x] Translate landing and session resume UI.
- [x] Translate lobby setup, player list controls, and role configuration UI.
- [x] Translate all phase components: role reveal, mayor, armor, night, day, and game over.
- [x] Translate shared panels and overlays.
- [x] Replace hardcoded role display names/descriptions with i18n keys.
- [x] Add translations for teams, phases, night steps, passive roles, and common actions.

### 3. Server-Originated Messages

- [x] Inventory all server strings shown in the client: logs, errors, winner reasons, day result messages, and seer results.
- [x] Introduce shared localized-message types in `core/src/types.ts`.
- [x] Migrate room logs to message keys plus params while keeping backward compatibility if needed.
- [x] Migrate winner reasons and day-result messages to message keys plus params.
- [x] Migrate callback errors to stable error codes and translate notifications client-side.
- [x] Normalize seer result values so display text is translated in the client.

### 4. Tests and Quality Gates

- [x] Add/adjust unit tests for translation key coverage where practical.
- [x] Add/adjust E2E checks for switching to German and seeing German labels.
- [x] Run formatting after changes.
- [x] Run `pnpm lint`.
- [x] Run `pnpm run typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm run test:e2e` if end-to-end behavior changed.

### 5. Narrator Audio Quality and Ordering

- [x] Suppress pacing-only narration for night transitions/resolution, post-mayor, and night-to-day states.
- [x] Keep one semantic phase cue plus distinct actionable role cues.
- [x] Reject stale async audio loads after a newer room state arrives.
- [x] Add lifecycle, bundled-key parity, silent-state, and out-of-order load regression tests.
- [x] Preserve the currently playing clip across a locale-cache reset; unload it
      after natural completion or when the next cue replaces it.
- [x] Cancel an old-locale clip that is still loading when the locale changes.
- [x] Rewrite every active German narrator script in natural, terminology-consistent German.
- [x] Regenerate all 15 active German MP3s with one voice and normalized encoding/loudness.
- [x] Version the reviewed scripts and reproducible generator command.

Validation for this slice:

- `pnpm test`: 277/277 unit tests passed.
- `pnpm run test:e2e`: 36/36 Playwright tests passed.
- `pnpm run typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm run build`: passed.
- GitHub CI test runtime and setup actions are aligned on Node.js 24.
- Audio audit: 15 EN and 15 DE active clips; every German clip is MP3, 44.1 kHz, mono, 128 kbit/s, generated with `de-DE-SeraphinaMultilingualNeural`.

## Server-Originated String Inventory

- Callback errors from `server/src/handlers/socketHandlers.ts`: join/create/resume/start/ready, night action validation, kick/close session, etc. They now include localized message keys while retaining the legacy `error` text.
- Room logs from `server/src/handlers/socketHandlers.ts`, `server/src/managers/deathManager.ts`, `server/src/managers/mayorManager.ts`, and `server/src/managers/voteManager.ts`: role assignment, mayor succession/election, wolf-vote changes, phase skips, deaths, vote outcomes, kicks/leaves/disconnects, reset.
- Winner reasons from `server/src/managers/deathManager.ts` and `server/src/managers/voteManager.ts`: village/wolves/joker reasons.
- Day result messages from `server/src/managers/voteManager.ts`: no-elimination and abstain outcomes.
- Seer result values from `server/src/handlers/socketHandlers.ts`: `Werewolf` / `Not Werewolf` are translated client-side for display while payload values remain protocol values.

## Notes

- Vue work should use Vue 3 Composition API and `<script setup lang="ts">`.
- Keep components focused and use explicit props/emits contracts when adding new UI components.
- Prefer client-side translation keys over embedding translated strings in server payloads.
- Update `docs/createNewRoles.md`, `docs/structure.md`, `docs/spec.md`, `docs/setup.md`, and `README.md` whenever roles, server-originated messages, or i18n-related architecture change.
