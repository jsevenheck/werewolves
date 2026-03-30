import { MockHowl } from './__tests__/mocks/howler';

afterEach(() => {
  vi.useRealTimers();
});

vi.mock('nanoid', () => ({
  customAlphabet: () => () => 'mock-id',
}));

vi.mock('howler', () => ({ Howl: MockHowl }));
