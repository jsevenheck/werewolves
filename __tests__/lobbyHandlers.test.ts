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

describe('lobby handlers', () => {
  const buildDom = () => {
    document.body.innerHTML = `
      <form id="role-config">
        <label><input type="number" class="role-input" data-role="werewolf" value="2" /></label>
        <label><input type="number" class="role-input" data-role="seer" value="1" /></label>
        <label><input type="number" class="role-input" data-role="hunter" value="1" /></label>
        <label><input type="number" class="role-input" data-role="witch" value="1" /></label>
        <label><input type="number" class="role-input" data-role="armor" value="1" /></label>
        <label><input type="number" class="role-input" data-role="joker" value="0" /></label>
        <label><input type="number" id="min-players" value="5" /></label>
      </form>
      <button id="start-game" type="button">Start Game</button>
    `;
  };

  test('change emits updateRoleConfig immediately', () => {
    buildDom();
    mockState.room = {
      code: 'ABCD',
      phase: 'lobby',
      phaseStep: null,
      dayCount: 0,
      players: [],
      hostId: 'host',
      minPlayers: 5,
      roleConfig: { werewolf: 2, seer: 1, hunter: 1, witch: 1, armor: 1, joker: 0 },
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
    const minPlayersInput = document.querySelector('#min-players') as HTMLInputElement;
    werewolfInput.value = '1';
    minPlayersInput.value = '3';
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
        minPlayers: 3
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
      players: [],
      hostId: 'host',
      minPlayers: 5,
      roleConfig: { werewolf: 2, seer: 1, hunter: 1, witch: 1, armor: 1, joker: 0 },
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
        minPlayers: 5
      }
    });
  });
});
