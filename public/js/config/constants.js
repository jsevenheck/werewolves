const ROLE_DETAILS = {
  werewolf: {
    name: 'Werewolf',
    description: 'Coordinate at night to eat one villager.',
    color: '#f97316'
  },
  seer: {
    name: 'Seer',
    description: 'Inspect a player each night to learn if they are a Werewolf.',
    color: '#22d3ee'
  },
  hunter: {
    name: 'Hunter',
    description: 'When you die, immediately shoot someone else.',
    color: '#f87171'
  },
  witch: {
    name: 'Witch',
    description: 'Single-use heal & poison potions. At most one per night.',
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
