import { MockHowl } from './__tests__/mocks/howler';

afterEach(() => {
  jest.useRealTimers();
});

jest.mock('nanoid', () => ({
  customAlphabet: () => () => 'mock-id'
}));

jest.mock('howler', () => ({ Howl: MockHowl }), { virtual: true });
