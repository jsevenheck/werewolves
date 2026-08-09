# Test Checklist

Manual and automated testing expectations for the Werewolves game.

## Manual Test Checklist

- **Armor assignment & lover notification**: Host starts a game where Armor is alive; confirm Armor screen appears once, picks two players, and both see Lover name in their role card while everyone else sees a waiting message.
- **Lovers death link**: Create Lovers pair, then (a) vote one Lover out, (b) kill one at night via Werewolves or Witch poison, and (c) let Hunter shoot one; each time ensure the partner dies immediately with "died of heartbreak" log and that chained deaths still trigger Hunter/Joker logic correctly.
- **Hunter shot timeout**: When a Hunter dies but doesn't select a target within 60 seconds, verify the game auto-skips the hunter shot and continues normally.
- **Mayor succession**: When the Mayor dies, verify the dying mayor receives a prompt to select a successor. Test both manual selection and 60-second timeout (which randomly selects an alive player).
- **Mayor succession timeout**: When mayor dies but doesn't select a successor within 60 seconds, verify a random alive player is automatically selected as the new mayor and the game continues.
- **Mayor tie-breaking in day votes**: During a day vote tie, if the mayor voted for one of the tied candidates, verify the mayor's vote breaks the tie. If the mayor didn't vote for a tied candidate, verify a revote is triggered.
- **Event log visibility**: While alive, verify logs and night report show victim + role but do not reveal the killer. After death, confirm full log details are visible.
- **Joker voted out**: Configure a Joker, run a day vote that eliminates them, and verify Joker wins that day. If lover-heartbreak deaths happen in the same chain, confirm they are resolved/logged first and no hunter/mayor pending prompts remain after game end.
- **Hunter dies via Lovers link**: Make Hunter a Lover partner, kill the other Lover (any method), and ensure Hunter still receives the last-shot overlay even though death came from heartbreak.
- **Werewolf & day vote ties**: Force wolf vote tie to see random target selection, and run a day vote tie to trigger revote UI; verify second tie resolves randomly among tied players.
- **Host kick player**: In the lobby, the host sees a "Kick" button next to each other player. Confirm kicked player is removed from the room and the remaining players list updates. Verify the host cannot kick themselves and the button is absent outside the lobby phase.
- **Host close session**: The host sees a "Close Session" danger button in the Events panel. Clicking it shows a confirmation panel; confirming sends all clients back to the landing screen and clears their session. Verify non-hosts do not see the button and that a fresh join is possible after the session is closed.
- **Disconnect grace period**: Close a browser tab mid-game and reopen it within 5 seconds; confirm no "disconnected" log entry appears and the player resumes seamlessly. Wait longer than 5 seconds and verify the disconnect is recorded and the acting host is updated if needed.
- **Role reveal overlay**: When the game starts and the `roleReveal` phase begins, each player should immediately see a full-screen overlay showing their role name (in role colour) and description. Dismissing the overlay via "Got it!" (or tapping the backdrop) closes it; the underlying Role Reveal panel with the Ready button remains accessible.
- **Role reveal readiness**: During role reveal, each player must click Ready; host can only continue once all connected players are ready.
- **Host skip armor step**: With an unresponsive or disconnected Armor, host uses Skip armor step and the game continues into night.
- **Host skip night step**: With an unresponsive or disconnected Witch/Seer/Wolf, host uses Skip current action and the game continues normally.
- **Transition delays**: Confirm ~3s delay after each night action step, ~6s after role reveal (postReveal), ~5s after mayor (postMayor), ~10s after armor (postArmor), ~6s after night_resolve, ~3s for nightToDay, and ~6s for dayToNight. In E2E mode (`E2E_TESTS=1`), these delays are 0.
- **Witch potion tracking**: Use heal potion once to prevent the wolf kill, confirm potion becomes unavailable later, then poison a target on another night and ensure dead count + Lovers link apply before win checks. After using either potion, verify the button changes to 'Continue' instead of 'Skip'.
- **Guard protection from wolves**: Guard selects a player at night; if wolves target that same player, confirm the player survives and appears in no death report.
- **Guard protection from poison**: Guard selects a player that the Witch poisons; confirm the player survives the poison.
- **Guard consecutive protection restriction**: Guard protects player A on night 1; on night 2, confirm player A is not available in the target list (guard cannot protect the same player two nights in a row).
- **Guard cannot self-protect**: Confirm guard cannot select themselves as protection target.
- **Harlot dies visiting wolf victim**: Configure a Harlot, let them visit the wolf's target during night; confirm the Harlot dies along with the wolf's victim.
- **Harlot survives visiting non-victim**: Harlot visits someone who is not the wolf's target; confirm the Harlot survives.
- **Harlot survives when guard protects wolf target**: Harlot visits wolf's target but the Guard protected that target; confirm both the target and the Harlot survive.
- **dayVoteResolved flow**: After a day vote resolves (or abstain), and all actions complete (hunter shots, mayor succession), confirm the host sees 'Proceed to Night' button. Verify the button only appears after all pending actions are finished and that clicking it transitions to night.
- **Win condition - strict majority**: Configure 3 wolves vs 2 villagers and verify the game ends immediately with wolves winning (even if there's a mayor alive).
- **Win condition - parity with mayor**: Configure 2 wolves vs 2 villagers with a mayor alive (and no witch with both potions) and verify the game continues (mayor's tie-breaking power keeps village in the game).
- **Win condition - parity without abilities**: Configure 2 wolves vs 2 villagers with no hunter, no pending mayor selection, no mayor, and no witch with both potions, and verify the game ends with wolves winning.
- **Seer result overlay**: After the Seer submits an inspection, verify a full-screen overlay appears showing the inspected player's name and alignment ("Werewolf" in red, or "Not Werewolf" in green). Confirm the night phase does NOT advance to the witch step until the Seer clicks "Got it!" (or taps the backdrop). After dismissal, verify the result is also stored in the role card ("Last vision: …"). Also test: if the Seer disconnects while the overlay is open, the phase auto-advances after the grace period.
- **Seer and Witch private info**: Confirm Seer sees the last inspection result only on their device and Witch sees the wolves' target before acting.
- **Voting UI**: Ensure vote submit is disabled until a selection is made; choose Abstain explicitly; test majority abstain -> no elimination; with four alive, verify a 2-1-1 result (one abstention) eliminates the 2-vote leader.
- **Lobby validation**: Attempt to start with fewer than 5 players; ensure the backend rejects the start and displays an error alert. Also test too many roles vs player count. Also disconnect a player (close their tab), wait past the 5-second grace period, and confirm the host cannot start (the Start button is disabled and a yellow warning shows the disconnected count). Kick the disconnected player from the lobby and confirm the host can start again. (Lobby kicks are reversible: the kicked player can rejoin via the room code before the game starts.)
- **Disconnect / reconnect**: Join from a browser, disconnect (close tab), reopen and resume via stored session to confirm state restores (including role, death state, and pending prompts like Hunter shot).
- **Player leaves mid-game**: Have a player leave (not just disconnect) during various phases: (a) during wolf vote — ensure remaining wolves' votes still resolve, (b) during day vote — ensure remaining votes still resolve, (c) when the departed player is the active night-action role (Seer/Witch/Guard/Harlot) — ensure the night step advances, (d) when the departed player had pending hunter shot or mayor succession — ensure those prompts clear and the game continues.
- **Stale votes after leave**: Have a player leave who was the target of wolf or day votes; confirm those votes are cleaned up and don't cause resolution errors.
- **Host handoff / reclaim**: Disconnect the host, confirm another connected player becomes Host and can use host actions; reconnect the original host and verify the Host label returns to them.
- **Endgame reveal**: When a team wins, ensure all roles reveal in the player list and that win condition matches expectations (wolves parity, all wolves dead, or Joker instant win).
- **Dead-player role labels**: During an ongoing game, confirm each dead player's role appears as a blue role tag on the player card for all other players, while living players' roles remain hidden.
- **Narrator audio toggle**: On mobile Safari/Chrome, tap "Narrator: Off" to enable sound and confirm audio unlock succeeds. Run a complete day/night cycle and verify `dayToNight` is followed by the actionable role cue without `night_transition`; verify the morning plays only `day`, without `night_resolve` or `nightToDay` narration. Rapidly change two states while the first clip is loading and verify only the newest cue plays.
- **Narrator default state**: Reload or join a new room and confirm the narrator resets to Off.

## Admin Console

- **Admin token prompt**: Open `/?admin=1` with no stored token; confirm the token prompt is shown and the room list is NOT visible. Enter a wrong token and confirm the list still does not appear (connection rejected, prompt re-shown).
- **Admin room list**: With `WEREWOLVES_ADMIN_TOKEN` set, enter the correct token and confirm active rooms appear with code, player count (connected/total), phase, day count, and host name. Empty state shows "No active rooms."
- **Admin drill-in + kick**: Open a room detail; confirm the full player list renders (names, host/dead/disconnected tags, per-player Kick button). Kick a target and confirm the player is removed and the list player count drops. Verify the admin can kick in any phase (lobby, night, day) and can even remove the last remaining player.
- **Admin observer view**: Click "Join as Observer"; confirm a live, read-only room view appears. Verify roles are hidden (no role column), private state (seer result, witch potions, wolf peers/votes, guard/harlot targets, lover names) is not shown, but public state (phase, day count, players alive/dead/connected, logs, winner) is visible. "Leave observer view" returns to the list.
- **Admin cannot act without token**: With no token configured server-side, confirm admin events respond with `server.errors.adminRequired` and do not mutate state.
- **Admin close session**: From a room detail view, click the red "Close Session" button, confirm the dialog, and verify the room is deleted: connected players are sent back to the landing screen (`roomClosed`), admin observers of that room are returned to the room list, and the room disappears from the list on refresh. Verify it works in any phase.
- **Empty room cleanup**: As admin, kick every player in a room (including the host). Confirm the room disappears from the admin list immediately (the room is torn down when it becomes empty). Separately, confirm a brand-new empty room is also reaped by the hourly idle cleanup.

## Host Mid-Game Kick

- **Host side panel visibility**: As the host, confirm the collapsible host control panel appears only outside the lobby phase (in the lobby, the existing PlayersPanel kick UI is used instead). Regular players never see the panel.
- **Host mid-game kick**: During night or day, open the side panel and kick a player; confirm the target is removed, the remaining players update, and a success notification appears. Verify the kick works in any phase.
- **Host mid-game kick token flow**: Clear the stored admin token, then attempt a mid-game kick as host; confirm the prompt to open the admin page appears. Open the admin page, enter the token, return to the game, and confirm the kick now succeeds. With an invalid stored token, confirm an "Invalid admin token" notification is shown.

## Narrator Audio Assets

Bundled MP3 narrator clips live in `ui-vue/src/assets/audio/{en,de}/` with
matching filenames (for example, `night_wolves.mp3` or `dayToNight.mp3`). Vite
packages them automatically. `ui-vue/public/audio/` is only for optional runtime
custom overrides. Resolution falls back from the active locale to English and
finally to a silent placeholder if neither locale contains the requested cue.

**Audio Variants** (optional): The narrator supports multiple audio variants per clip for variety in `ui-vue/public/audio/custom/`. Name files as `custom/{key}_1.mp3`, `custom/{key}_2.mp3`, etc. The system auto-detects custom variants (up to 10) and randomly selects one each time. See `ui-vue/public/audio/README.md` for details.

Expected narrator keys:

- `lobby.mp3` (also used for the initial audio unlock)
- `roleReveal.mp3`
- `postReveal.mp3`
- `mayor.mp3`
- `armor.mp3`
- `postArmor.mp3`
- `night.mp3`
- `night_wolves.mp3`
- `night_seer.mp3`
- `night_witch.mp3`
- `night_guard.mp3`
- `night_harlot.mp3`
- `day.mp3`
- `dayToNight.mp3`
- `ended.mp3`

See `ui-vue/public/audio/README.md` for per-file meanings and timing.
