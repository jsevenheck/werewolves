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
- **Joker voted out**: Configure a Joker, run a day vote that eliminates them, and verify the game ends instantly with Joker win before Lovers or Hunter effects continue.
- **Hunter dies via Lovers link**: Make Hunter a Lover partner, kill the other Lover (any method), and ensure Hunter still receives the last-shot overlay even though death came from heartbreak.
- **Werewolf & day vote ties**: Force wolf vote tie to see random target selection, and run a day vote tie to trigger revote UI; verify second tie resolves randomly among tied players.
- **Role reveal readiness**: During role reveal, each player must click Ready; host can only continue once all connected players are ready.
- **Host skip armor step**: With an unresponsive or disconnected Armor, host uses Skip armor step and the game continues into night.
- **Host skip night step**: With an unresponsive or disconnected Witch/Seer/Wolf, host uses Skip current action and the game continues normally.
- **Transition delays**: Confirm ~3s delay after each night action step, ~5s after role reveal (postReveal), ~10s after armor (postArmor) before night_transition plays, and ~6s after night_resolve before the nightToDay transition.
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
- **Win condition - parity with mayor**: Configure 2 wolves vs 2 villagers with a mayor alive and verify the game continues (mayor's tie-breaking power keeps village in the game).
- **Win condition - parity without abilities**: Configure 2 wolves vs 2 villagers with no hunter, no witch with poison, and no mayor, and verify the game ends with wolves winning.
- **Seer and Witch private info**: Confirm Seer sees the last inspection result only on their device and Witch sees the wolves' target before acting.
- **Voting UI**: Ensure vote submit is disabled until a selection is made; choose Abstain explicitly; test majority abstain -> no elimination.
- **Lobby validation**: Attempt to start with fewer than 5 players; ensure the backend rejects the start and displays an error alert. Also test too many roles vs player count.
- **Disconnect / reconnect**: Join from a browser, disconnect (close tab), reopen and resume via stored session to confirm state restores (including role, death state, and pending prompts like Hunter shot).
- **Host handoff / reclaim**: Disconnect the host, confirm another connected player becomes Host and can use host actions; reconnect the original host and verify the Host label returns to them.
- **Endgame reveal**: When a team wins, ensure all roles reveal in the player list and that win condition matches expectations (wolves parity, all wolves dead, or Joker instant win).
- **Narrator audio toggle**: On mobile Safari/Chrome, tap "Narrator: Off" to enable sound, confirm audio unlock succeeds, and verify announcements only fire on phase/step/transition changes.
- **Narrator persistence**: Reload the page and confirm the narrator toggle state persists in localStorage.

## Narrator Audio Assets

Place MP3 narrator clips in `ui-vue/public/audio/` with filenames matching the expected ones (for example, `night_wolves.mp3` or `dayToNight.mp3`) so the narrator continues to map phase changes correctly. The code falls back to an embedded silent clip when files are missing, so adding the real audio files is required for audible narration.
Expected narrator keys:
- `lobby.mp3` (also used for the initial audio unlock)
- `roleReveal.mp3`
- `armor.mp3`
- `day.mp3`
- `night.mp3`
- `ended.mp3`
- `night_wolves.mp3`
- `night_seer.mp3`
- `night_witch.mp3`
- `night_guard.mp3`
- `night_harlot.mp3`
- `night_resolve.mp3`
- `night_transition.mp3`
- `postReveal.mp3`
- `postArmor.mp3`
- `nightToDay.mp3`
- `dayToNight.mp3`

See `ui-vue/public/audio/README.md` for per-file meanings and timing.
