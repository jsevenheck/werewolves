jest.mock('../src/server/utils/helpers', () => ({
  ...jest.requireActual('../src/server/utils/helpers'),
  shuffle: (arr) => arr
}));

const { DEFAULT_ROLE_CONFIG, ROLE_INFO } = require('../src/server/config/constants');
const { normalizeRoleConfig, validateCounts, assignRoles } = require('../src/server/managers/roleManager');

const makePlayers = (count) => {
  const players = {};
  for (let i = 0; i < count; i += 1) {
    const id = `p${i + 1}`;
    players[id] = { id, name: `Player ${i + 1}` };
  }
  return players;
};

describe('roleManager', () => {
  test('normalizeRoleConfig clamps invalid inputs to defaults', () => {
    const normalized = normalizeRoleConfig({ werewolf: '3', seer: -1, armor: 2.9, joker: '0' });
    expect(normalized).toEqual({
      ...DEFAULT_ROLE_CONFIG,
      werewolf: 3,
      armor: 2,
      joker: 0
    });
  });

  test('validateCounts enforces minimum players and role totals', () => {
    const tooFew = {
      players: makePlayers(4),
      minPlayers: 5,
      roleConfig: DEFAULT_ROLE_CONFIG
    };
    expect(validateCounts(tooFew)).toEqual({ error: 'Need at least 5 players' });

    const tooManyRoles = {
      players: makePlayers(3),
      minPlayers: 3,
      roleConfig: { ...DEFAULT_ROLE_CONFIG, werewolf: 3, seer: 1 }
    };
    expect(validateCounts(tooManyRoles)).toEqual({ error: 'Role count exceeds players' });

    const noWolves = {
      players: makePlayers(5),
      minPlayers: 3,
      roleConfig: { ...DEFAULT_ROLE_CONFIG, werewolf: 0 }
    };
    expect(validateCounts(noWolves)).toEqual({ error: 'Need at least 1 Werewolf' });
  });

  test('assignRoles sets roles, teams, and night actions', () => {
    const room = {
      players: makePlayers(3),
      roleConfig: { werewolf: 1, seer: 1, hunter: 0, witch: 0, armor: 0, joker: 0 }
    };
    assignRoles(room);
    const assigned = Object.values(room.players);
    expect(assigned[0].role).toBe('werewolf');
    expect(assigned[0].team).toBe(ROLE_INFO.werewolf.team);
    expect(assigned[0].nightAction).toEqual({ vote: null });
    expect(assigned[1].role).toBe('seer');
    expect(assigned[1].team).toBe(ROLE_INFO.seer.team);
    expect(assigned[1].nightAction).toBeNull();
    expect(assigned[2].role).toBe('villager');
    expect(assigned[2].team).toBe(ROLE_INFO.villager.team);
    assigned.forEach((player) => {
      expect(player.ready).toBe(false);
      expect(player.seerResult).toBeNull();
    });
  });
});
