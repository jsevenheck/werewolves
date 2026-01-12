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

describe('frontend smoke', () => {
  test('phaseHandlers module parses and exports bindPhaseHandlers', () => {
    const filePath = path.join(__dirname, '..', 'public', 'js', 'handlers', 'phaseHandlers.js');
    const exports = loadModule(
      filePath,
      { state: {}, notify: () => {} },
      ['bindPhaseHandlers']
    );
    expect(typeof exports.bindPhaseHandlers).toBe('function');
  });

  test('renderDaySection uses pending vote fallback', () => {
    const filePath = path.join(__dirname, '..', 'public', 'js', 'renderers', 'phaseRenderers.js');
    const state = { pendingVote: 'p2', playerId: 'p1' };
    const getPlayerName = (room, id) => room.players.find((p) => p.id === id)?.name || 'Unknown';
    const exports = loadModule(
      filePath,
      { ROLE_DETAILS: {}, state, getPlayerName },
      [
        'renderLobbySection',
        'renderRoleRevealSection',
        'renderArmorSection',
        'renderNightSection',
        'renderDaySection',
        'renderRoleRevealList'
      ]
    );

    const room = {
      dayCount: 1,
      lastNightDeaths: [],
      voteState: { yourVote: undefined, submitted: 0, required: 2, revoteFromTie: null },
      players: [
        { id: 'p1', name: 'Alice', alive: true },
        { id: 'p2', name: 'Bob', alive: true }
      ]
    };

    const html = exports.renderDaySection(room, { alive: true });
    expect(html).toContain('Vote submitted');
    expect(html).toContain('Bob');
  });
});
