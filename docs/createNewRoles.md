# Adding New Roles

This guide explains what to update when introducing a new role and where those changes live.

## Quick Checklist
- Add the role to shared types in `src/shared/types.ts` (Role union, RoleConfig, optional Team/NightStep/Phase).
- Add server role metadata and defaults in `src/server/config/constants.ts` (ROLE_INFO, DEFAULT_ROLE_CONFIG).
- Add client role metadata in `client/src/config/constants.ts` (ROLE_DETAILS).
- Update server flow (managers + handlers) for actions, win/lose, and validation.
- Update client UI + handlers for the role's actions.
- Ensure role-specific data is only broadcast to allowed players in `src/server/managers/broadcastManager.ts`.
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
[Client constants: ROLE_DETAILS]
        |
        v
[Server logic: managers/handlers/room state]
        |
        v
[Client UI: renderers/handlers/state]
        |
        v
[Broadcast visibility rules]
        |
        v
[Tests + Docs + E2E]
```

## Minimal Path (Passive Role, No Actions)
Passive roles are roles without night/day actions or special prompts. They exist only for
win conditions, role counts, and UI display. Think "Elder" (extra resilience) or a simple
villager variant with no active abilities.
1. Types:
   - `src/shared/types.ts`: extend `Role` and `RoleConfig`.
   - Add to `Team` only if you need a new faction.
2. Config:
   - `src/server/config/constants.ts`: add to `ROLE_INFO` and `DEFAULT_ROLE_CONFIG`.
   - `client/src/config/constants.ts`: add to `ROLE_DETAILS` (name, description, color).
3. Assignment and display:
   - Role assignment uses `ROLE_INFO` and `RoleConfig` in `src/server/managers/roleManager.ts`.
   - Role labels use `ROLE_INFO` via `getPlayerRoleLabel` in `src/server/utils/helpers.ts`.
4. Tests:
   - Update any test snapshots or role lists in `__tests__`.

### Passive Role Checklist (Quick Reference)
- ✅ No new phases or night steps.
- ✅ No socket events or client handlers needed.
- ✅ Only update types, constants, and tests.
- ✅ If the role has *passive effects* (e.g., extra life), implement that in:
  - `src/server/managers/deathManager.ts` (death resolution), or
  - `src/server/managers/voteManager.ts` (day voting outcomes), or
  - `src/server/managers/phaseManager.ts` (flow tweaks without new phases).

## Active Role (Night/Day/Phase Actions)
In addition to the "Minimal Path":
1. Server flow:
   - `src/shared/types.ts`: add to `NightStep` or `Phase` if a new step/phase is needed.
   - `src/server/managers/phaseManager.ts`: insert your step in the night flow.
   - `src/server/managers/nightManager.ts`: process the action (target selection, resolve rules).
   - `src/server/handlers/socketHandlers.ts`: accept and validate a new socket event.
   - `src/shared/events.ts`: define the new event payload.
   - `src/server/models/room.ts`: initialize any new per-room state (targets, flags).
2. Broadcast:
   - `src/server/managers/broadcastManager.ts`: expose role-specific data only to the right players.
3. Client UI/interaction:
   - `client/src/renderers/phaseRenderers.ts`: render the new action form/UX.
   - `client/src/handlers/phaseHandlers.ts`: send the action to the server.
   - `client/src/state/gameState.ts`: add any local pending state if needed.
   - `client/src/main.ts`: handle new phases/transitions in rendering.
4. Audio (optional):
   - Add narrator files for new steps or phases in `client/public/audio/` (see `client/public/audio/README.md`).

## Example 1: Passive Role "Elder"
Goal: add a village role with no active ability.

1. `src/shared/types.ts`
   - Add `'elder'` to `Role`.
   - Add `elder: number` to `RoleConfig`.
2. `src/server/config/constants.ts`
   - Add `elder` to `ROLE_INFO` with team `village` and a description.
   - Add `elder` to `DEFAULT_ROLE_CONFIG` with a default count (often 0).
3. `client/src/config/constants.ts`
   - Add `elder` to `ROLE_DETAILS` (name/description/color).
4. Tests
   - Update role list and default config expectations in `__tests__/roleManager.test.ts` and any other role-specific tests.

Minimal code shape:
```ts
// src/shared/types.ts
export type Role = 'werewolf' | 'seer' | 'hunter' | 'witch' | 'armor' | 'joker' | 'villager' | 'elder';

export interface RoleConfig {
  // ...
  elder: number;
}
```

## Example 2: Night Action Role "Guard"
Goal: the Guard picks a player at night to protect from wolves for that night.

1. Types
   - `src/shared/types.ts`: add `'guard'` to `Role`, `RoleConfig`, and add a new `NightStep` like `'guard'`.
2. Room state
   - `src/server/models/room.ts`: add `guardedTarget: string | null` and reset it on round start.
3. Night flow
   - `src/server/managers/phaseManager.ts`: insert the guard step (e.g., wolves -> guard -> seer -> witch -> resolve).
   - `src/server/managers/nightManager.ts`: store `guardedTarget` and skip wolf kill if it matches.
4. Events + handlers
   - `src/shared/events.ts`: add `submitGuard` payload.
   - `src/server/handlers/socketHandlers.ts`: validate and apply guard choice.
5. Broadcast
   - `src/server/managers/broadcastManager.ts`: only the Guard should see `guardedTarget`.
6. Client UI
   - `client/src/renderers/phaseRenderers.ts`: render the Guard selection form on the `guard` step.
   - `client/src/handlers/phaseHandlers.ts`: emit `submitGuard`.
7. Audio (optional)
   - Add `client/public/audio/night_guard.mp3`.
8. Tests
   - Update `__tests__/nightManager.test.ts`, `__tests__/phaseManager.test.ts`, `__tests__/socketHandlers.test.ts`.

## Win and Death Logic
If the role affects win conditions or death resolution:
- `src/server/managers/deathManager.ts`: update death chains and winner checks.
- `src/server/managers/voteManager.ts`: update day-vote outcomes (e.g., instant win role).

## File Reference (Short List)
- Shared types: `src/shared/types.ts`
- Server constants: `src/server/config/constants.ts`
- Client constants: `client/src/config/constants.ts`
- Role assignment: `src/server/managers/roleManager.ts`
- Room state: `src/server/models/room.ts`
- Phase/night flow: `src/server/managers/phaseManager.ts`, `src/server/managers/nightManager.ts`
- Socket events: `src/shared/events.ts`, `src/server/handlers/socketHandlers.ts`
- Broadcast visibility: `src/server/managers/broadcastManager.ts`
- UI render: `client/src/renderers/phaseRenderers.ts`, `client/src/renderers/commonRenderers.ts`
- UI handlers: `client/src/handlers/phaseHandlers.ts`, `client/src/handlers/commonHandlers.ts`
- Audio: `client/public/audio/README.md`
- Tests: `__tests__/*.test.ts`

## Pitfalls and Notes
- `DEFAULT_ROLE_CONFIG` must match `RoleConfig`, otherwise lobby validation breaks.
- `validateCounts` in `src/server/managers/roleManager.ts` may need updates if your role has minimums.
- `assignRoles` in `src/server/managers/roleManager.ts` sets `nightAction` only for werewolves; extend it if your role needs per-player action state.
- Be careful with visibility in `broadcastManager`: private info must not leak to other roles.
- If you add a new phase or transition, also update `Phase`/`PhaseTransition` and narrator handling.

## Tests and Docs
- Update tests with role lists or config changes, e.g. `__tests__/roleManager.test.ts`, `__tests__/phaseManager.test.ts`, `__tests__/nightManager.test.ts`, `__tests__/socketHandlers.test.ts`.
- Update specs: `docs/spec.md`.
- Update manual checks: `docs/test-checklist.md`.
- Integration tests (Playwright): add or extend scenarios in `e2e/`, then run `pnpm run test:e2e` (first time: `pnpm exec playwright install`).
