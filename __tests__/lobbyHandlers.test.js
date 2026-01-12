/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

const loadModule = (filePath, context, exportNames) => {
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/^import .*?;\s*/gm, '');
  code = code.replace(/export\s*{[\s\S]*?};/m, `return { ${exportNames.join(', ')} };`);
  const argNames = Object.keys(context);
  const argValues = Object.values(context);
  const factory = new Function(...argNames, code);
  return factory(...argValues);
};

describe('lobby handlers', () => {
  const filePath = path.join(__dirname, '..', 'public', 'js', 'handlers', 'phaseHandlers.js');

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
    const state = {
      room: {
        phase: 'lobby',
        hostId: 'host',
        code: 'ABCD',
        roleConfig: { werewolf: 2, seer: 1, hunter: 1, witch: 1, armor: 1, joker: 0 }
      },
      playerId: 'host',
      updateConfigTimeoutId: null,
      readyButtonTimeoutId: null
    };
    const socket = { emit: jest.fn() };

    const { bindPhaseHandlers } = loadModule(filePath, { state, notify: () => {} }, ['bindPhaseHandlers']);
    bindPhaseHandlers(socket, jest.fn());

    const werewolfInput = document.querySelector('input[data-role="werewolf"]');
    const minPlayersInput = document.querySelector('#min-players');
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
    const state = {
      room: {
        phase: 'lobby',
        hostId: 'host',
        code: 'ABCD',
        roleConfig: { werewolf: 2, seer: 1, hunter: 1, witch: 1, armor: 1, joker: 0 }
      },
      playerId: 'host',
      updateConfigTimeoutId: null,
      readyButtonTimeoutId: null
    };
    const socket = { emit: jest.fn() };

    const { bindPhaseHandlers } = loadModule(filePath, { state, notify: () => {} }, ['bindPhaseHandlers']);
    bindPhaseHandlers(socket, jest.fn());

    const seerInput = document.querySelector('input[data-role="seer"]');
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
