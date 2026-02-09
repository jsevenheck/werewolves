/// <reference types="vite/client" />

// Audio file imports (Vite handles these as asset URLs)
declare module '*.mp3' {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
