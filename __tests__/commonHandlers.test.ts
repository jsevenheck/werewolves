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

let narratorEnabled = false;
let narratorUnlocked = false;

const mockNarrator = {
  isEnabled: jest.fn(() => narratorEnabled),
  isUnlocked: jest.fn(() => narratorUnlocked),
  unlock: jest.fn(),
  setEnabled: jest.fn((next: boolean) => {
    narratorEnabled = next;
  }),
  announceLatest: jest.fn()
};

const notify = jest.fn();

jest.mock('../client/src/state/gameState', () => ({
  state: mockState
}));

jest.mock('../client/src/utils/narrator', () => ({
  narrator: mockNarrator
}));

jest.mock('../client/src/utils/helpers', () => ({
  notify,
  escapeHtml: (value: string) => value
}));

import { bindCommonHandlers } from '../client/src/handlers/commonHandlers';

describe('commonHandlers narrator unlock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    narratorEnabled = false;
    narratorUnlocked = false;
    document.body.innerHTML = `
      <button id="toggle-narrator"></button>
      <button id="leave-room"></button>
    `;
  });

  test('leave-room re-enables narrator toggle during pending unlock', () => {
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
    expect(mockNarrator.setEnabled).toHaveBeenCalledTimes(1);
    expect(mockNarrator.announceLatest).not.toHaveBeenCalled();
  });

  test('clicking toggle while locked attempts unlock instead of disabling', async () => {
    narratorEnabled = true;
    narratorUnlocked = false;
    mockNarrator.unlock.mockResolvedValue(true);

    const socket = { emit: jest.fn() } as any;
    const renderApp = jest.fn();
    const renderLanding = jest.fn();
    const clearSession = jest.fn();

    bindCommonHandlers(socket, renderApp, renderLanding, clearSession);

    const toggle = document.getElementById('toggle-narrator') as HTMLButtonElement;
    toggle.click();
    await Promise.resolve();

    expect(mockNarrator.unlock).toHaveBeenCalled();
    expect(mockNarrator.setEnabled).toHaveBeenCalledWith(true);
    expect(mockNarrator.announceLatest).toHaveBeenCalled();
  });
});
