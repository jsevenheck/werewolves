# Narrator audio files

Place MP3 narrator clips in this folder using the exact filenames expected by the narrator.
Each file is triggered by the game phase, phase transition, or night step as described below:

- lobby.mp3
  - Lobby phase; also used for the initial audio unlock.
- roleReveal.mp3
  - Role reveal phase while players privately view their roles.
- postReveal.mp3
  - Transition after role reveal (e.g. "the village falls asleep") before armor or night.
- armor.mp3
  - Armor phase while the Armor chooses Lovers.
- postArmor.mp3
  - Transition after Armor selection (time to check Lovers); then night_transition.mp3 plays before wolves act.
- night.mp3
  - Night phase fallback (usually unused because night steps play their own clips).
- night_wolves.mp3
  - Night step: werewolves act.
- night_seer.mp3
  - Night step: seer acts.
- night_witch.mp3
  - Night step: witch acts.
- night_transition.mp3
  - Night step transition between roles (role sleeps, next role wakes).
  - Also used after postArmor before the wolves step begins.
- night_resolve.mp3
  - Night resolve step: end of night actions, before the day transition.
- nightToDay.mp3
  - Transition from night to day (e.g. "the village wakes up").
- day.mp3
  - Day phase while discussion and voting happen.
- dayToNight.mp3
  - Transition from day to night (e.g. "night falls").
- ended.mp3
  - Game over announcement.

During development, the narrator falls back to an embedded silent clip when a file is missing.
