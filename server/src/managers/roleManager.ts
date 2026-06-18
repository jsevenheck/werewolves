import { DEFAULT_ROLE_CONFIG, DEFAULT_PASSIVE_ROLE_CONFIG, ROLE_INFO } from '../config/constants';
import { errorResponse, shuffle } from '../utils/helpers';
import type { ErrorResponse } from '../../../core/src/events';
import type { Room, RoleConfig, PassiveRoleConfig, Role } from '../../../core/src/types';

function normalizeRoleConfig(config: Partial<RoleConfig> = {}): RoleConfig {
  const normalized: RoleConfig = { ...DEFAULT_ROLE_CONFIG };
  for (const key of Object.keys(DEFAULT_ROLE_CONFIG) as (keyof RoleConfig)[]) {
    const raw = Number(config[key]);
    normalized[key] = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_ROLE_CONFIG[key];
  }
  return normalized;
}

function normalizePassiveRoleConfig(config: Partial<PassiveRoleConfig> = {}): PassiveRoleConfig {
  const normalized: PassiveRoleConfig = { ...DEFAULT_PASSIVE_ROLE_CONFIG };
  for (const key of Object.keys(DEFAULT_PASSIVE_ROLE_CONFIG) as (keyof PassiveRoleConfig)[]) {
    const raw = config[key];
    normalized[key] = typeof raw === 'boolean' ? raw : DEFAULT_PASSIVE_ROLE_CONFIG[key];
  }
  return normalized;
}

function validateCounts(room: Room): { ok: true } | ErrorResponse {
  const players = Object.values(room.players);
  if (players.length < room.minPlayers) {
    return errorResponse(`Need at least ${room.minPlayers} players`, 'server.errors.needPlayers', {
      count: room.minPlayers,
    });
  }
  const configured = Object.entries(room.roleConfig).reduce((sum, [, count]) => sum + count, 0);
  if (configured > players.length) {
    return errorResponse('Role count exceeds players', 'server.errors.roleCountExceedsPlayers');
  }
  if (room.roleConfig.werewolf < 1) {
    return errorResponse('Need at least 1 Werewolf', 'server.errors.needWerewolf');
  }
  // Singleton roles validation (max 1)
  const singletonRoles: (keyof RoleConfig)[] = ['seer', 'witch', 'armor', 'guard', 'harlot'];
  for (const role of singletonRoles) {
    if (room.roleConfig[role] > 1) {
      const roleName = role.charAt(0).toUpperCase() + role.slice(1);
      return errorResponse(`Only 1 ${roleName} allowed`, 'server.errors.onlyOneRole', {
        role: roleName,
      });
    }
  }
  return { ok: true };
}

function assignRoles(room: Room) {
  const players = shuffle(Object.values(room.players));
  let deck: Role[] = [];
  for (const [role, count] of Object.entries(room.roleConfig) as [Role, number][]) {
    for (let i = 0; i < count; i += 1) {
      deck.push(role);
    }
  }
  while (deck.length < players.length) {
    deck.push('villager');
  }
  deck = shuffle(deck);
  players.forEach((player, index) => {
    const role = deck[index] ?? 'villager';
    player.role = role;
    player.team = ROLE_INFO[role]?.team ?? 'village';
    player.ready = false;
    player.seerResult = null;
  });
}

export { normalizeRoleConfig, normalizePassiveRoleConfig, validateCounts, assignRoles };
