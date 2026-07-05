import { DEFAULT_ROLE_CONFIG, DEFAULT_PASSIVE_ROLE_CONFIG, ROLE_INFO } from '../config/constants';
import { errorResponse, shuffle } from '../utils/helpers';
import type { ErrorResponse } from '../../../core/src/events';
import type { Room, RoleConfig, PassiveRoleConfig, Role } from '../../../core/src/types';

function normalizeRoleConfig(
  config: Partial<RoleConfig> = {},
  base: RoleConfig = DEFAULT_ROLE_CONFIG
): RoleConfig {
  const normalized: RoleConfig = { ...base };
  for (const key of Object.keys(DEFAULT_ROLE_CONFIG) as (keyof RoleConfig)[]) {
    const raw = Number(config[key]);
    normalized[key] = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : base[key];
  }
  return normalized;
}

function normalizePassiveRoleConfig(
  config: Partial<PassiveRoleConfig> = {},
  base: PassiveRoleConfig = DEFAULT_PASSIVE_ROLE_CONFIG
): PassiveRoleConfig {
  const normalized: PassiveRoleConfig = { ...base };
  for (const key of Object.keys(DEFAULT_PASSIVE_ROLE_CONFIG) as (keyof PassiveRoleConfig)[]) {
    const raw = config[key];
    normalized[key] = typeof raw === 'boolean' ? raw : base[key];
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
  // Block start while any player is disconnected. A disconnected player cannot
  // receive their role or mark ready, so starting would silently lock them
  // out. The host should either wait for them to reconnect or kick them
  // (lobby kicks are reversible — they can rejoin via the room code).
  const disconnectedCount = players.filter((p) => !p.connected).length;
  if (disconnectedCount > 0) {
    return errorResponse(
      `${disconnectedCount} player(s) are disconnected`,
      'server.errors.playersDisconnected',
      { count: disconnectedCount }
    );
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
