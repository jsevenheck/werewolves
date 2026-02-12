import { MockHowl, MockHowler, resetMockHowler } from './__tests__/mocks/howler';

afterEach(() => {
  jest.useRealTimers();
  resetMockHowler();
});

jest.mock('nanoid', () => ({
  customAlphabet: () => () => 'mock-id',
}));

jest.mock('howler', () => ({ Howl: MockHowl, Howler: MockHowler }), { virtual: true });
