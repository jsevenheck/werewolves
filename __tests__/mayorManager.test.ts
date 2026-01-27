import { startNextMayorSelection, tryResolveMayorVote } from '../src/server/managers/mayorManager';
import { createVoteState } from '../src/server/utils/helpers';
import { schedulePhaseTransition } from '../src/server/managers/phaseManager';
import type { Room, Player } from '../src/shared/types';

jest.mock('../src/server/managers/phaseManager', () => ({
  schedulePhaseTransition: jest.fn()
}));

describe('mayorManager', () => {
  const mockSchedulePhaseTransition = schedulePhaseTransition as jest.MockedFunction<typeof schedulePhaseTransition>;

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

  describe('tryResolveMayorVote', () => {
    beforeEach(() => {
      mockSchedulePhaseTransition.mockClear();
    });

    test('elects a mayor when a majority is reached', () => {
      const room = {
        phase: 'mayor',
        mayorId: null,
        voteState: createVoteState(),
        players: {
          p1: { id: 'p1', name: 'Player 1', alive: true, connected: true },
          p2: { id: 'p2', name: 'Player 2', alive: true, connected: true },
          p3: { id: 'p3', name: 'Player 3', alive: true, connected: true }
        },
        logs: []
      } as unknown as Room;
      room.voteState.votes = { p1: 'p2', p2: 'p2', p3: 'p1' };
      const broadcastRoom = jest.fn();

      const resolved = tryResolveMayorVote(room, broadcastRoom);

      expect(resolved).toBe(true);
      expect(room.mayorId).toBe('p2');
      expect(mockSchedulePhaseTransition).toHaveBeenCalledWith(room, 'postMayor', broadcastRoom);
    });

    test('starts a revote when the mayor vote is tied', () => {
      const room = {
        phase: 'mayor',
        mayorId: null,
        voteState: createVoteState(),
        players: {
          p1: { id: 'p1', name: 'Player 1', alive: true, connected: true },
          p2: { id: 'p2', name: 'Player 2', alive: true, connected: true },
          p3: { id: 'p3', name: 'Player 3', alive: true, connected: true },
          p4: { id: 'p4', name: 'Player 4', alive: true, connected: true }
        },
        logs: []
      } as unknown as Room;
      room.voteState.votes = { p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p2' };
      const broadcastRoom = jest.fn();

      const resolved = tryResolveMayorVote(room, broadcastRoom);

      expect(resolved).toBe(false);
      expect(room.mayorId).toBeNull();
      expect(room.voteState.votes).toEqual({});
      expect(room.voteState.revoteFromTie).toEqual(expect.arrayContaining(['p1', 'p2']));
      expect(room.voteState.revoteFromTie).toHaveLength(2);
      expect(broadcastRoom).toHaveBeenCalled();
      expect(mockSchedulePhaseTransition).not.toHaveBeenCalled();
    });

    test('breaks a second tie by choosing a random candidate', () => {
      const room = {
        phase: 'mayor',
        mayorId: null,
        voteState: createVoteState(),
        players: {
          p1: { id: 'p1', name: 'Player 1', alive: true, connected: true },
          p2: { id: 'p2', name: 'Player 2', alive: true, connected: true },
          p3: { id: 'p3', name: 'Player 3', alive: true, connected: true },
          p4: { id: 'p4', name: 'Player 4', alive: true, connected: true }
        },
        logs: []
      } as unknown as Room;
      room.voteState.revoteFromTie = ['p1', 'p2'];
      room.voteState.votes = { p1: 'p1', p2: 'p2', p3: 'p1', p4: 'p2' };
      const broadcastRoom = jest.fn();
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

      try {
        const resolved = tryResolveMayorVote(room, broadcastRoom);

        expect(resolved).toBe(true);
        expect(room.mayorId).toBe('p1');
        expect(mockSchedulePhaseTransition).toHaveBeenCalledWith(room, 'postMayor', broadcastRoom);
      } finally {
        randomSpy.mockRestore();
      }
    });

    test('allows early resolution when host finalizes', () => {
      const room = {
        phase: 'mayor',
        mayorId: null,
        voteState: createVoteState(),
        players: {
          p1: { id: 'p1', name: 'Player 1', alive: true, connected: true },
          p2: { id: 'p2', name: 'Player 2', alive: true, connected: true },
          p3: { id: 'p3', name: 'Player 3', alive: true, connected: true }
        },
        logs: []
      } as unknown as Room;
      room.voteState.votes = { p1: 'p3', p2: 'p3' };
      const broadcastRoom = jest.fn();

      const resolved = tryResolveMayorVote(room, broadcastRoom, { allowEarly: true });

      expect(resolved).toBe(true);
      expect(room.mayorId).toBe('p3');
      expect(mockSchedulePhaseTransition).toHaveBeenCalledWith(room, 'postMayor', broadcastRoom);
    });

    test('resolves when all connected players vote and some are disconnected', () => {
      const room = {
        phase: 'mayor',
        mayorId: null,
        voteState: createVoteState(),
        players: {
          p1: { id: 'p1', name: 'Player 1', alive: true, connected: true },
          p2: { id: 'p2', name: 'Player 2', alive: true, connected: true },
          p3: { id: 'p3', name: 'Player 3', alive: true, connected: false }
        },
        logs: []
      } as unknown as Room;
      room.voteState.votes = { p1: 'p2', p2: 'p2' };
      const broadcastRoom = jest.fn();

      const resolved = tryResolveMayorVote(room, broadcastRoom);

      expect(resolved).toBe(true);
      expect(room.mayorId).toBe('p2');
      expect(mockSchedulePhaseTransition).toHaveBeenCalledWith(room, 'postMayor', broadcastRoom);
    });
  });
});
