# Narrator audio files

**Note:** Built-in narrator clips are bundled with the app (`ui-vue/src/assets/audio/`) and work out-of-the-box. This `public/audio/` folder is kept for:

- Custom audio overrides (allows customization by replacing files in public/audio)
- Documentation reference (standard file names and descriptions)
- Backwards compatibility

For custom audio overrides, use `assetsBasePath` in the config to point to your custom audio directory.
The app defaults `assetsBasePath` to `/audio`.

---

Place MP3 narrator clips in this folder using the exact filenames expected by the narrator. Each file is triggered by the game phase, phase transition, or night step as described below:

## Audio Variants

The narrator supports multiple audio variants for any clip. This allows for variety in narration so players don't hear the same audio every time.

**Important:** Variants are only supported in the `custom/` folder. The standard audio files in the main `audio/` folder serve as fallbacks when no custom variants exist.

**Naming Convention:**

- Standard file (fallback): `audio/{key}.mp3` (e.g., `audio/day.mp3`)
- Custom variants: `audio/custom/{key}_1.mp3`, `audio/custom/{key}_2.mp3`, etc.

**How it works:**

1. **Auto-Discovery (Recommended):** Set the count to `-1` in `narrator.ts` (default)
   - The narrator automatically detects all numbered custom variants (up to 10)
   - Just add files like `custom/day_1.mp3`, `custom/day_2.mp3`, etc.
   - No configuration needed!

2. **Manual Configuration:** Set a specific number in `narrator.ts`
   - Example: `['day', 3]` means exactly 3 custom variants
   - Files must be named `custom/day_1.mp3`, `custom/day_2.mp3`, `custom/day_3.mp3`

3. **No Variants:** Set to `0` to disable variants for that key
   - Only the standard file (e.g., `day.mp3`) will be used

**Example with Auto-Discovery:**

```
audio/
  day.mp3              ← Standard AI-generated (used when no custom variants exist)
  custom/
    day_1.mp3          ← Will be auto-detected and randomly selected
    day_2.mp3          ← Will be auto-detected and randomly selected
    day_3.mp3          ← Will be auto-detected and randomly selected
```

**Priority Logic:**

1. If custom variants exist (`custom/day_1.mp3`, `custom/day_2.mp3`, ...): randomly select one
2. If no custom variants exist: use the standard file (`day.mp3`)

The narrator will randomly select one custom variant each time the clip is played. Standard files are only used when no custom variants are available.

## Custom Audio Override

You can override any AI-generated audio file with your own recordings by placing them in the `custom/` subdirectory (the app already uses `/audio` by default).

**How it works:**

1. The `custom/` folder already exists inside this `audio/` directory
2. Place your custom recordings with numbered suffixes (e.g., `custom/night_wolves_1.mp3`)
3. The narrator will automatically discover and randomly select from your custom variants
4. If no custom variants exist, it falls back to bundled audio (or standard files from `assetsBasePath` if provided)

**Priority:**

- With `assetsBasePath`: `${assetsBasePath}/custom/{key}_N.mp3` → `${assetsBasePath}/{key}.mp3` → bundled audio → silent
- Without `assetsBasePath`: bundled audio (no discovery of variants)

**Examples:**

```
audio/
  day.mp3              ← AI-generated (used when no custom variants)
  night_wolves.mp3     ← AI-generated (used when no custom variants)
  custom/
    day_1.mp3          ← Custom recording (randomly selected)
    day_2.mp3          ← Custom recording (randomly selected)
    night_wolves_1.mp3 ← Custom recording (randomly selected)
```

**Note:** The `custom/` folder is automatically ignored by git, so your personal recordings won't be committed to the repository.

## Audio Files

### lobby.mp3

Lobby phase; also used for the initial audio unlock. Max length: no fixed limit.

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

## Technical Details

**Bundled Audio (New):**

- Built-in narrator audio files are imported and bundled with the web component at build time
- Located in `ui-vue/src/assets/audio/` (source files, automatically bundled by Vite)
- Works in all environments without host-served static files
- No variants supported for bundled audio (only base clips)

**Custom Audio (Optional):**

- Requires passing `assetsBasePath` prop to GameComponent
- Supports variants via `custom/` subdirectory
- Fallback chain ensures audio always plays (custom → default override → bundled → silent)

During development, the narrator falls back to an embedded silent clip when a file is missing and bundled audio is unavailable.
