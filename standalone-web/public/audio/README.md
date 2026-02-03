# Audio Assets

**Note:** This standalone-web build uses `ui-vue/public/` as its publicDir (configured in `standalone-web/vite.config.ts`).

You don't need to copy or maintain files here - all audio files are served directly from `ui-vue/public/audio/`.

## Custom Audio

To add custom recordings:

1. Create `ui-vue/public/audio/custom/`
2. Place your MP3 files there with the same naming as the base files
3. The narrator will automatically prioritize custom files over AI-generated ones

See `ui-vue/public/audio/README.md` for detailed documentation on audio files and variants.
