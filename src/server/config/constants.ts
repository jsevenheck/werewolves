import { customAlphabet } from 'nanoid';
import type { Role, RoleConfig, PassiveRoleConfig, Team } from '../../shared/types';
import {
  NIGHT_DELAY_MS as BASE_NIGHT_DELAY_MS,
  PHASE_DELAY_MS as BASE_PHASE_DELAY_MS,
  POST_REVEAL_DELAY_MS as BASE_POST_REVEAL_DELAY_MS,
  POST_MAYOR_DELAY_MS as BASE_POST_MAYOR_DELAY_MS,
  POST_ARMOR_DELAY_MS as BASE_POST_ARMOR_DELAY_MS,
  NIGHT_RESOLVE_DELAY_MS as BASE_NIGHT_RESOLVE_DELAY_MS,
  MIN_PLAYERS as BASE_MIN_PLAYERS
} from '../../shared/constants';

const PORT = process.env.PORT ?? 3001;
const IS_E2E = process.env.E2E_TESTS === '1';
const NIGHT_DELAY_MS = IS_E2E ? 0 : BASE_NIGHT_DELAY_MS;
const PHASE_DELAY_MS = IS_E2E ? 0 : BASE_PHASE_DELAY_MS;
const POST_REVEAL_DELAY_MS = IS_E2E ? 0 : BASE_POST_REVEAL_DELAY_MS;
const POST_MAYOR_DELAY_MS = IS_E2E ? 0 : BASE_POST_MAYOR_DELAY_MS;
const POST_ARMOR_DELAY_MS = IS_E2E ? 0 : BASE_POST_ARMOR_DELAY_MS;
const NIGHT_RESOLVE_DELAY_MS = IS_E2E ? 0 : BASE_NIGHT_RESOLVE_DELAY_MS;
const MIN_PLAYERS = BASE_MIN_PLAYERS;
const ROOM_CODE = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);
const PLAYER_ID = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);
const RESUME_TOKEN = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24);

type RoleInfo = Record<Role, { label: string; team: Team; description: string }>;

const ROLE_INFO: RoleInfo = {
  werewolf: {
    label: 'Werewolf',
    team: 'wolves',
    description: 'Work with other wolves to eliminate the village. At night vote on a target to devour.'
  },
  seer: {
    label: 'Seer',
    team: 'village',
    description: 'Each night inspect one player to learn if they are a Werewolf.'
  },
  hunter: {
    label: 'Hunter',
    team: 'village',
    description: 'If you die, instantly shoot one player to take down with you.'
  },
  witch: {
    label: 'Witch',
    team: 'village',
    description: 'You have one heal potion and one poison potion for the whole game. You may use both in the same night.'
  },
  armor: {
    label: 'Armor',
    team: 'village',
    description: 'On the first night choose two players to be Lovers. If one Lover dies, the other dies too.'
  },
  joker: {
    label: 'Joker',
    team: 'neutral',
    description: 'If you are voted out during the day, you instantly win.'
  },
  guard: {
    label: 'Guard',
    team: 'village',
    description: 'Each night protect one player from all attacks. Cannot protect the same player two nights in a row.'
  },
  villager: {
    label: 'Villager',
    team: 'village',
    description: 'No special powers. Find and eliminate the Werewolves.'
  }
};

const DEFAULT_ROLE_CONFIG: RoleConfig = {
  werewolf: 2,
  seer: 1,
  hunter: 1,
  witch: 1,
  armor: 1,
  joker: 1,
  guard: 0
};

const DEFAULT_PASSIVE_ROLE_CONFIG: PassiveRoleConfig = {
  mayor: true
};

export {
  PORT,
  NIGHT_DELAY_MS,
  PHASE_DELAY_MS,
  POST_REVEAL_DELAY_MS,
  POST_MAYOR_DELAY_MS,
  POST_ARMOR_DELAY_MS,
  NIGHT_RESOLVE_DELAY_MS,
  MIN_PLAYERS,
  ROOM_CODE,
  PLAYER_ID,
  RESUME_TOKEN,
  ROLE_INFO,
  DEFAULT_ROLE_CONFIG,
  DEFAULT_PASSIVE_ROLE_CONFIG
};
