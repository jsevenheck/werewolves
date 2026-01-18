import { sanitizeName, shuffle, createVoteState, addLog } from '../src/server/utils/helpers';
import type { Room } from '../src/shared/types';

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
});
