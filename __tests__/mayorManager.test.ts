import { startNextMayorSelection } from '../src/server/managers/mayorManager';
import type { Room, Player } from '../src/shared/types';

describe('mayorManager', () => {
  describe('startNextMayorSelection', () => {
    test('returns false when no selection is queued', () => {
      const room = {
        mayorId: 'p1',
        awaitingMayorSelection: null,
        mayorSelectionQueue: [],
        mayorSelectionTimer: null,
        players: {
          p1: { id: 'p1', name: 'Player 1', alive: true, socketId: 'socket1' },
          p2: { id: 'p2', name: 'Player 2', alive: true, socketId: 'socket2' }
        }
      } as unknown as Room;
      const broadcastRoom = jest.fn();
      
      const result = startNextMayorSelection(room, broadcastRoom);
      
      expect(result).toBe(false);
      expect(broadcastRoom).not.toHaveBeenCalled();
    });

    test('returns false when already awaiting mayor selection', () => {
      const room = {
        mayorId: 'p1',
        awaitingMayorSelection: 'p1',
        mayorSelectionQueue: ['p2'],
        mayorSelectionTimer: null,
        players: {
          p1: { id: 'p1', name: 'Player 1', alive: false, socketId: 'socket1' },
          p2: { id: 'p2', name: 'Player 2', alive: false, socketId: 'socket2' }
        }
      } as unknown as Room;
      const broadcastRoom = jest.fn();
      
      const result = startNextMayorSelection(room, broadcastRoom);
      
      expect(result).toBe(false);
    });

    test('starts mayor selection for dying mayor in queue', () => {
      const room = {
        mayorId: 'p1',
        awaitingMayorSelection: null,
        mayorSelectionQueue: ['p1'],
        mayorSelectionTimer: null,
        players: {
          p1: { id: 'p1', name: 'Player 1', alive: false, socketId: 'socket1' },
          p2: { id: 'p2', name: 'Player 2', alive: true, socketId: 'socket2' }
        },
        logs: []
      } as unknown as Room;
      const broadcastRoom = jest.fn();
      const io = {
        sockets: {
          sockets: new Map([
            ['socket1', { emit: jest.fn() }]
          ])
        }
      };
      
      const result = startNextMayorSelection(room, broadcastRoom, io as any);
      
      expect(result).toBe(true);
      expect(room.awaitingMayorSelection).toBe('p1');
    });

    test('skips alive players in queue', () => {
      const room = {
        mayorId: 'p1',
        awaitingMayorSelection: null,
        mayorSelectionQueue: ['p2', 'p3'],
        mayorSelectionTimer: null,
        players: {
          p1: { id: 'p1', name: 'Player 1', alive: false, socketId: 'socket1' },
          p2: { id: 'p2', name: 'Player 2', alive: true, socketId: 'socket2' },
          p3: { id: 'p3', name: 'Player 3', alive: false, socketId: 'socket3' }
        },
        logs: []
      } as unknown as Room;
      const broadcastRoom = jest.fn();
      const io = {
        sockets: {
          sockets: new Map([
            ['socket3', { emit: jest.fn() }]
          ])
        }
      };
      
      const result = startNextMayorSelection(room, broadcastRoom, io as any);
      
      expect(result).toBe(true);
      expect(room.awaitingMayorSelection).toBe('p3');
      expect(room.mayorSelectionQueue).toEqual([]);
    });

    test('handles undefined mayorSelectionQueue gracefully', () => {
      const room = {
        mayorId: 'p1',
        awaitingMayorSelection: null,
        mayorSelectionQueue: undefined,
        mayorSelectionTimer: null,
        players: {}
      } as unknown as Room;
      const broadcastRoom = jest.fn();
      
      const result = startNextMayorSelection(room, broadcastRoom);
      
      expect(result).toBe(false);
    });
  });
});
