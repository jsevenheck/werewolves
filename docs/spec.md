## Data Model

### Player
- `id`: string socket id.
- `name`: display name shown to others.
- `role`: enum (`werewolf`, `seer`, `hunter`, `witch`, `armor`, `joker`, `villager`).
- `team`: derived team id for win logic (`wolf`, `village`, `neutral`).
- `alive`: boolean.
- `connected`: boolean for reconnect tracking.
- `ready`: boolean for lobby toggles.
- `voteTarget`: player id selected during day (reset each vote).
- `nightAction`: per-role payload:
  - Werewolf: `targetId`.
  - Seer: `inspectId`.
  - Witch: `{healTargetId?, poisonTargetId?}` plus potion availability.
  - Armor: `[loverAId, loverBId]`.
  - Hunter: `shotTargetId` when dying.
- `isHost`: boolean for UI permissions.
- `seerResult`: last inspection result for seer UI (name + alignment).

### Room
- `code`: 4-letter uppercase join code.
- `phase`: enum (`lobby`, `roleReveal`, `armor`, `night`, `day`, `ended`).
- `phaseStep`: helper for night/day substeps (wolves, seer, witch, resolve, vote, revote).
- `dayCount`: starts at 0, increments at each day phase.
- `players`: map playerId -> Player.
- `hostId`: player id allowed to configure roles/start.
- `roleConfig`: counts for each special role; villagers fill remainder automatically.
- `assignedRoles`: shuffle result stored for reconnection/resync.
- `lovers`: `{aId, bId}` or null.
- `minPlayers`: configurable minimum players before start (default 5, min 3).
- `witch`: `{healAvailable: boolean, poisonAvailable: boolean, pendingDecision: {target, type}}`.
- `wolfVote`: tracking map playerId -> targetId for nightly kill.
- `voteTallies`: map for day vote + `revoteList`.
- `pendingDeaths`: queue of player ids awaiting resolution (captures kill reason for logs).
- `logs`: array of structured entries for UI recap (timestamp, full text + public text).
- `winner`: `{team: 'village' | 'wolves' | 'joker', reason}` when ended.

## Phase Engine Pseudocode

```
loop:
  switch phase:
    lobby:
      host config roles; on start ensure counts == players
      assign roles randomly; set phase=roleReveal
    roleReveal:
      send each player role; wolves get list of other wolves (private UI fields)
      go phase=armor if armor exists else phase=night with step='wolves'
    armor:
      wait for armor player to choose two targets
      set lovers; notify both
      phase=night step='wolves'
    night (step machine):
      if step='wolves':
        collect werewolf votes until timer or all submitted
        once locked, compute target using majority (ties random)
        store `wolfTarget` and advance step='seer'
      if step='seer':
        if seer alive:
          wait for inspect -> respond privately with result
        advance step='witch'
      if step='witch':
        if witch alive:
          show wolves' target; let witch save/poison (one potion per night)
          update potion flags
        advance step='resolve'
      if step='resolve':
        apply wolf target unless healed -> queue death
        apply poison death (if any)
        process queued deaths with `resolveDeaths()`
        increment day count, update phase='day', reset votes
    day:
      announce deaths to all
      collect votes from alive players
      if tie: set revoteList + reset votes limited to tied players
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
    if player is lover -> enqueue other lover death reason='brokenHeart'
  after queue empty check win conditions:
    if all wolves dead -> endGame('village', 'All wolves dead')
    else if wolves >= others -> endGame('wolves', 'Parity reached')

HunterShot(targetId):
  enqueue death for target
  resolveDeaths()

onPlayerDisconnect(playerId):
  mark connected=false; keep state for reconnection
```
