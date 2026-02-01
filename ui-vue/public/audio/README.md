# Narrator audio files

Place MP3 narrator clips in this folder using the exact filenames expected by the narrator. Each file is triggered by the game phase, phase transition, or night step as described below:

## Audio Variants

The narrator supports multiple audio variants for any clip. This allows for variety in narration so players don't hear the same audio every time.

**Naming Convention:**
- Base file: `{key}.mp3` (e.g., `day.mp3`)
- Variants: `{key}_1.mp3`, `{key}_2.mp3`, `{key}_3.mp3`, etc.

**How it works:**
1. **Auto-Discovery (Recommended):** Set the count to `-1` in `narrator.ts` (default)
   - The narrator will automatically detect all numbered variants (up to 10)
   - Just add files like `day_1.mp3`, `day_2.mp3`, etc.
   - No configuration needed!

2. **Manual Configuration:** Set a specific number in `narrator.ts`
   - Example: `['day', 3]` means exactly 3 variants
   - Files must be named `day_1.mp3`, `day_2.mp3`, `day_3.mp3`

3. **No Variants:** Set to `0` to disable variants for that key
   - Only the base file (e.g., `day.mp3`) will be used

**Example with Auto-Discovery:**
```
day_1.mp3     ← Will be auto-detected
day_2.mp3     ← Will be auto-detected  
day_3.mp3     ← Will be auto-detected
```

The narrator will randomly select one variant each time the clip is played.

## Audio Files

### lobby.mp3
Lobby phase; also used for the initial audio unlock. Max length: no fixed limit.

### roleReveal.mp3
### roleReveal.mp3
Role reveal phase while players privately view their roles. Max length: no fixed limit.

### postReveal.mp3
Transition after role reveal (e.g. "the village falls asleep") before mayor selection. Max length: 6s.

### mayor.mp3
Mayor election phase while players vote for the first Mayor. Max length: no fixed limit.

### postMayor.mp3
Transition after the Mayor election before armor or night. Max length: 5s.

### armor.mp3
Armor phase while the Armor chooses Lovers. Max length: no fixed limit.

### postArmor.mp3
Transition after Armor selection (time to check Lovers); then night_transition.mp3 plays before wolves act. Max length: 10s.

### night.mp3
Night phase fallback (usually unused because night steps play their own clips). Max length: no fixed limit.

### night_wolves.mp3
Night step: werewolves act. Max length: no fixed limit.

### night_seer.mp3
Night step: seer acts. Max length: no fixed limit.

### night_witch.mp3
Night step: witch acts. Max length: no fixed limit.

### night_guard.mp3
Night step: guard protects a player. Max length: no fixed limit.

### night_harlot.mp3
Night step: harlot chooses a player to visit. Max length: no fixed limit.

### night_transition.mp3
Night step transition between roles (role sleeps, next role wakes). Max length: 3s.
Also used after postArmor before the wolves step begins.

### night_resolve.mp3
Night resolve step: end of night actions, before the day transition. Max length: 6s.

### nightToDay.mp3
Transition from night to day (e.g. "the village wakes up"). Max length: 3s.

### day.mp3
Day phase while discussion and voting happen. Max length: no fixed limit.

### dayToNight.mp3
Transition from day to night (e.g. "night falls"). Max length: 3s.

### ended.mp3
Game over announcement. Max length: no fixed limit.

---

During development, the narrator falls back to an embedded silent clip when a file is missing.
