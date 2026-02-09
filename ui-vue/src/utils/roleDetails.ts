import type { Role } from '@shared/types';

export interface RoleDetail {
  name: string;
  description: string;
  color: string;
}

export const ROLE_DETAILS: Record<Role, RoleDetail> & Record<string, RoleDetail | undefined> = {
  werewolf: {
    name: 'Werewolf',
    description: 'Coordinate at night to eat one villager.',
    color: '#ef4444',
  },
  seer: {
    name: 'Seer',
    description: 'Inspect a player each night to learn if they are a Werewolf.',
    color: '#22d3ee',
  },
  hunter: {
    name: 'Hunter',
    description: 'When you die, immediately shoot someone else.',
    color: '#f97316',
  },
  witch: {
    name: 'Witch',
    description: 'Single-use heal & poison potions. You may use both in the same night.',
    color: '#a855f7',
  },
  armor: {
    name: 'Armor',
    description: 'Before the first night, link two Lovers forever.',
    color: '#38bdf8',
  },
  joker: {
    name: 'Joker',
    description: 'Get voted out during the day to win instantly.',
    color: '#facc15',
  },
  guard: {
    name: 'Guard',
    description: 'Each night protect one player from all attacks.',
    color: '#10b981',
  },
  harlot: {
    name: 'Harlot',
    description:
      'Visit a player each night. If wolves successfully kill your visited target, you die too.',
    color: '#ec4899',
  },
  villager: {
    name: 'Villager',
    description: 'Use your wits during the day. No special powers.',
    color: '#cbd5f5',
  },
};

export const PASSIVE_ROLE_DETAILS: Record<string, { name: string }> = {
  mayor: { name: 'Mayor' },
};

export function getRoleName(role: string | null | undefined): string {
  if (!role) return 'Unknown';
  return ROLE_DETAILS[role as Role]?.name ?? role;
}
