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

  export { Howl };
}
