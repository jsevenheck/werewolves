# Audio files for narrator feature (Custom Audio Only)

**Note:** Built-in narrator audio is now bundled with the web component. This folder is only needed for **custom audio overrides**.

## Custom Audio

To use custom narrator audio in standalone mode:

1. Place your custom MP3 files in the `custom/` subdirectory
2. Update `standalone-web/src/main.ts` to pass `assetsBasePath: '/audio'`
3. Follow the naming convention: `custom/day_1.mp3`, `custom/night_wolves_1.mp3`, etc.

See `ui-vue/public/audio/README.md` for full documentation on custom audio and file naming conventions.

## Default Behavior

By default, standalone mode uses **bundled audio** (no setup required). This folder is kept for users who want to override the built-in narrator clips with custom recordings.
