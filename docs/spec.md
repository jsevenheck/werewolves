## Data Model

### Player
- `id`: string player id.
- `socketId`: string socket id for reconnect.
- `name`: display name shown to others.
- `role`: enum (`werewolf`, `seer`, `hunter`, `witch`, `armor`, `joker`, `villager`).
- `team`: derived team id for win logic (`wolves`, `village`, `neutral`).
- `alive`: boolean.
- `connected`: boolean for reconnect tracking.
- `ready`: boolean for role-reveal readiness.
- `voteTarget`: legacy field (cleared on death; day voting uses `voteState`).
- `nightAction`: currently `null` for most roles; werewolves get `{ vote: null }` on assignment (not used by core flow).
- `isHost`: boolean for UI permissions.
- `seerResult`: last inspection result for seer UI (name + alignment).

### Room
- `code`: 4-letter uppercase join code.
- `phase`: enum (`lobby`, `roleReveal`, `armor`, `night`, `day`, `ended`).
- `phaseStep`: helper for night substeps (`wolves`, `seer`, `witch`, `resolve`, `transition`).
- `dayCount`: starts at 0, increments at each day phase.
- `players`: map playerId -> Player.
- `hostId`: player id allowed to configure roles/start.
- `roleConfig`: counts for each special role; villagers fill remainder automatically.
- `minPlayers`: configurable minimum players before start (default 5, min 3).
- `lovers`: `{aId, bId}` or null.
- `witchState`: `{healAvailable: boolean, poisonAvailable: boolean}`.
- `wolfVotes`: map playerId -> targetId (null for no vote).
- `wolfTarget`: chosen target after wolf vote resolves.
- `voteState`: `{votes: map playerId -> targetId|null, revoteFromTie: array|null}`.
- `pendingDeaths`: queue of `{playerId, reason}` awaiting resolution.
- `logs`: array of structured entries for UI recap (`{ts, text, publicText}`).
- `lastNightDeaths`: array of `{name, role}` announced in the day report.
- `awaitingHunterShot`: playerId awaiting a hunter shot, or null.
- `phaseTransition`: pending phase transition kind (`postReveal`, `postArmor`, `nightToDay`, `dayToNight`) or null.
- `nextNightStep`: when `phaseStep` is `transition`, the next step to enter.
- `winner`: `{team: 'village' | 'wolves' | 'joker', reason}` when ended.

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
      go phase=armor if armor alive else startNight (phase=night, step='wolves')
    armor:
      wait for armor player to choose two targets
      set lovers; notify both
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
    if role is hunter -> request shot target immediately
    if player is lover -> enqueue other lover death reason='died of heartbreak'
  after queue empty check win conditions:
    if all wolves dead -> endGame('village', 'All wolves dead')
    else if wolves >= others -> endGame('wolves', 'Parity reached')

HunterShot(targetId):
  enqueue death for target
  resolveDeaths()

onPlayerDisconnect(playerId):
  mark connected=false; keep state for reconnection
```
