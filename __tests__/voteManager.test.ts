import { schedulePhaseTransition } from '../src/server/managers/phaseManager';
import { tryResolveDayVote, resolveDayKill } from '../src/server/managers/voteManager';
import type { Player, Room, RoleConfig } from '../src/shared/types';

jest.mock('../src/server/managers/phaseManager', () => ({
  schedulePhaseTransition: jest.fn()
}));

const makeRoom = (players: Record<string, Player>): Room => ({
  code: 'ABCD',
  hostId: 'a',
  phase: 'day',
  phaseStep: 'vote',
  dayCount: 1,
  players,
  minPlayers: 3,
  roleConfig: { werewolf: 1, seer: 0, hunter: 0, witch: 0, armor: 0, joker: 0 } as RoleConfig,
  lovers: null,
  witchState: { healAvailable: true, poisonAvailable: true },
  wolfVotes: {},
  wolfTarget: null,
  healedTarget: null,
  poisonTarget: null,
  seerActed: false,
  voteState: { votes: {}, revoteFromTie: null },
  pendingDeaths: [],
  logs: [],
  nextNightStep: 'wolves',
  phaseTransition: 'dayToNight',
  phaseTimer: null,
  transitionTimer: null,
  lastNightDeaths: [],
  awaitingHunterShot: null,
  winner: null
});

const buildPlayer = (overrides: Partial<Player>): Player => ({
  id: 'a',
  name: 'Player',
  role: 'villager',
  team: 'village',
  alive: true,
  connected: true,
  socketId: null,
  isHost: false,
  voteTarget: null,
  nightAction: null,
  ready: false,
  seerResult: null,
  ...overrides
});

describe('voteManager', () => {
  test('tryResolveDayVote schedules a revote on ties', () => {
    const players = {
      a: buildPlayer({ id: 'a', alive: true }),
      b: buildPlayer({ id: 'b', alive: true }),
      c: buildPlayer({ id: 'c', alive: true }),
      d: buildPlayer({ id: 'd', alive: true })
    };
    const room = makeRoom(players);
    room.voteState.votes = { a: 'b', b: 'c', c: 'b', d: 'c' };
    const broadcastRoom = jest.fn();

    tryResolveDayVote(room, broadcastRoom, undefined as never);

    expect(broadcastRoom).toHaveBeenCalledTimes(1);
    expect([...(room.voteState.revoteFromTie || [])].sort()).toEqual(['b', 'c']);
    expect(room.voteState.votes).toEqual({});
    expect(room.logs[room.logs.length - 1].text).toBe('Vote tied. Revote among highlighted players.');
  });

  test('tryResolveDayVote skips elimination on majority abstain', () => {
    const players = {
      a: buildPlayer({ id: 'a', alive: true }),
      b: buildPlayer({ id: 'b', alive: true }),
      c: buildPlayer({ id: 'c', alive: true }),
      d: buildPlayer({ id: 'd', alive: true }),
      e: buildPlayer({ id: 'e', alive: true })
    };
    const room = makeRoom(players);
    room.voteState.votes = { a: null, b: null, c: null, d: 'e', e: 'e' };
    const broadcastRoom = jest.fn();

    tryResolveDayVote(room, broadcastRoom, undefined as never);

    expect(schedulePhaseTransition).toHaveBeenCalledWith(room, 'dayToNight', broadcastRoom);
    expect(room.logs[room.logs.length - 1].text).toBe('Majority abstained. No one eliminated.');
  });

  test('resolveDayKill ends the game when Joker is voted out', () => {
    const room = makeRoom({
      joker: buildPlayer({ id: 'joker', alive: true, role: 'joker', name: 'Joker', team: 'joker' })
    });
    const broadcastRoom = jest.fn();

    resolveDayKill(room, 'joker', broadcastRoom, undefined as never);

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
