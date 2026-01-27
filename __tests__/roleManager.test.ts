import { DEFAULT_ROLE_CONFIG, ROLE_INFO } from '../src/server/config/constants';
import { normalizeRoleConfig, validateCounts, assignRoles } from '../src/server/managers/roleManager';
import type { Player, Room, RoleConfig } from '../src/shared/types';

jest.mock('../src/server/utils/helpers', () => ({
  ...jest.requireActual('../src/server/utils/helpers'),
  shuffle: (arr: unknown[]) => arr
}));

const makePlayers = (count: number): Record<string, Player> => {
  const players: Record<string, Player> = {};
  for (let i = 0; i < count; i += 1) {
    const id = `p${i + 1}`;
    players[id] = {
      id,
      name: `Player ${i + 1}`,
      role: null,
      team: null,
      alive: true,
      connected: true,
      socketId: null,
      resumeToken: 'token',
      isHost: false,
      voteTarget: null,
      nightAction: null,
      ready: false,
      seerResult: null
    };
  }
  return players;
};

describe('roleManager', () => {
  test('normalizeRoleConfig clamps invalid inputs to defaults', () => {
    const normalized = normalizeRoleConfig({ werewolf: '3' as unknown as number, seer: -1, armor: 2.9, joker: '0' as unknown as number });
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
    } as Room;
    expect(validateCounts(tooFew)).toEqual({ error: 'Need at least 5 players' });

    const tooManyRoles = {
      players: makePlayers(5),
      minPlayers: 5,
      roleConfig: { ...DEFAULT_ROLE_CONFIG, werewolf: 3, seer: 2 }
    } as Room;
    expect(validateCounts(tooManyRoles)).toEqual({ error: 'Role count exceeds players' });

    const noWolves = {
      players: makePlayers(5),
      minPlayers: 5,
      roleConfig: { ...DEFAULT_ROLE_CONFIG, werewolf: 0 }
    } as Room;
    expect(validateCounts(noWolves)).toEqual({ error: 'Need at least 1 Werewolf' });

    const tooManyGuards = {
      players: makePlayers(5),
      minPlayers: 5,
      roleConfig: { werewolf: 1, seer: 0, hunter: 0, witch: 0, armor: 0, joker: 0, guard: 2 }
    } as Room;
    expect(validateCounts(tooManyGuards)).toEqual({ error: 'Only 1 Guard is supported' });
  });

  test('assignRoles sets roles, teams, and night actions', () => {
    const room = {
      players: makePlayers(3),
      roleConfig: { werewolf: 1, seer: 1, hunter: 0, witch: 0, armor: 0, joker: 0, guard: 0 } as RoleConfig
    } as Room;
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
