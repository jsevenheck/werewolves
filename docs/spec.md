## Data Model

### Player
- `id`: string player id.
- `socketId`: string or null active socket id for reconnect.
- `resumeToken`: random token required to resume a session (stored client-side).
- `name`: display name shown to others.
- `role`: enum (`werewolf`, `seer`, `hunter`, `witch`, `armor`, `joker`, `villager`).
- `team`: derived team id for win logic (`wolves`, `village`, `neutral`).
- `alive`: boolean.
- `connected`: boolean for reconnect tracking.
- `ready`: boolean for role-reveal readiness.
- `voteTarget`: legacy field (cleared on death; day voting uses `voteState`).
- `nightAction`: currently `null` for most roles; werewolves get `{ vote: null }` on assignment (not used by core flow).
- `isHost`: boolean for the original host/owner (used to reclaim host on reconnect; UI uses `hostId`).
- `seerResult`: last inspection result for seer UI (name + alignment).

### Room
- `code`: 4-letter uppercase join code.
- `phase`: enum (`lobby`, `roleReveal`, `mayor`, `armor`, `night`, `day`, `ended`).
- `phaseStep`: helper for night substeps (`wolves`, `seer`, `witch`, `resolve`, `transition`).
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
- `wolfVotes`: map playerId -> targetId (null for no vote).
- `wolfTarget`: chosen target after wolf vote resolves.
- `voteState`: `{votes: map playerId -> targetId|null, revoteFromTie: array|null}`.
- `pendingDeaths`: queue of `{playerId, reason}` awaiting resolution.
- `logs`: array of structured entries for UI recap (`{ts, text, publicText}`).
- `lastNightDeaths`: array of `{name, role}` announced in the day report.
- `awaitingHunterShot`: playerId awaiting a hunter shot, or null.
- `hunterShotTimer`: timeout for hunter shot (60 seconds; auto-skips if no target selected).
- `hunterShotQueue`: queue of hunter death events awaiting shot prompts.
- `phaseTransition`: pending phase transition kind (`postReveal`, `postMayor`, `postArmor`, `nightToDay`, `dayToNight`) or null.
- `nextNightStep`: when `phaseStep` is `transition`, the next step to enter.
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
      note: disconnected players do not block progression; only connected players must be ready
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
        store `wolfTarget` and advance to step='seer'
      if step='seer':
        if seer alive:
          wait for inspect -> respond privately with result
        advance step='witch'
      if step='witch':
        if witch alive:
          show wolves' target; let witch save/poison (one potion per night)
          update potion flags
        advance step='resolve'
      wait ~3 seconds between all phase transitions and night steps to allow players to reset
      host may skip current step if a player is offline or unresponsive
      if step='resolve':
        apply wolf target unless healed -> queue death
        apply poison death (if any)
        process queued deaths with `resolveDeaths()`
        increment day count, update phase='day', reset votes
    day:
      announce deaths to all
      collect votes from alive players
      abstain requires explicit selection; majority abstain -> no elimination
      if tie: set revote list + reset votes limited to tied players
      if tie again: choose random among tied players
      once winner target established:
        if role(target)=='joker': endGame('joker', 'Joker voted out')
        else:
          kill target, resolveDeaths()
          if phase still not ended -> start next night (phase='night', step='wolves')

resolveDeaths():
  while queue not empty:
    pop (playerId, reason)
    if already dead continue
    mark dead, append log
    set public log to reveal victim + role only
    if role is hunter -> add to hunterShotQueue and start hunter shot prompt (60s timeout)
    if player is mayorId -> add to mayorSelectionQueue and start mayor succession prompt (60s timeout)
    if player is lover -> enqueue other lover death reason='died of heartbreak'
  after queue empty:
    if no hunters pending and no hunter shots queued:
      process mayor succession queue (if any)
      after mayor selections complete:
        check win conditions:
          if all wolves dead -> endGame('village', 'All wolves dead')
          else if wolves >= others:
            check for special village abilities that could still turn the tide:
              if hunter alive OR witch has poison available -> continue game (village still has chance)
              else -> endGame('wolves', 'Parity reached')

HunterShot(targetId):
  enqueue death for target
  resolveDeaths()
  if no response within 60 seconds:
    auto-skip hunter shot and resume game flow

MayorSuccession(newMayorId):
  set mayorId to newMayorId
  resume game flow
  note: mayor succession is processed BEFORE win condition checks
  this allows the mayor's potential tie-breaking vote to affect outcomes in close games
  if no response within 60 seconds:
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
