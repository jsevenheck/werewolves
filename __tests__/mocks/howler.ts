import { vi } from 'vitest';

type HowlEvent = 'play' | 'playerror' | 'load' | 'loaderror' | 'end';

class MockHowl {
  static instances: MockHowl[] = [];

  static reset() {
    MockHowl.instances = [];
  }

  readonly options: Record<string, unknown>;
  private readonly handlers = new Map<HowlEvent, Array<() => void>>();
  off = vi.fn((_event: HowlEvent) => this);
  play = vi.fn(() => 1);
  stop = vi.fn();
  unload = vi.fn();
  load = vi.fn(() => this);

  constructor(options: Record<string, unknown>) {
    this.options = options;
    MockHowl.instances.push(this);
  }

  once(event: HowlEvent, handler: () => void) {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, [...existing, handler]);
    return this;
  }

  trigger(event: HowlEvent) {
    const handlers = this.handlers.get(event) ?? [];
    this.handlers.delete(event);
    handlers.forEach((handler) => handler());
  }
}

export { MockHowl };
