afterEach(() => {
  jest.useRealTimers();
});

jest.mock('nanoid', () => ({
  customAlphabet: () => () => 'mock-id'
}));
