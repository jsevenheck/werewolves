import { sanitizeName, shuffle, createVoteState, addLog, getPlayerRoleLabel } from '../server/src/utils/helpers';
import type { Room, Player, Role } from '../core/src/types';

describe('helpers', () => {
  test('sanitizeName trims and caps at 20 characters', () => {
    expect(sanitizeName('  Alice  ')).toBe('Alice');
    const longName = 'abcdefghijklmnopqrstuvwxyz';
    expect(sanitizeName(longName)).toBe(longName.slice(0, 20));
  });

  test('shuffle returns a new array with the same elements', () => {
    const original = [1, 2, 3, 4];
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const result = shuffle(original);
    expect(result).toEqual([2, 3, 4, 1]);
    expect(result).not.toBe(original);
    expect(original).toEqual([1, 2, 3, 4]);
    randomSpy.mockRestore();
  });

  test('createVoteState initializes votes and tie state', () => {
    const state = createVoteState();
    expect(state).toEqual({ votes: {}, revoteFromTie: null });
  });

  test('addLog appends log entries with timestamps', () => {
    const room = { logs: [] } as unknown as Room;
    addLog(room, 'private text', 'public text');
    expect(room.logs).toHaveLength(1);
    expect(room.logs[0]).toMatchObject({ text: 'private text', publicText: 'public text' });
    expect(typeof room.logs[0].ts).toBe('number');
  });

  describe('getPlayerRoleLabel', () => {
    test('returns role label for assigned roles', () => {
      const player = { role: 'werewolf' } as Player;
      expect(getPlayerRoleLabel(player)).toBe('Werewolf');
    });

    test('returns role label for seer', () => {
      const player = { role: 'seer' } as Player;
      expect(getPlayerRoleLabel(player)).toBe('Seer');
    });

    test('returns role label for villager', () => {
      const player = { role: 'villager' } as Player;
      expect(getPlayerRoleLabel(player)).toBe('Villager');
    });

    test('returns villager label when role is null (lobby phase)', () => {
      const player = { role: null } as Player;
      expect(getPlayerRoleLabel(player)).toBe('Villager');
    });

    test('handles all role types correctly', () => {
      const roles = [
        { role: 'werewolf' as Role, expected: 'Werewolf' },
        { role: 'seer' as Role, expected: 'Seer' },
        { role: 'hunter' as Role, expected: 'Hunter' },
        { role: 'witch' as Role, expected: 'Witch' },
        { role: 'armor' as Role, expected: 'Armor' },
        { role: 'joker' as Role, expected: 'Joker' },
        { role: 'villager' as Role, expected: 'Villager' }
      ];

      roles.forEach(({ role, expected }) => {
        const player = { role } as Player;
        expect(getPlayerRoleLabel(player)).toBe(expected);
      });
    });
  });
});
