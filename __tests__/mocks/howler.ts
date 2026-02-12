type HowlEvent = 'play' | 'playerror' | 'load' | 'loaderror';

class MockHowl {
  static instances: MockHowl[] = [];

  static reset() {
    MockHowl.instances = [];
  }

  readonly options: Record<string, unknown>;
  private readonly handlers = new Map<HowlEvent, Array<() => void>>();
  off = jest.fn((_event: HowlEvent) => this);
  play = jest.fn(() => 1);
  stop = jest.fn();
  unload = jest.fn();
  load = jest.fn(() => this);

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

const MockHowler = {
  ctx: {
    state: 'running',
    resume: jest.fn(async () => {}),
  },
  mute: jest.fn(),
  volume: jest.fn(),
};

function resetMockHowler() {
  MockHowler.ctx.state = 'running';
  MockHowler.ctx.resume.mockReset();
  MockHowler.ctx.resume.mockImplementation(async () => {});
  MockHowler.mute.mockReset();
  MockHowler.volume.mockReset();
}

export { MockHowl, MockHowler, resetMockHowler };
