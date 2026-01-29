# Adding New Roles

This guide explains what to update when introducing a new role and where those changes live.

## Quick Checklist
- Add the role to shared types in `src/shared/types.ts` (Role union, RoleConfig, optional Team/NightStep/Phase).
- Add server role metadata and defaults in `src/server/config/constants.ts` (ROLE_INFO, DEFAULT_ROLE_CONFIG).
- Add client role metadata in `client/src/config/constants.ts` (ROLE_DETAILS).
- Update server flow (managers + handlers) for actions, win/lose, and validation.
- Update client UI + handlers for the role's actions.
- Ensure role-specific data is only broadcast to allowed players in `src/server/managers/broadcastManager.ts`.
- Update narrator handling and narrator audio for any new active steps/phases/transitions.
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

## Passive System Roles (On/Off Toggles)
Some roles are passive system features (e.g., Mayor) and are not part of `RoleConfig`
counts. These are single-instance toggles:
1. Types:
   - `src/shared/types.ts`: add to `PassiveRole` and `PassiveRoleConfig`.
2. Defaults + room state:
   - `src/server/config/constants.ts`: update `DEFAULT_PASSIVE_ROLE_CONFIG`.
   - `src/server/models/room.ts`: initialize `passiveRoleConfig`.
3. Lobby UI + updates:
   - `client/src/renderers/phaseRenderers.ts`: add a toggle input.
   - `client/src/handlers/phaseHandlers.ts`: send `passiveRoles` in `updateRoleConfig`.
   - `src/server/handlers/socketHandlers.ts`: normalize `passiveRoles`.
4. Flow:
   - `src/server/managers/phaseManager.ts`: gate the phase(s) with the toggle.

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
- [ ] No new phases or night steps.
- [ ] No socket events or client handlers needed.
- [ ] Only update types, constants, and tests.
- [ ] If the role has *passive effects* (e.g., extra life), implement that in:
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
4. Audio and narrator (required for active roles):
   - Add narrator files for new steps or phases in `client/public/audio/` (see `client/public/audio/README.md`).
   - Extend narrator handling for any new active role step, phase, or transition.

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
7. Audio and narrator (required)
   - Add `client/public/audio/night_guard.mp3`.
   - Ensure narrator handling covers the new `guard` step/transition.
8. Tests
   - Update `__tests__/nightManager.test.ts`, `__tests__/phaseManager.test.ts`, `__tests__/socketHandlers.test.ts`.

## Win and Death Logic
If the role affects win conditions or death resolution:
- `src/server/managers/deathManager.ts`: update death chains and winner checks.
- `src/server/managers/voteManager.ts`: update day-vote outcomes (e.g., instant win role).

## State Management Patterns

### Understanding State Layers
The codebase has three state representations that must stay in sync:

1. **Room (Server State)** - `src/shared/types.ts: Room`
   - Full server-side state including ALL role data
   - Example: `guardedTarget`, `wolfTarget`, `witchState`

2. **RoomView (Client State)** - `src/shared/types.ts: RoomView`
   - Filtered view sent to clients via `broadcastManager`
   - Contains only data the viewer should see
   - Example: Guard sees `guardedTarget`, others see `null`

3. **Broadcast Visibility** - `src/server/managers/broadcastManager.ts`
   - Controls what each role sees in RoomView
   - Pattern: `fieldName: viewer?.role === 'roleName' ? room.fieldName : null`

### Common State Patterns

**Nightly Reset Pattern** (used in `startNight`):
```typescript
// Save previous state for consecutive action tracking
room.lastGuardedTarget = room.guardedTarget;
// Reset current state for new night
room.guardedTarget = null;
room.guardActed = false;
```

**Protection Logic Pattern** (AND conditions for death):
```typescript
// Player dies only if ALL conditions are false
if (room.wolfTarget &&
    room.healedTarget !== room.wolfTarget &&
    room.guardedTarget !== room.wolfTarget) {
  queueDeath(room, room.wolfTarget, 'eaten by Werewolves');
}
```

**Role-Specific Visibility Pattern**:
```typescript
// In broadcastManager.ts sanitizeRoom:
guardedTarget: viewer?.role === 'guard' ? room.guardedTarget : null,
wolfTarget: viewer?.role === 'witch' || viewer?.role === 'werewolf' ? room.wolfTarget : null,
```

## Testing Your Role

### Test Checklist
When adding a new role, update these test categories:

1. **Unit Tests** - Test role logic in isolation
   - `__tests__/nightManager.test.ts` - Night action behavior
   - `__tests__/phaseManager.test.ts` - Phase flow changes
   - `__tests__/roleManager.test.ts` - Role assignment
   - `__tests__/socketHandlers.test.ts` - Socket event handling

2. **Integration Tests** - Test role with other roles
   - Test interactions (e.g., Guard + Witch protecting same target)
   - Test edge cases (role dies mid-game, all roles dead)

3. **Test Fixtures** - ALL test mocks must include new fields
   - Search for `RoleConfig` - add `yourRole: 0` to all instances
   - Search for `Room` mocks - add your role's state fields
   - Search for `RoomView` mocks - add your role's visibility fields

### Test File Patterns

**Updating RoleConfig in tests**:
```typescript
// Every test file with RoleConfig needs your role
roleConfig: {
  werewolf: 1, seer: 0, hunter: 0, witch: 0,
  armor: 0, joker: 0, guard: 0  // Add this!
}
```

**Updating Room mocks**:
```typescript
// Every Room mock needs your role's state
const room = {
  // ... other fields
  seerActed: false,
  guardedTarget: null,        // Add this!
  lastGuardedTarget: null,    // Add this!
  guardActed: false,          // Add this!
  voteState: createVoteState(),
  // ...
}
```

**Updating RoomView mocks**:
```typescript
// Every RoomView mock needs your role's visibility
const roomView = {
  // ... other fields
  wolfPeers: [],
  guardedTarget: null,        // Add this!
  lastGuardedTarget: null,    // Add this!
  nextNightStep: null,
  // ...
}
```

**Updating Phase Flow Test Expectations**:
```typescript
// If you changed night sequence, update test expectations
// OLD: expect(scheduleNightStep).toHaveBeenCalledWith(room, 'resolve', ...)
// NEW: expect(scheduleNightStep).toHaveBeenCalledWith(room, 'guard', ...)
```

### Finding All Files to Update

Use these commands to find test files that need updates:
```bash
# Find all RoleConfig instances
rg -n "roleConfig.*werewolf.*seer" __tests__/

# Find all Room state initializations
rg -n "seerActed.*false" __tests__/

# Find all RoomView mocks
rg -n "wolfPeers.*\[\]" __tests__/
```

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

## Common Pitfalls and How to Avoid Them

### Critical Mistakes to Avoid

1. **Forgetting Test Fixtures** (most common)
   - **Problem**: TypeScript errors about missing properties in test files
   - **Solution**: Search codebase for `RoleConfig` and add `yourRole: 0` to ALL instances
   - **Files**: Usually 10-15 test files need updates
   - **How to Find**: `rg -n "roleConfig:" __tests__/ | rg -v "yourRole"`

2. **Incomplete Room/RoomView Updates**
   - **Problem**: Type errors or runtime crashes
   - **Solution**: Add fields to BOTH `Room` interface AND `RoomView` interface
   - **Files**: `src/shared/types.ts` (2 places), `src/server/models/room.ts`, `broadcastManager.ts`
   - **Pattern**: Any server state the client needs must be represented in `RoomView` with explicit visibility logic in `broadcastManager.ts`

3. **Outdated Test Expectations**
   - **Problem**: Tests fail even though implementation is correct
   - **Solution**: When you change phase flow, update ALL tests that check phase transitions
   - **Example**: If witch now advances to `'guard'` instead of `'resolve'`, update test expectations
   - **Files**: `__tests__/nightManager.test.ts`, `__tests__/phaseManager.test.ts`

4. **Missing Visibility in Broadcast**
   - **Problem**: Client can't see role-specific data OR sees data they shouldn't
   - **Solution**: Add proper filtering in `broadcastManager.ts sanitizeRoom()`
   - **Pattern**: `fieldName: viewer?.role === 'yourRole' ? room.fieldName : null`

5. **Forgetting Host Skip Support**
   - **Problem**: Game gets stuck when role player disconnects
   - **Solution**: Add your step to `hostSkipStep` handler and host controls list
   - **Files**: `socketHandlers.ts`, `phaseRenderers.ts` (host controls array)

6. **Missing Step in advanceNightStep**
   - **Problem**: Night phase doesn't progress through your role's step
   - **Solution**: Add handling in `advanceNightStep` to check if role acted or is dead
   - **File**: `src/server/managers/nightManager.ts`
   - **Pattern**: Check role alive, check role acted, advance to next step

### Quick Troubleshooting

**"Property X is missing in type RoleConfig"**
- Search for `roleConfig:` in all test files
- Add `yourRole: 0` to every instance

**"Property X is missing in type RoomView"**
- Check if you added field to BOTH `Room` AND `RoomView` interfaces
- Check if you added visibility logic in `broadcastManager.ts`
- Update ALL RoomView test mocks

**"Tests expect wrong night step"**
- You changed phase flow but didn't update test expectations
- Search for `scheduleNightStep` or `phaseStep` in test files
- Update expected values to match new flow

**"Client doesn't show my role's UI"**
- Check `renderNightSection` includes your `phaseStep` condition
- Check your step is in host controls list
- Verify socket handler and client handler are connected

## Pitfalls and Notes
- `DEFAULT_ROLE_CONFIG` must match `RoleConfig`, otherwise lobby validation breaks.
- `validateCounts` in `src/server/managers/roleManager.ts` may need updates if your role has minimums.
- `assignRoles` in `src/server/managers/roleManager.ts` sets `nightAction` only for werewolves; extend it if your role needs per-player action state.
- Be careful with visibility in `broadcastManager`: private info must not leak to other roles.
- If you add a new phase or transition, also update `Phase`/`PhaseTransition` and narrator handling.

## Pre-Commit Validation Checklist

Before committing your new role, verify:

### Type Safety
- [ ] `pnpm run typecheck` passes with no errors
- [ ] No `@ts-ignore` or `any` types added
- [ ] All `RoleConfig` instances include your role
- [ ] All `Room` interfaces include your state fields
- [ ] All `RoomView` interfaces include your visibility fields

### Testing
- [ ] `pnpm test` passes (all tests green)
- [ ] Test expectations updated for phase flow changes
- [ ] All test fixtures include your role's fields
- [ ] No test files skip your role's config

### Implementation
- [ ] Role added to `Role` type union
- [ ] Role added to `ROLE_INFO` with team and description
- [ ] Role added to `ROLE_DETAILS` for client
- [ ] Role added to `DEFAULT_ROLE_CONFIG` (usually `0`)
- [ ] If night action: Added to `NightStep` type
- [ ] If night action: Socket event defined in `events.ts`
- [ ] If night action: Handler added to `socketHandlers.ts`
- [ ] If night action: Client UI renders on correct step
- [ ] If night action: Step included in host skip controls
- [ ] State fields initialized in `createRoom`
- [ ] Broadcast visibility rules added for private data

### Documentation
- [ ] Updated `docs/spec.md` with role mechanics
- [ ] Updated `docs/test-checklist.md` with test scenarios
- [ ] Updated `README.md` to mention role feature
- [ ] If night action: Added narrator audio file docs

### Search Verification Commands
Run these to catch common mistakes:
```bash
# Check all RoleConfigs include your role
rg -n "roleConfig.*werewolf" __tests__/ | rg -v "yourRole"

# Check all Room mocks include your state
rg -n "seerActed" __tests__/ | rg -v "yourRoleActed"

# Check phase step handling
rg -n "phaseStep ===" client/src/renderers/ | rg -v "yourStep"
```

## Tests and Docs
- Update tests with role lists or config changes, e.g. `__tests__/roleManager.test.ts`, `__tests__/phaseManager.test.ts`, `__tests__/nightManager.test.ts`, `__tests__/socketHandlers.test.ts`.
- Update specs: `docs/spec.md`.
- Update manual checks: `docs/test-checklist.md`.
- Integration tests (Playwright): add or extend scenarios in `e2e/`, then run `pnpm run test:e2e` (first time: `pnpm exec playwright install`).
