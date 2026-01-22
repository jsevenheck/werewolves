/** @jest-environment jsdom */

const mockState = {
  room: null,
  roomCode: 'ABCD',
  playerId: 'p1',
  playerName: 'Alice',
  hunterPrompt: true,
  pendingVote: 'p2',
  pendingWolfVote: 'p3',
  roleVisible: true
};

const mockNarrator = {
  isEnabled: jest.fn(),
  unlock: jest.fn(),
  setEnabled: jest.fn()
};

const notify = jest.fn();

jest.mock('../client/src/state/gameState', () => ({
  state: mockState
}));

jest.mock('../client/src/utils/narrator', () => ({
  narrator: mockNarrator
}));

jest.mock('../client/src/utils/helpers', () => ({
  notify
}));

import { bindCommonHandlers } from '../client/src/handlers/commonHandlers';

describe('commonHandlers narrator unlock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = `
      <button id="toggle-narrator"></button>
      <button id="leave-room"></button>
    `;
  });

  test('leave-room re-enables narrator toggle during pending unlock', () => {
    mockNarrator.isEnabled.mockReturnValue(false);
    mockNarrator.unlock.mockReturnValue(new Promise<boolean>(() => {}));

    const socket = { emit: jest.fn() } as any;
    const renderApp = jest.fn();
    const renderLanding = jest.fn();
    const clearSession = jest.fn();

    bindCommonHandlers(socket, renderApp, renderLanding, clearSession);

    const toggle = document.getElementById('toggle-narrator') as HTMLButtonElement;
    const leave = document.getElementById('leave-room') as HTMLButtonElement;

    toggle.click();
    expect(toggle.disabled).toBe(true);

    leave.click();
    expect(toggle.disabled).toBe(false);
  });

  test('ignores stale unlock completion after leaving room', async () => {
    mockNarrator.isEnabled.mockReturnValue(false);
    let resolveUnlock: (value: boolean) => void = () => {};
    mockNarrator.unlock.mockImplementation(
      () => new Promise<boolean>((resolve) => {
        resolveUnlock = resolve;
      })
    );

    const socket = { emit: jest.fn() } as any;
    const renderApp = jest.fn();
    const renderLanding = jest.fn();
    const clearSession = jest.fn();

    bindCommonHandlers(socket, renderApp, renderLanding, clearSession);

    const toggle = document.getElementById('toggle-narrator') as HTMLButtonElement;
    const leave = document.getElementById('leave-room') as HTMLButtonElement;

    toggle.click();
    leave.click();
    resolveUnlock(true);
    await Promise.resolve();

    expect(toggle.disabled).toBe(false);
    expect(mockNarrator.setEnabled).not.toHaveBeenCalled();
  });
});
