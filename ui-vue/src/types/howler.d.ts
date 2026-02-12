declare module 'howler' {
  class Howl {
    constructor(options: Record<string, unknown>);
    off(event: string): this;
    once(event: string, handler: () => void): this;
    play(): number;
    stop(): void;
    unload(): void;
    load(): this;
  }

  const Howler: {
    ctx?: {
      state?: string;
      resume?: () => Promise<void>;
    };
    mute?: (muted: boolean) => void;
    volume?: (value: number) => void;
  };

  export { Howl, Howler };
}
