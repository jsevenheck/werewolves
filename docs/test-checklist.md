## Manual Test Checklist

- **Armor assignment & lover notification**: Host starts a game where Armor is alive; confirm Armor screen appears once, picks two players, and both see Lover name in their role card while everyone else sees a waiting message.
- **Lovers death link**: Create Lovers pair, then (a) vote one Lover out, (b) kill one at night via Werewolves or Witch poison, and (c) let Hunter shoot one; each time ensure the partner dies immediately with "died of heartbreak" log and that chained deaths still trigger Hunter/Joker logic correctly.
- **Event log visibility**: While alive, verify logs and night report show victim + role but do not reveal the killer. After death, confirm full log details are visible.
- **Joker voted out**: Configure a Joker, run a day vote that eliminates them, and verify the game ends instantly with Joker win before Lovers or Hunter effects continue.
- **Hunter dies via Lovers link**: Make Hunter a Lover partner, kill the other Lover (any method), and ensure Hunter still receives the last-shot overlay even though death came from heartbreak.
- **Werewolf & day vote ties**: Force wolf vote tie to see random target selection, and run a day vote tie to trigger revote UI; verify second tie resolves randomly among tied players.
- **Role reveal readiness**: During role reveal, each player must click Ready; host can only continue once all connected players are ready.
- **Host skip armor step**: With an unresponsive or disconnected Armor, host uses Skip armor step and the game continues into night.
- **Host skip night step**: With an unresponsive or disconnected Witch/Seer/Wolf, host uses Skip current action and the game continues normally.
- **Transition delays**: Confirm ~3s delay after each night action, and after phase changes (role reveal -> armor/night, armor -> night, night -> day, day -> night).
- **Witch potion tracking**: Use heal potion once to prevent the wolf kill, confirm potion becomes unavailable later, then poison a target on another night and ensure dead count + Lovers link apply before win checks.
- **Seer and Witch private info**: Confirm Seer sees the last inspection result only on their device and Witch sees the wolves' target before acting.
- **Voting UI**: Ensure vote submit is disabled until a selection is made; choose Abstain explicitly; test majority abstain -> no elimination.
- **Lobby validation**: Adjust minimum players and attempt to start below it; ensure the backend rejects the start and displays an error alert. Also test too many roles vs player count.
- **Disconnect / reconnect**: Join from a browser, disconnect (close tab), reopen and resume via stored session to confirm state restores (including role, death state, and pending prompts like Hunter shot).
- **Host handoff / reclaim**: Disconnect the host, confirm another connected player becomes Host and can use host actions; reconnect the original host and verify the Host label returns to them.
- **Endgame reveal**: When a team wins, ensure all roles reveal in the player list and that win condition matches expectations (wolves parity, all wolves dead, or Joker instant win).
- **Narrator audio toggle**: On mobile Safari/Chrome, tap "Narrator: Off" to enable sound, confirm audio unlock succeeds, and verify announcements only fire on phase/step/transition changes.
- **Narrator persistence**: Reload the page and confirm the narrator toggle state persists in localStorage.

## Narrator Audio Assets

Place MP3 narrator clips in `client/public/audio/` with filenames matching the expected ones (for example, `night_wolves.mp3` or `dayToNight.mp3`) so the narrator continues to map phase changes correctly. The code falls back to an embedded silent clip when files are missing, so adding the real audio files is required for audible narration.
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
- `night_resolve.mp3`
- `night_transition.mp3`
- `postReveal.mp3`
- `postArmor.mp3`
- `nightToDay.mp3`
- `dayToNight.mp3`
