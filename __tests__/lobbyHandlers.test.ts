/**
 * @jest-environment jsdom
 */

import type { RoomView } from '../src/shared/types';

const mockState = {
  room: null as RoomView | null,
  playerId: '',
  updateConfigTimeoutId: null as number | null,
  readyButtonTimeoutId: null as number | null,
  pendingVote: undefined as string | null | undefined
};

jest.mock('../client/src/state/gameState', () => ({
  state: mockState
}));

jest.mock('../client/src/utils/helpers', () => ({
  notify: jest.fn()
}));

import { bindPhaseHandlers } from '../client/src/handlers/phaseHandlers';
import { notify } from '../client/src/utils/helpers';

describe('lobby handlers', () => {
  const makePlayers = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      alive: true,
      connected: true,
      isHost: i === 0,
      role: null
    }));

  const buildDom = () => {
    document.body.innerHTML = `
      <form id="role-config">
        <label><input type="number" class="role-input" data-role="werewolf" value="2" /></label>
        <label><input type="number" class="role-input" data-role="seer" value="1" /></label>
        <label><input type="number" class="role-input" data-role="hunter" value="1" /></label>
        <label><input type="number" class="role-input" data-role="witch" value="1" /></label>
        <label><input type="number" class="role-input" data-role="armor" value="1" /></label>
        <label><input type="number" class="role-input" data-role="joker" value="0" /></label>
        <label><input type="checkbox" class="passive-role-input" data-passive-role="mayor" checked /></label>
      </form>
      <button id="start-game" type="button">Start Game</button>
    `;
  };

  afterEach(() => {
    mockState.room = null;
    mockState.playerId = '';
    (notify as jest.Mock).mockClear();
    jest.clearAllTimers();
  });

  test('change emits updateRoleConfig immediately', () => {
    buildDom();
    mockState.room = {
      code: 'ABCD',
      phase: 'lobby',
      phaseStep: null,
      dayCount: 0,
      players: makePlayers(5),
      hostId: 'host',
      minPlayers: 5,
      roleConfig: { werewolf: 2, seer: 1, hunter: 1, witch: 1, armor: 1, joker: 0, guard: 0 },
      passiveRoleConfig: { mayor: true },
      mayorId: null,
      awaitingMayorSelection: false,
      mayorSelectionPending: false,
      loversKnown: false,
      loversAssigned: false,
      loverName: null,
      witchState: { healAvailable: null, poisonAvailable: null },
      wolfVotes: null,
      wolfTarget: null,
      wolfPeers: [],
      guardedTarget: null,
      lastGuardedTarget: null,
      nextNightStep: null,
      phaseTransition: null,
      seerResult: null,
      voteState: { yourVote: undefined, submitted: 0, required: 0, revoteFromTie: null },
      lastNightDeaths: [],
      lastDayDeaths: [],
      lastDayMessage: null,
      awaitingHunterShot: false,
      hunterShotPending: false,
      winner: null,
      logs: [],
      self: null
    };
    mockState.playerId = 'host';
    const socket = { emit: jest.fn() };

    bindPhaseHandlers(socket as never, jest.fn());

    const werewolfInput = document.querySelector('input[data-role="werewolf"]') as HTMLInputElement;
    werewolfInput.value = '1';
    werewolfInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(socket.emit).toHaveBeenCalledWith('updateRoleConfig', {
      roomCode: 'ABCD',
      playerId: 'host',
      config: {
        werewolf: 1,
        seer: 1,
        hunter: 1,
        witch: 1,
        armor: 1,
        joker: 0,
        passiveRoles: { mayor: true }
      }
    });
  });

  test('input emits updateRoleConfig after debounce', () => {
    jest.useFakeTimers();
    buildDom();
    mockState.room = {
      code: 'ABCD',
      phase: 'lobby',
      phaseStep: null,
      dayCount: 0,
      players: makePlayers(5),
      hostId: 'host',
      minPlayers: 5,
      roleConfig: { werewolf: 2, seer: 1, hunter: 1, witch: 1, armor: 1, joker: 0, guard: 0 },
      passiveRoleConfig: { mayor: true },
      mayorId: null,
      awaitingMayorSelection: false,
      mayorSelectionPending: false,
      loversKnown: false,
      loversAssigned: false,
      loverName: null,
      witchState: { healAvailable: null, poisonAvailable: null },
      wolfVotes: null,
      wolfTarget: null,
      wolfPeers: [],
      guardedTarget: null,
      lastGuardedTarget: null,
      nextNightStep: null,
      phaseTransition: null,
      seerResult: null,
      voteState: { yourVote: undefined, submitted: 0, required: 0, revoteFromTie: null },
      lastNightDeaths: [],
      lastDayDeaths: [],
      lastDayMessage: null,
      awaitingHunterShot: false,
      hunterShotPending: false,
      winner: null,
      logs: [],
      self: null
    };
    mockState.playerId = 'host';
    const socket = { emit: jest.fn() };

    bindPhaseHandlers(socket as never, jest.fn());

    const seerInput = document.querySelector('input[data-role="seer"]') as HTMLInputElement;
    seerInput.value = '0';
    seerInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(socket.emit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(400);

    expect(socket.emit).toHaveBeenCalledWith('updateRoleConfig', {
      roomCode: 'ABCD',
      playerId: 'host',
      config: {
        werewolf: 2,
        seer: 0,
        hunter: 1,
        witch: 1,
        armor: 1,
        joker: 0,
        passiveRoles: { mayor: true }
      }
    });
  });

  test('start game precheck shows cap error before total-count error', () => {
    buildDom();
    mockState.room = {
      code: 'ABCD',
      phase: 'lobby',
      phaseStep: null,
      dayCount: 0,
      players: makePlayers(5),
      hostId: 'host',
      minPlayers: 5,
      roleConfig: { werewolf: 5, seer: 2, hunter: 0, witch: 0, armor: 0, joker: 0, guard: 0 },
      passiveRoleConfig: { mayor: true },
      mayorId: null,
      awaitingMayorSelection: false,
      mayorSelectionPending: false,
      loversKnown: false,
      loversAssigned: false,
      loverName: null,
      witchState: { healAvailable: null, poisonAvailable: null },
      wolfVotes: null,
      wolfTarget: null,
      wolfPeers: [],
      guardedTarget: null,
      lastGuardedTarget: null,
      nextNightStep: null,
      phaseTransition: null,
      seerResult: null,
      voteState: { yourVote: undefined, submitted: 0, required: 0, revoteFromTie: null },
      lastNightDeaths: [],
      lastDayDeaths: [],
      lastDayMessage: null,
      awaitingHunterShot: false,
      hunterShotPending: false,
      winner: null,
      logs: [],
      self: null
    };
    mockState.playerId = 'host';
    const socket = { emit: jest.fn() };

    bindPhaseHandlers(socket as never, jest.fn());

    document.getElementById('start-game')?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(notify).toHaveBeenCalledWith('Only 1 Seer is supported');
    expect(socket.emit).not.toHaveBeenCalledWith('startGame', expect.anything());
  });

  test('start game precheck shows total-count error when caps are valid', () => {
    buildDom();
    mockState.room = {
      code: 'ABCD',
      phase: 'lobby',
      phaseStep: null,
      dayCount: 0,
      players: makePlayers(5),
      hostId: 'host',
      minPlayers: 5,
      roleConfig: { werewolf: 6, seer: 1, hunter: 0, witch: 0, armor: 0, joker: 0, guard: 0 },
      passiveRoleConfig: { mayor: true },
      mayorId: null,
      awaitingMayorSelection: false,
      mayorSelectionPending: false,
      loversKnown: false,
      loversAssigned: false,
      loverName: null,
      witchState: { healAvailable: null, poisonAvailable: null },
      wolfVotes: null,
      wolfTarget: null,
      wolfPeers: [],
      guardedTarget: null,
      lastGuardedTarget: null,
      nextNightStep: null,
      phaseTransition: null,
      seerResult: null,
      voteState: { yourVote: undefined, submitted: 0, required: 0, revoteFromTie: null },
      lastNightDeaths: [],
      lastDayDeaths: [],
      lastDayMessage: null,
      awaitingHunterShot: false,
      hunterShotPending: false,
      winner: null,
      logs: [],
      self: null
    };
    mockState.playerId = 'host';
    const socket = { emit: jest.fn() };

    bindPhaseHandlers(socket as never, jest.fn());

    document.getElementById('start-game')?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(notify).toHaveBeenCalledWith('Role count exceeds players');
    expect(socket.emit).not.toHaveBeenCalledWith('startGame', expect.anything());
  });
});
