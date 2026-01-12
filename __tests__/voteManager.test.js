jest.mock('../src/server/managers/phaseManager', () => ({
  schedulePhaseTransition: jest.fn()
}));

const { schedulePhaseTransition } = require('../src/server/managers/phaseManager');
const { tryResolveDayVote, resolveDayKill } = require('../src/server/managers/voteManager');

const makeRoom = (players) => ({
  players,
  voteState: { votes: {}, revoteFromTie: null },
  logs: [],
  phase: 'day',
  phaseStep: 'vote',
  nextNightStep: 'wolves',
  phaseTransition: 'dayToNight',
  phaseTimer: 1,
  transitionTimer: 2,
  winner: null
});

describe('voteManager', () => {
  test('tryResolveDayVote schedules a revote on ties', () => {
    const players = {
      a: { id: 'a', alive: true },
      b: { id: 'b', alive: true },
      c: { id: 'c', alive: true },
      d: { id: 'd', alive: true }
    };
    const room = makeRoom(players);
    room.voteState.votes = { a: 'b', b: 'c', c: 'b', d: 'c' };
    const broadcastRoom = jest.fn();

    tryResolveDayVote(room, broadcastRoom);

    expect(broadcastRoom).toHaveBeenCalledTimes(1);
    expect([...room.voteState.revoteFromTie].sort()).toEqual(['b', 'c']);
    expect(room.voteState.votes).toEqual({});
    expect(room.logs[room.logs.length - 1].text).toBe('Vote tied. Revote among highlighted players.');
  });

  test('tryResolveDayVote skips elimination on majority abstain', () => {
    const players = {
      a: { id: 'a', alive: true },
      b: { id: 'b', alive: true },
      c: { id: 'c', alive: true },
      d: { id: 'd', alive: true },
      e: { id: 'e', alive: true }
    };
    const room = makeRoom(players);
    room.voteState.votes = { a: null, b: null, c: null, d: 'e', e: 'e' };
    const broadcastRoom = jest.fn();

    tryResolveDayVote(room, broadcastRoom);

    expect(schedulePhaseTransition).toHaveBeenCalledWith(room, 'dayToNight', broadcastRoom);
    expect(room.logs[room.logs.length - 1].text).toBe('Majority abstained. No one eliminated.');
  });

  test('resolveDayKill ends the game when Joker is voted out', () => {
    const room = makeRoom({
      joker: { id: 'joker', alive: true, role: 'joker', name: 'Joker' }
    });
    const broadcastRoom = jest.fn();

    resolveDayKill(room, 'joker', broadcastRoom);

    expect(room.winner).toEqual({
      team: 'joker',
      reason: 'Joker was voted out and laughs last!'
    });
    expect(room.phase).toBe('ended');
    expect(room.phaseStep).toBeNull();
    expect(room.nextNightStep).toBeNull();
    expect(room.phaseTransition).toBeNull();
    expect(room.phaseTimer).toBeNull();
    expect(room.transitionTimer).toBeNull();
    expect(broadcastRoom).toHaveBeenCalledTimes(1);
  });
});
