/**
 * Global type declarations for the project.
 *
 * This file provides type declarations that are available across the entire
 * project (server, tests, etc.) without needing explicit imports.
 */

// Audio file imports (Vite handles these as asset URLs)
declare module '*.mp3' {
  const src: string;
  export default src;
}
