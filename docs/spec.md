# Game Specification

This document describes the game rules, data model, and phase flow for the Werewolves game.

## Overview

Werewolves is a social deduction game where:

- **Werewolves** secretly kill a villager each night
- **Villagers** vote to eliminate suspects during the day
- Special roles (Seer, Witch, Hunter, Guard, etc.) have unique abilities
- Game ends when all wolves are dead (village wins) or wolves reach majority (wolves win)

## Data Model

### Player

- `id`: string player id.
- `socketId`: string or null active socket id for reconnect.
- `resumeToken`: random token required to resume a session (stored client-side).
- `name`: display name shown to others.
- `role`: enum (`werewolf`, `seer`, `hunter`, `witch`, `armor`, `joker`, `guard`, `harlot`, `villager`).
- `team`: derived team id for win logic (`wolves`, `village`, `neutral`). Joker players are
  `neutral`; the `winner.team` can be `joker` when the Joker is voted out.
- `alive`: boolean.
- `connected`: boolean for reconnect tracking.
- `ready`: boolean for role-reveal readiness.
- `isHost`: boolean for the original host/owner (used to reclaim host on reconnect; UI uses `hostId`).
- `seerResult`: last inspection result for seer UI (name + alignment).

### Room

- `code`: 4-letter uppercase join code.
- `phase`: enum (`lobby`, `roleReveal`, `mayor`, `armor`, `night`, `day`, `ended`).
- `phaseStep`: helper for night substeps (`wolves`, `seer`, `witch`, `guard`, `harlot`, `resolve`, `transition`).
- `dayCount`: starts at 0, increments at each day phase.
- `players`: map playerId -> Player.
- `hostId`: acting host id (may switch on disconnect; reverts to owner when they reconnect).
- `roleConfig`: counts for each special role; villagers fill remainder automatically.
- `minPlayers`: minimum players before start (fixed at 5).
- `passiveRoleConfig`: `{ mayor: boolean }` feature toggles for passive roles.
- `mayorId`: playerId of the current Mayor (null before election).
- `awaitingMayorSelection`: playerId awaiting a mayor succession pick, or null.
- `mayorSelectionQueue`: queue of mayor succession prompts.
- `mayorSelectionTimer`: timeout for mayor succession (60 seconds; auto-selects random alive player on timeout).
- `lovers`: `{aId, bId}` or null.
- `witchState`: `{healAvailable: boolean, poisonAvailable: boolean}`.
- `guardedTarget`: player protected by guard this night, or null.
- `lastGuardedTarget`: player protected by guard last night (for consecutive protection rule), or null.
- `guardActed`: boolean, true if guard has submitted protection this night.
- `harlotVisitedTarget`: player visited by harlot this night, or null.
- `harlotActed`: boolean, true if harlot has submitted a visit this night.
- `wolfVotes`: map playerId -> targetId (null for no vote, undefined = not voted yet).
- `wolfTarget`: chosen target after wolf vote resolves.
- `healedTarget`: player healed by Witch (usually wolf target), or null.
- `poisonTarget`: player poisoned by Witch, or null.
- `seerActed`: boolean, true once the Seer has inspected this night.
- `voteState`: `{votes: map playerId -> targetId|null|undefined, revoteFromTie: array|null}`.
- `pendingDeaths`: queue of `{playerId, reason}` awaiting resolution.
- `logs`: array of structured entries for UI recap (`{ts, text, publicText}`).
- `lastNightDeaths`: array of `{name, role}` announced in the day report.
- `lastDayDeaths`: array of `{name, role}` announced after day vote.
- `lastDayMessage`: string or null (used when no one is eliminated).
- `awaitingHunterShot`: playerId awaiting a hunter shot, or null.
- `hunterShotEndsAt`: timestamp for hunter shot timeout UI, or null.
- `hunterShotTimer`: timeout for hunter shot (60 seconds; auto-skips if no target selected).
- `hunterShotQueue`: queue of hunter death events awaiting shot prompts.
- `phaseTransition`: pending phase transition kind (`postReveal`, `postMayor`, `postArmor`, `nightToDay`, `dayToNight`) or null.
- `nextNightStep`: when `phaseStep` is `transition`, the next step to enter.
- `transitionTimer`: timeout for night-step transitions.
- `phaseTimer`: timeout for phase transitions (postReveal/postMayor/postArmor/nightToDay/dayToNight).
- `dayVoteResolved`: boolean, true after day vote resolves and all pending actions are done.
- `winner`: `{team: 'village' | 'wolves' | 'joker', reason}` when ended.
- `createdAt`: timestamp when room was created.
- `lastActivityAt`: timestamp of last room activity (updated on each broadcast; used for automatic cleanup).

## Phase Engine Pseudocode

```
loop:
  switch phase:
    lobby:
      host config roles; on start validate counts
      assign roles randomly; set phase=roleReveal
    roleReveal:
      send each player role; wolves get list of other wolves (private UI fields)
      require each player to mark ready
      host continues once all connected players are ready
      if passiveRoleConfig.mayor -> go phase=mayor
      else -> go phase=armor if armor alive else startNight (phase=night, step='wolves')
    mayor:
      collect votes from alive players to elect the Mayor
      if tie: revote among tied candidates
      if tie again: choose random among tied candidates
      once mayor elected -> go phase=armor if armor alive else startNight (phase=night, step='wolves')
    armor:
      wait for armor player to choose two targets
      set lovers; notify both
      host may skip armor if the player is offline or unresponsive
      schedule transition to night
    night (step machine):
      if step='wolves':
        collect werewolf votes until all submitted
        once locked, compute target using majority (ties random)
        if no votes, pick a random alive non-wolf
        if host skipped wolf step, allow no-kill (wolfTarget = null)
        store `wolfTarget` and advance to step='seer'
      if step='seer':
        if seer alive:
          wait for inspect -> respond privately with result
        advance step='witch'
      if step='witch':
        if witch alive:
          show wolves' target; let witch save/poison (one potion per night)
          witch can use both potions in the same night
          button shows 'Continue' after using any potion, otherwise 'Skip'
          update potion flags
        advance step='guard'
      if step='guard':
        if guard alive:
          wait for guard to select a target to protect
          guard cannot protect same player two nights in a row
          guard cannot protect themselves
        advance step='harlot'
      if step='harlot':
        if harlot alive:
          wait for harlot to select a player to visit
          harlot cannot visit themselves
          if harlot visits the wolf target (and target is not protected), harlot also dies
        advance step='resolve'
      delays:
        - night step transitions: ~3s
        - postReveal: ~6s
        - postMayor: ~5s
        - postArmor: ~10s
        - night_resolve: ~6s
        - nightToDay: ~3s
        - dayToNight: ~6s
      (E2E mode sets these delays to 0)
      host may skip current step if a player is offline or unresponsive
      if step='resolve':
        apply wolf target unless healed or guarded -> queue death
        if harlot visited wolf target (and target dies), queue harlot death
        apply poison death (if any) unless guarded -> queue death
        process queued deaths with `resolveDeaths()`
        increment day count, update phase='day', reset votes
    day:
      ...vote resolution...
      once winner target established:
        set dayVoteResolved=true, broadcast
        host clicks 'Proceed to Night' to trigger dayToNight transition
    day:
      announce deaths to all
      collect votes from alive players
      abstain requires explicit selection; majority abstain -> no elimination
      if tie:
        if mayor voted for a tied candidate: mayor breaks tie
        else set revote list + reset votes limited to tied players
      if tie again:
        if mayor voted for a tied candidate: mayor breaks tie
        else choose random among tied players
      once winner target established:
        if role(target)=='joker': endGame('joker', 'Joker voted out')
        else:
          kill target, resolveDeaths()
          after all actions complete (hunter shots, mayor successions):
            set dayVoteResolved=true
            host must click 'Proceed to Night' button to continue
            button only appears after all pending actions are resolved
          if game not ended -> host triggers dayToNight transition

resolveDeaths():
  while queue not empty:
    pop (playerId, reason)
    if already dead continue
    mark dead, append log
    set public log to reveal victim + role only
    if role is hunter -> add to hunterShotQueue and start hunter shot prompt (60s timeout)
    if player is mayorId -> add to mayorSelectionQueue and start mayor succession prompt (60s timeout)
    if player is lover -> enqueue other lover death reason='died of heartbreak'
  after queue empty check win conditions:
    if all wolves dead -> endGame('village', 'All wolves dead')
    else if wolves > others (strict majority):
      endGame('wolves', 'Werewolves have the majority')
    else if wolves == others (parity):
      special case:
        - if a witch is alive AND has both potions available -> endGame('village', 'Witch can heal and poison to break parity')
      otherwise check if village still has counterplay:
        - hunter alive (can shoot)
        - pending mayor succession
        - mayor alive (has tie-breaking power in votes)
      if any of above true -> game continues
      else -> endGame('wolves', 'Werewolves reached parity')

HunterShot(targetId):
  enqueue death for target
  resolveDeaths()
  if no response within 60 seconds (30 seconds in E2E mode):
    auto-skip hunter shot and resume game flow

MayorSuccession(newMayorId):
  set mayorId to newMayorId
  resume game flow
  if no response within 60 seconds (30 seconds in E2E mode):
    randomly select an alive player as new mayor and resume game flow

onPlayerDisconnect(playerId):
  mark connected=false; keep state for reconnection
  if player was host -> assign acting host to another connected player (if any)

onPlayerResume(roomCode, playerId, resumeToken):
  if resumeToken missing or mismatched -> reject
  mark connected=true
  if player is original host -> set acting host back to owner

## Room Lifecycle & Cleanup

Rooms are automatically cleaned up to prevent memory leaks:
- **Ended games**: Deleted 1 hour after the game ends (phase='ended')
- **Idle rooms**: Deleted after 24 hours of inactivity if:
  - Room is still in lobby phase, OR
  - All players are disconnected
- **Activity tracking**: `lastActivityAt` timestamp updates on every room broadcast
- **Cleanup interval**: Runs every hour to check and remove stale rooms
```
