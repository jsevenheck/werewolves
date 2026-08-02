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
- `discussionTimerSeconds`: configurable lobby setting (default 60; 0 in E2E) for the forced discussion period after each night before day voting opens.
- `discussionEndsAt`: timestamp (ms) when the day discussion lock lifts and voting opens, or null when inactive.
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
- `seerAwaitingDismiss`: boolean, true after seer submits inspect and before they dismiss the result overlay; phase does not advance to witch while this is true.
- `voteState`: `{votes: map playerId -> targetId|null|undefined, revoteFromTie: array|null}`.
- `pendingDeaths`: queue of `{playerId, reason}` awaiting resolution.
- `logs`: array of structured entries for UI recap (`{ts, text, publicText, message?, publicMessage?}`).
  `message`/`publicMessage` contain a stable localization key + params so the client can
  translate the log; legacy `text`/`publicText` remains for backward compatibility.
  `deadOnly`: when true, the entry is only shown to dead spectators (and to everyone
  once the game ends); alive players never see it. Used for night-action narration so
  dead players can follow who did what, mirroring in-person spectating.
- `lastNightDeaths`: array of `{name, role}` announced in the day report.
- `lastDayDeaths`: array of `{name, role}` announced after day vote.
- `lastDayMessage`: string or null (used when no one is eliminated).
- `lastDayMessageI18n`: optional localized message key + params for `lastDayMessage`.
- `awaitingHunterShot`: playerId awaiting a hunter shot, or null.
- `hunterShotEndsAt`: timestamp for hunter shot timeout UI, or null.
- `hunterShotTimer`: timeout for hunter shot (60 seconds; auto-skips if no target selected).
- `hunterShotQueue`: queue of hunter death events awaiting shot prompts.
- `phaseTransition`: pending phase transition kind (`postReveal`, `postMayor`, `postArmor`, `nightToDay`, `dayToNight`) or null.
- `nextNightStep`: when `phaseStep` is `transition`, the next step to enter.
- `transitionTimer`: timeout for night-step transitions.
- `phaseTimer`: timeout for phase transitions (postReveal/postMayor/postArmor/nightToDay/dayToNight).
- `dayVoteResolved`: boolean, true after day vote resolves and all pending actions are done.
- `winner`: `{team: 'village' | 'wolves' | 'joker', reason, reasonMessage?}` when ended.
  `reasonMessage` is an optional localization key + params for the winner reason.
- `createdAt`: timestamp when room was created.
- `lastActivityAt`: timestamp of last room activity (updated on each broadcast; used for automatic cleanup).

## Phase Engine Pseudocode

```
loop:
  switch phase:
    lobby:
      host config roles; on start validate counts
      (counts include a connected-check: start is blocked while any player
      is disconnected, so no one is silently locked out of role assignment)
      assign roles randomly; set phase=roleReveal
    roleReveal:
      send each player role; wolves get list of other wolves (private UI fields)
      require each player to mark ready
      host continues once all connected players are ready
      note: player role tags are shown on the cards for the viewer's own role,
        for players who are already dead, and for everyone once the game ends
        (phase='ended'). Living players' roles remain hidden during the game.
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
          seer sees a full-screen result overlay (name + alignment); seerAwaitingDismiss=true
          phase does NOT advance until seer dismisses via seerContinue event ("Got it!" button)
          if seer disconnects while awaiting dismiss -> auto-advance after grace period
          if host skips step -> seerAwaitingDismiss reset, advance immediately
          if seer leaves -> seerAwaitingDismiss reset, advance immediately
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
          harlot death: if wolves successfully kill the player the harlot visited
            (i.e. the kill was not blocked by heal or guard), the harlot also dies
          note: visiting a werewolf directly does NOT cause harlot death
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
        if wolf kill succeeds and harlot visited the wolf target, queue harlot death
        apply poison death (if any) unless guarded -> queue death
        NOTE: Guard protection intentionally blocks BOTH wolf kills AND poison.
              This is by design — the guard's protection is absolute for that night.
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
      a configurable `discussionTimerSeconds` countdown runs first (default 60s);
        day voting (`submitDayVote` / `hostFinalizeDayVote`) is rejected until it
        elapses, so players can discuss before anyone votes. 0 disables the lock.
      abstain requires explicit selection; majority abstain -> no elimination
      if tie:
        if mayor voted for a tied candidate: mayor's vote counts double
          (i.e. +1 to their candidate). If the doubled tally still ties
          or never reaches a simple majority, fall through to the revote
          path below.
        else set revote list + reset votes limited to tied players
      if tie again:
        if mayor voted for a tied candidate: mayor's vote counts double
        else choose random among tied players
      simple majority required: the leading candidate must hold more than
        half of the non-abstaining votes that counted toward resolution;
        explicit abstentions do not count toward either side. Otherwise the
        day is skipped (no elimination, no revote). Host-forced early
        resolution (allowEarly) waives the simple-majority threshold so a
        host can still push a small lead through.
      once winner target established:
        if role(target)=='joker':
          queue joker death and resolveDeaths() first (so lover heartbreak is processed)
          then set winner='joker' and end game
          clear pending hunter/mayor prompts and timers
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
  5-second grace period before marking connected=false (absorbs brief mobile interruptions)
  socket index is removed immediately; player state and broadcast are delayed
  if the player reconnects within 5 seconds the pending timer is cancelled — no disconnect is recorded
  after grace period: mark connected=false; keep state for reconnection
  if player was host -> assign acting host to another connected player (if any)

onCloseSession(hostId):
  only the acting host may close the session
  cancel all pending reconnect grace timers for players in the room
  emit `roomClosed` to all connected clients so they can reset and clear their session
  disconnect all player sockets
  delete the room so fresh joins are possible

onPlayerKick(hostId, targetId):
  only allowed during lobby phase
  only the acting host may kick; host cannot kick themselves
  target player's socket is disconnected immediately
  target is removed from the room entirely (same cleanup as onPlayerLeave in lobby)
  remaining players receive a broadcast with the updated room state

onAdminKickPlayer(roomCode, targetId):
  admin-only (socket.data.adminToken === true, verified at handshake against WEREWOLVES_ADMIN_TOKEN)
  works in ANY phase (lobby, night, day, ended)
  can kick any player, including the host and the last remaining player
  target socket is disconnected, player record removed, host fallback applied
  a localized 'kicked' log entry is added; admins never appear in room.players
  no phase continuation is triggered (this is an emergency stop, not a leave)
  if the kick empties the room (0 players left), the room is torn down
    immediately: admin observers receive roomClosed, the room is deleted

onAdminCloseRoom(roomCode):
  admin-only; works in ANY phase
  deletes the room entirely: cancels pending disconnect grace timers,
    emits roomClosed to every connected player and disconnects them,
    emits roomClosed to admin observers (and removes them from the
    observer registry), then deletes the room
  analogous to the host closeSession event but callable by an admin
    from the admin detail view (red 'Close Session' button)

onHostMidGameKickPlayer(roomCode, playerId, targetId):
  admin-only AND host-only (room.hostId === playerId; playerId is the host's own player id)
  works in ANY phase; intended for removing a disrupting player mid-game
  the host's regular player socket has no admin token, so the host UI lazily
    opens a short-lived admin socket (useHostAdminKick) to emit this event
  host cannot kick themselves (playerId === targetId is rejected)
  same teardown as onAdminKickPlayer (socket disconnect, host fallback, localized log)

AdminObserver:
  an admin socket may register as a read-only observer of one room via adminJoinRoom
  observers are NOT players: not in room.players, no self, cannot vote/act/be targeted
  they receive sanitized roomUpdate events built by buildAdminRoomView, which strips
    self, all player.role, mayorId, seerResult, witchState, wolfVotes, wolfPeers,
    wolfIds, guardedTarget, harlotVisitedTarget, loverName, loversKnown, and
    Hunter/Mayor identity (only boolean *Pending flags remain)
  adminLeaveRoom (or disconnect) removes the observer mapping
  one socket observes at most one room at a time

onPlayerLeave(playerId):
  remove player from the room entirely (not just disconnect)
  if room is in lobby phase -> simply remove and broadcast
  if room is mid-game:
    - clean up stale votes targeting the departed player (day votes)
    - remove departed player's own wolf/day vote entries
    - remove player from revoteFromTie list if present
    - if night phase and all remaining wolves have voted -> finalize wolf vote
    - if night phase and active step belongs to departed player (seer/witch/guard/harlot) -> advance to next night step
    - if day phase and all remaining alive players have voted -> resolve day vote
    - if departed player was awaiting hunter shot -> clear timer/prompt and process next queued hunter or resume the current phase when no prompt remains
    - if departed player was awaiting mayor succession -> clear timer/prompt and continue the mayor/hunter queue, or resume the current phase when no prompt remains
      (random mayor auto-selection only happens on mayor-selection timeout)
    - check win conditions after all cleanup
  if room becomes empty -> stop resolution and broadcast (room lifecycle cleanup handles eventual deletion)

onPlayerResume(roomCode, playerId, resumeToken):
  validate room, player, and resumeToken before changing socket or disconnect state
  only a validated resume may cancel the 5-second disconnect grace timer
  if resumeToken missing or mismatched -> reject without detaching the current session
  mark connected=true
  if player is original host -> set acting host back to owner

## Room Lifecycle & Cleanup

Rooms are automatically cleaned up to prevent memory leaks:
- **Ended games**: Deleted 1 hour after the game ends (phase='ended')
- **Empty rooms**: Deleted immediately when the last player is removed
  (via admin kick, host mid-game kick, or a player leaving). Admin
  observers of such a room receive `roomClosed` and are returned to the
  room list. As a safety net, the hourly cleanup pass also reaps any
  0-player room it finds.
- **Idle rooms**: Deleted after 24 hours of inactivity if:
  - Room is still in lobby phase, OR
  - All players are disconnected
- **Activity tracking**: `lastActivityAt` timestamp updates on every room broadcast
- **Cleanup interval**: Runs every hour to check and remove stale rooms
```

## Narrator Audio (Locale-Aware)

The narrator is locale-aware. It reads the active UI language from
`i18n.global.locale.value` and resolves audio clips in this order:

1. `${assetsBasePath}/${locale}/custom/${key}.mp3` (locale custom override)
2. `${assetsBasePath}/${locale}/${key}.mp3` (locale default override)
3. `${assetsBasePath}/custom/${key}.mp3` (locale-agnostic custom)
4. `${assetsBasePath}/${key}.mp3` (locale-agnostic default)
5. Bundled clip for the active locale (e.g. `/en/${key}.mp3`)
6. Bundled English clip as final fallback

Locale is `'en'` or `'de'` — matching the supported languages in
`ui-vue/src/i18n/types.ts`. When the UI language changes, the narrator
drops its Howl cache so the next clip resolves from the new locale; the
currently-playing clip is left to finish (no abrupt cut).

Bundled clips live in:

- `ui-vue/src/assets/audio/en/` (English)
- `ui-vue/src/assets/audio/de/` (German; empty by default)

To add a German clip, drop an MP3 with the same filename as the
English one into the `de/` folder. Vite picks it up at build time via
`import.meta.glob`. No code change required.
