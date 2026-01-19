import type { Role } from '@shared/types';

type RoleDetail = {
  name: string;
  description: string;
  color: string;
};

const ROLE_DETAILS: Record<Role, RoleDetail> = {
  werewolf: {
    name: 'Werewolf',
    description: 'Coordinate at night to eat one villager.',
    color: '#ef4444'
  },
  seer: {
    name: 'Seer',
    description: 'Inspect a player each night to learn if they are a Werewolf.',
    color: '#22d3ee'
  },
  hunter: {
    name: 'Hunter',
    description: 'When you die, immediately shoot someone else.',
    color: '#f97316'
  },
  witch: {
    name: 'Witch',
    description: 'Single-use heal & poison potions. You may use both in the same night.',
    color: '#a855f7'
  },
  armor: {
    name: 'Armor',
    description: 'Before the first night, link two Lovers forever.',
    color: '#38bdf8'
  },
  joker: {
    name: 'Joker',
    description: 'Get voted out during the day to win instantly.',
    color: '#facc15'
  },
  villager: {
    name: 'Villager',
    description: 'Use your wits during the day. No special powers.',
    color: '#cbd5f5'
  }
};

const STORAGE_KEY = 'werewolves.session';

export { ROLE_DETAILS, STORAGE_KEY };
