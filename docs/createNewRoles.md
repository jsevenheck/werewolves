# Adding New Roles

This guide explains how to add a new role to the Werewolves game.
Roles can be **active** (with night/day actions like Seer, Witch) or **passive** (no actions, like a simple villager variant).

## Quick Checklist

- Add the role to shared types in `core/src/types.ts` (Role union, RoleConfig, optional Team/NightStep/Phase).
- Add server role metadata and defaults in `server/src/config/constants.ts` (ROLE_INFO, DEFAULT_ROLE_CONFIG).
- Add localized role name/description keys in `ui-vue/src/i18n/messages/en.ts` and
  `ui-vue/src/i18n/messages/de.ts` under `roles.<roleId>`.
  Keep purely presentational metadata (e.g., color) in `ui-vue/src/utils/roleDetails.ts` if needed.
- Update server flow (managers + handlers) for actions, win/lose, and validation.
- Update client UI + interaction for the role's actions.
- Ensure role-specific data is only broadcast to allowed players in `server/src/managers/broadcastManager.ts`.
- Update tests and docs.

## Flowchart: What to Update Where

```
[Define role + rules]
        |
        v
[Shared types: Role/RoleConfig/Team/NightStep/Phase]
        |
        v
[Server constants: ROLE_INFO/DEFAULT_ROLE_CONFIG]
        |
        v
[Client role labels/details]
        |
        v
[Server logic: managers/handlers/room state]
        |
        v
[Client UI: Vue components/composables/stores + i18n message files]
        |
        v
[Broadcast visibility rules]
        |
        v
[Tests + Docs + E2E]
```

## Passive System Roles (On/Off Toggles)

Some roles are passive system features (e.g., Mayor) and are not part of `RoleConfig`
counts. These are single-instance toggles:

1. Types:
   - `core/src/types.ts`: add to `PassiveRole` and `PassiveRoleConfig`.
2. Defaults + room state:
   - `server/src/config/constants.ts`: update `DEFAULT_PASSIVE_ROLE_CONFIG`.
   - `server/src/models/room.ts`: initialize `passiveRoleConfig`.
3. Labels:
   - Add `passiveRoles.<role>` keys to `ui-vue/src/i18n/messages/en.ts` and
     `ui-vue/src/i18n/messages/de.ts`.
4. Lobby UI + updates:
   - `ui-vue/src/components/Lobby.vue`: add a toggle input.
   - `ui-vue/src/components/Lobby.vue`: send `passiveRoles` in `updateRoleConfig`.
   - `server/src/handlers/socketHandlers.ts`: normalize `passiveRoles`.
5. Flow:
   - `server/src/managers/phaseManager.ts`: gate the phase(s) with the toggle.

## Minimal Path (Passive Role, No Actions)

Passive roles are roles without night/day actions or special prompts. They exist only for
win conditions, role counts, and UI display. Think "Elder" (extra resilience) or a simple
villager variant with no active abilities.

1. Types:
   - `core/src/types.ts`: extend `Role` and `RoleConfig`.
   - Add to `Team` only if you need a new faction.
2. Config:
   - `server/src/config/constants.ts`: add the role to `ROLE_INFO` with team and description,
     and add it to `DEFAULT_ROLE_CONFIG` with a default count (often 0).
   - Add `roles.<roleId>.name` and `roles.<roleId>.description` keys to
     `ui-vue/src/i18n/messages/en.ts` and `ui-vue/src/i18n/messages/de.ts`.
     Keep color/emoji metadata in `ui-vue/src/utils/roleDetails.ts` if needed.
3. Assignment and display:
   - Role assignment uses `ROLE_INFO` and `RoleConfig` in `server/src/managers/roleManager.ts`.
   - Role labels use `ROLE_INFO` via `getPlayerRoleLabel` in `server/src/utils/helpers.ts`.
4. Tests:
   - Update any test snapshots or role lists in `__tests__`.

### Passive Role Checklist (Quick Reference)

- No new phases or night steps.
- No socket events or client interaction needed.
- Only update types, constants, and tests.
- If the role has _passive effects_ (e.g., extra life), implement that in:
  - `server/src/managers/deathManager.ts` (death resolution), or
  - `server/src/managers/voteManager.ts` (day voting outcomes), or
  - `server/src/managers/phaseManager.ts` (flow tweaks without new phases).

## Active Role (Night/Day/Phase Actions)

In addition to the "Minimal Path":

1. Server flow:
   - `core/src/types.ts`: add to `NightStep` or `Phase` if a new step/phase is needed.
   - `server/src/managers/phaseManager.ts`: insert your step in the night flow.
   - `server/src/managers/nightManager.ts`: process the action (target selection, resolve rules).
   - `server/src/handlers/socketHandlers.ts`: accept and validate a new socket event.
   - `core/src/events.ts`: define the new event payload.
   - `server/src/models/room.ts`: initialize any new per-room state (targets, flags).
2. Broadcast:
   - `server/src/managers/broadcastManager.ts`: expose role-specific data only to the right players.
3. Client UI/interaction:
   - `ui-vue/src/components/NightPhase.vue`: render the new action form/UX.
   - `ui-vue/src/components/*Phase.vue`: emit the action to the server.
   - `ui-vue/src/stores/game.ts`: add any local pending state if needed.
   - `ui-vue/src/App.vue`: handle new phases/transitions in rendering.
4. Audio (optional):
   - Add narrator files for new steps or phases in `ui-vue/public/audio/` (see `ui-vue/public/audio/README.md`).

## Example 1: Passive Role "Elder"

Goal: add a village role with no active ability.

1. `core/src/types.ts`
   - Add `'elder'` to `Role`.
   - Add `elder: number` to `RoleConfig`.
2. `server/src/config/constants.ts`
   - Add `elder` to `ROLE_INFO` with team `village` and a description.
   - Add `elder` to `DEFAULT_ROLE_CONFIG` with a default count (often 0).
3. `ui-vue/src/i18n/messages/en.ts` and `ui-vue/src/i18n/messages/de.ts`
   - Add `roles.elder.name` and `roles.elder.description`.
   - Keep color metadata in `ui-vue/src/utils/roleDetails.ts` if needed.
4. Tests
   - Update role list and default config expectations in `__tests__/roleManager.test.ts` and any other role-specific tests.

Minimal code shape:

```ts
// core/src/types.ts
export type Role =
  | 'werewolf'
  | 'seer'
  | 'hunter'
  | 'witch'
  | 'armor'
  | 'joker'
  | 'guard'
  | 'harlot'
  | 'villager'
  | 'elder';

export interface RoleConfig {
  // ...
  elder: number;
}
```

## Example 2: Night Action Role "Guard"

Goal: the Guard picks a player at night to protect from wolves for that night.

1. Types
   - `core/src/types.ts`: add `'guard'` to `Role`, `RoleConfig`, and add a new `NightStep` like `'guard'`.
2. Room state
   - `server/src/models/room.ts`: add `guardedTarget: string | null` and reset it on round start.
3. Night flow
   - `server/src/managers/phaseManager.ts`: insert the guard step (e.g., wolves -> guard -> seer -> witch -> resolve).
   - `server/src/managers/nightManager.ts`: store `guardedTarget` and skip wolf kill if it matches.
4. Events + handlers
   - `core/src/events.ts`: add `submitGuard` payload.
   - `server/src/handlers/socketHandlers.ts`: validate and apply guard choice.
5. Broadcast
   - `server/src/managers/broadcastManager.ts`: only the Guard should see `guardedTarget`.
6. Client UI
   - `ui-vue/src/components/NightPhase.vue`: render the Guard selection form on the `guard` step.
   - `ui-vue/src/components/NightPhase.vue`: emit `submitGuard`.
7. Audio (optional)
   - Add `ui-vue/public/audio/night_guard.mp3`.
8. Tests
   - Update `__tests__/nightManager.test.ts`, `__tests__/phaseManager.test.ts`, `__tests__/socketHandlers.test.ts`.

## Win and Death Logic

If the role affects win conditions or death resolution:

- `server/src/managers/deathManager.ts`: update death chains and winner checks.
- `server/src/managers/voteManager.ts`: update day-vote outcomes (e.g., instant win role).

## File Reference (Short List)

- Shared types: `core/src/types.ts`
- Server constants: `server/src/config/constants.ts`
- Client UI root: `ui-vue/src/App.vue`
- Role assignment: `server/src/managers/roleManager.ts`
- Room state: `server/src/models/room.ts`
- Phase/night flow: `server/src/managers/phaseManager.ts`, `server/src/managers/nightManager.ts`
- Socket events: `core/src/events.ts`, `server/src/handlers/socketHandlers.ts`
- Broadcast visibility: `server/src/managers/broadcastManager.ts`
- UI screens: `ui-vue/src/components/Lobby.vue`, `ui-vue/src/components/NightPhase.vue`, `ui-vue/src/components/DayPhase.vue`
- i18n message files: `ui-vue/src/i18n/messages/en.ts`, `ui-vue/src/i18n/messages/de.ts`
- Role metadata/presentational fallback: `ui-vue/src/utils/roleDetails.ts`
- Role overlays/panels: `ui-vue/src/components/overlays/RoleCard.vue`, `ui-vue/src/components/panels/Header.vue`
- Client state: `ui-vue/src/stores/game.ts`
- Audio: `ui-vue/public/audio/README.md`
- Tests: `__tests__/*.test.ts`

## Pitfalls and Notes

- If you add a new role, remember to add its `roles.<roleId>` keys to **both**
  `ui-vue/src/i18n/messages/en.ts` and `ui-vue/src/i18n/messages/de.ts`.
  Missing keys fall back to the role id, which looks broken in the UI.
- `DEFAULT_ROLE_CONFIG` must match `RoleConfig`, otherwise lobby validation breaks.
- `validateCounts` in `server/src/managers/roleManager.ts` may need updates if your role has minimums.
- `assignRoles` in `server/src/managers/roleManager.ts` is the place to initialize any per-role player state you add.
- Be careful with visibility in `broadcastManager`: private info must not leak to other roles.
- If you add a new phase or transition, also update `Phase`/`PhaseTransition` and narrator handling.

## Tests and Docs

- Update tests with role lists or config changes, e.g. `__tests__/roleManager.test.ts`, `__tests__/phaseManager.test.ts`, `__tests__/nightManager.test.ts`, `__tests__/socketHandlers.test.ts`.
- Update specs: `docs/spec.md`.
- Update manual checks: `docs/test-checklist.md`.
- Integration tests (Playwright): add or extend scenarios in `e2e/`, then run `pnpm run test:e2e` (first time: `pnpm exec playwright install`).
