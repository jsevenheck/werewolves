const { startNight, scheduleNightStep, schedulePhaseTransition } = require('../src/server/managers/phaseManager');

const makeRoom = () => ({
  players: {},
  phase: 'lobby',
  phaseStep: null,
  nextNightStep: null,
  phaseTransition: null,
  transitionTimer: null,
  phaseTimer: null,
  wolfVotes: { stale: 'x' },
  wolfTarget: 'old',
  seerActed: true,
  pendingDeaths: ['x'],
  lastNightDeaths: ['y'],
  voteState: { votes: { a: 'b' }, revoteFromTie: ['b'] },
  awaitingHunterShot: 'p1',
  dayCount: 0,
  logs: [],
  winner: null
});

describe('phaseManager', () => {
  test('startNight resets night state and wolf votes', () => {
    const room = makeRoom();
    room.players = {
      w1: { id: 'w1', role: 'werewolf', alive: true },
      w2: { id: 'w2', role: 'werewolf', alive: false },
      v1: { id: 'v1', role: 'villager', alive: true }
    };

    startNight(room);

    expect(room.phase).toBe('night');
    expect(room.phaseStep).toBe('wolves');
    expect(room.wolfVotes).toEqual({ w1: null });
    expect(room.wolfTarget).toBeNull();
    expect(room.seerActed).toBe(false);
    expect(room.pendingDeaths).toEqual([]);
    expect(room.lastNightDeaths).toEqual([]);
    expect(room.voteState).toEqual({ votes: {}, revoteFromTie: null });
    expect(room.awaitingHunterShot).toBeNull();
  });

  test('scheduleNightStep transitions after the night delay', () => {
    jest.useFakeTimers();
    const room = makeRoom();
    room.phase = 'night';
    room.phaseStep = 'wolves';
    const broadcastRoom = jest.fn();

    scheduleNightStep(room, 'seer', broadcastRoom);

    expect(room.phaseStep).toBe('transition');
    expect(room.nextNightStep).toBe('seer');
    expect(broadcastRoom).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3000);

    expect(room.phaseStep).toBe('seer');
    expect(room.nextNightStep).toBeNull();
    expect(broadcastRoom).toHaveBeenCalledTimes(2);
  });

  test('schedulePhaseTransition moves night to day after delay', () => {
    jest.useFakeTimers();
    const room = makeRoom();
    room.phase = 'night';
    room.phaseStep = 'wolves';
    const broadcastRoom = jest.fn();

    schedulePhaseTransition(room, 'nightToDay', broadcastRoom);

    expect(room.phaseTransition).toBe('nightToDay');
    expect(room.phaseStep).toBe('transition');
    expect(broadcastRoom).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3000);

    expect(room.phaseTransition).toBeNull();
    expect(room.phase).toBe('day');
    expect(room.dayCount).toBe(1);
    expect(room.voteState).toEqual({ votes: {}, revoteFromTie: null });
    expect(room.logs[room.logs.length - 1].text).toBe('Day 1 has begun.');
    expect(broadcastRoom).toHaveBeenCalledTimes(2);
  });
});
