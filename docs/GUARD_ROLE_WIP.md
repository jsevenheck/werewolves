# Guard Role Implementation - Work In Progress

## Status: E2E Tests Failing

The Guard role has been implemented but E2E tests are failing because the guard step is being skipped during the night phase.

## What's Done ✅

### Core Types & Events
- `core/src/types.ts`: Added `'guard'` to Role, NightStep; added `guard: number` to RoleConfig; added `guardedTarget`, `lastGuardedTarget`, `guardActed` to Room/RoomView
- `core/src/events.ts`: Added `submitGuardProtection` event

### Server Logic
- `server/src/config/constants.ts`: Added Guard to ROLE_INFO and DEFAULT_ROLE_CONFIG
- `server/src/models/room.ts`: Added guard state fields initialization
- `server/src/managers/roleManager.ts`: Added singleton validation (max 1 guard)
- `server/src/managers/nightManager.ts`: Added guard step handling in advanceNightStep, protection logic in resolveNight (blocks wolf kills and poison)
- `server/src/managers/broadcastManager.ts`: Added guard fields to RoomView sanitization
- `server/src/managers/phaseManager.ts`: Added 'guard' to advanceNightStep call conditions; added `guardActed = false` reset in startNight
- `server/src/handlers/socketHandlers.ts`: Added `submitGuardProtection` handler, guard skip in hostSkipStep, guard reset in restartGame

### UI (Vue)
- `ui-vue/src/components/NightPhase.vue`: Added guard form with protection selection
- `ui-vue/src/components/Lobby.vue`: Added guard to ROLE_DETAILS and default roleConfig

### Tests
- Updated all unit test mocks to include guard fields (roleConfig + room state)
- Updated nightManager tests to expect 'guard' step after witch
- All 105 unit tests pass ✅
- Created `e2e/guardProtection.spec.ts` with 3 test cases
- Updated `e2e/helpers.ts` RoleConfig type to include guard

## What's Left ❌

### Critical Bug: Guard Step Being Skipped
The guard step is being skipped during night. Debug output shows:
- Wolf submits vote
- Night immediately resolves to Day (skipping seer, witch, AND guard steps)
- Villager A dies even though guard should have had a chance to protect

**Root Cause Investigation Needed:**
1. Check `resolveNightStep` function in `phaseManager.ts` - it may be skipping guard
2. The step resolution flow: wolves → seer → witch → guard → resolve
3. When seer/witch are not present (count=0), their steps auto-skip via `advanceNightStep`
4. Guard step should pause and wait for guard action, but it's not

**Likely Issue:**
Look at `resolveNightStep` function around line 132 in `phaseManager.ts`. It probably doesn't handle the 'guard' step and may be skipping straight to 'resolve'.

### Once Guard E2E Tests Pass
1. Run full E2E suite: `pnpm run test:e2e`
2. Update `docs/spec.md` with Guard role rules
3. Update `docs/createNewRoles.md` if needed
4. Remove debug code from `e2e/guardProtection.spec.ts` (lines 44-49)

## Quick Resume Commands
```bash
cd c:\Users\jonas\Coding\werewolves
pnpm run typecheck   # Should pass
pnpm test            # 105 tests should pass
pnpm exec playwright test e2e/guardProtection.spec.ts  # Currently failing
```

## Files to Check
- `server/src/managers/phaseManager.ts` - `resolveNightStep` function (line ~132)
- `server/src/managers/nightManager.ts` - `advanceNightStep` function
- `e2e/guardProtection.spec.ts` - Has debug code to remove once working
