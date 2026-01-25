import { DEFAULT_ROLE_CONFIG, DEFAULT_PASSIVE_ROLE_CONFIG, ROLE_INFO } from '../config/constants';
import { shuffle } from '../utils/helpers';
import type { Room, RoleConfig, PassiveRoleConfig, Role } from '../../shared/types';

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

function validateCounts(room: Room): { ok: true } | { error: string } {
  const players = Object.values(room.players);
  if (players.length < room.minPlayers) {
    return { error: `Need at least ${room.minPlayers} players` };
  }
  const configured = Object.entries(room.roleConfig).reduce((sum, [, count]) => sum + count, 0);
  if (configured > players.length) {
    return { error: 'Role count exceeds players' };
  }
  if (room.roleConfig.werewolf < 1) {
    return { error: 'Need at least 1 Werewolf' };
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
    const role = deck[index];
    player.role = role;
    player.team = ROLE_INFO[role]?.team ?? 'village';
    player.ready = false;
    player.seerResult = null;
    if (role === 'werewolf') {
      player.nightAction = { vote: null };
    } else {
      player.nightAction = null;
    }
  });
}

export {
  normalizeRoleConfig,
  normalizePassiveRoleConfig,
  validateCounts,
  assignRoles
};
