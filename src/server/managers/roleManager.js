const { DEFAULT_ROLE_CONFIG, ROLE_INFO } = require('../config/constants');
const { shuffle } = require('../utils/helpers');

function normalizeRoleConfig(config = {}) {
  const normalized = { ...DEFAULT_ROLE_CONFIG };
  for (const key of Object.keys(DEFAULT_ROLE_CONFIG)) {
    const raw = Number(config[key]);
    normalized[key] = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_ROLE_CONFIG[key];
  }
  return normalized;
}

function validateCounts(room) {
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

function assignRoles(room) {
  const players = shuffle(Object.values(room.players));
  const deck = [];
  for (const [role, count] of Object.entries(room.roleConfig)) {
    for (let i = 0; i < count; i += 1) {
      deck.push(role);
    }
  }
  while (deck.length < players.length) {
    deck.push('villager');
  }
  shuffle(deck);
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

module.exports = {
  normalizeRoleConfig,
  validateCounts,
  assignRoles
};
