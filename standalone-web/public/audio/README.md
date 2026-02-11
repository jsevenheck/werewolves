# Audio files for narrator feature (Custom Audio Only)

**Note:** Built-in narrator audio is now bundled with the web component. This folder is only needed for **custom audio overrides**.

## Custom Audio

To use custom narrator audio in standalone mode:

1. Place your custom MP3 files in the `custom/` subdirectory
2. Follow the naming convention: `custom/day_1.mp3`, `custom/night_wolves_1.mp3`, etc.
3. Optionally add default overrides in this folder as `audio/day.mp3`, `audio/night.mp3`, etc.

See `ui-vue/public/audio/README.md` for full documentation on custom audio and file naming conventions.

## Default Behavior

Standalone wrapper (`standalone-web/src/main.ts`) uses `assetsBasePath: '/audio'` by default.
Runtime fallback chain:

1. `/audio/custom/<key>_N.mp3`
2. `/audio/<key>.mp3`
3. Bundled audio
4. Silent fallback

If no files are present in `/audio`, narrator still works via bundled clips.
