const { customAlphabet } = require('nanoid');

const PORT = process.env.PORT || 3001;
const NIGHT_DELAY_MS = 3000;
const PHASE_DELAY_MS = 3000;
const ROOM_CODE = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);
const PLAYER_ID = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

const ROLE_INFO = {
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
    description: 'You have one heal potion and one poison potion for the whole game. You may use at most one per night.'
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
  villager: {
    label: 'Villager',
    team: 'village',
    description: 'No special powers. Find and eliminate the Werewolves.'
  }
};

const DEFAULT_ROLE_CONFIG = {
  werewolf: 2,
  seer: 1,
  hunter: 1,
  witch: 1,
  armor: 1,
  joker: 0
};

module.exports = {
  PORT,
  NIGHT_DELAY_MS,
  PHASE_DELAY_MS,
  ROOM_CODE,
  PLAYER_ID,
  ROLE_INFO,
  DEFAULT_ROLE_CONFIG
};
