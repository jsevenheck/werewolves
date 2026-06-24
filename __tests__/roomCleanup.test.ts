import { describe, expect, test } from 'vitest';
import { createRoom, getRoom, getAllRooms, cleanupIdleRooms } from '../server/src/models/room';
import { createPlayer } from '../server/src/models/player';

/**
 * Empty-room cleanup: when an admin kicks everyone (or the last player
 * leaves), the room must be reaped so it does not linger in the admin room
 * list. The kick/leave handlers delete such rooms immediately; the hourly
 * `cleanupIdleRooms` is a safety net that also reaps 0-player rooms.
 */
describe('cleanupIdleRooms — empty rooms', () => {
  test('reaps a room with zero players immediately (no idle wait)', () => {
    // Start a room with a host, then drop the host so it is empty.
    const { room } = createRoom('Host', 'socket-empty-1', createPlayer);
    delete room.players[Object.keys(room.players)[0]!];
    expect(Object.values(room.players).length).toBe(0);
    expect(getRoom(room.code)).toBeDefined();

    cleanupIdleRooms();

    expect(getRoom(room.code)).toBeUndefined();
  });

  test('does not reap a room that still has players', () => {
    const { room } = createRoom('Host', 'socket-keep-1', createPlayer);
    const before = getAllRooms().size;
    cleanupIdleRooms();
    expect(getRoom(room.code)).toBeDefined();
    // Size may include other test rooms, but the kept room must remain.
    expect(getAllRooms().size).toBeGreaterThanOrEqual(before);
  });
});
