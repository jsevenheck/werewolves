# Narrator audio files

Place MP3 narrator clips in this folder using the exact filenames expected by the narrator.
Each file is triggered by the game phase, phase transition, or night step as described below:

- lobby.mp3
  - Lobby phase; also used for the initial audio unlock. Max length: no fixed limit.
- roleReveal.mp3
  - Role reveal phase while players privately view their roles. Max length: no fixed limit.
- postReveal.mp3
  - Transition after role reveal (e.g. "the village falls asleep") before mayor selection. Max length: 6s.
- mayor.mp3
  - Mayor election phase while players vote for the first Mayor. Max length: no fixed limit.
- postMayor.mp3
  - Transition after the Mayor election before armor or night. Max length: 5s.
- armor.mp3
  - Armor phase while the Armor chooses Lovers. Max length: no fixed limit.
- postArmor.mp3
  - Transition after Armor selection (time to check Lovers); then night_transition.mp3 plays before wolves act. Max length: 10s.
- night.mp3
  - Night phase fallback (usually unused because night steps play their own clips). Max length: no fixed limit.
- night_wolves.mp3
  - Night step: werewolves act. Max length: no fixed limit.
- night_seer.mp3
  - Night step: seer acts. Max length: no fixed limit.
- night_witch.mp3
  - Night step: witch acts. Max length: no fixed limit.
- night_transition.mp3
  - Night step transition between roles (role sleeps, next role wakes). Max length: 3s.
  - Also used after postArmor before the wolves step begins.
- night_resolve.mp3
  - Night resolve step: end of night actions, before the day transition. Max length: 6s.
- nightToDay.mp3
  - Transition from night to day (e.g. "the village wakes up"). Max length: 3s.
- day.mp3
  - Day phase while discussion and voting happen. Max length: no fixed limit.
- dayToNight.mp3
  - Transition from day to night (e.g. "night falls"). Max length: 6s.
- ended.mp3
  - Game over announcement. Max length: no fixed limit.

During development, the narrator falls back to an embedded silent clip when a file is missing.
