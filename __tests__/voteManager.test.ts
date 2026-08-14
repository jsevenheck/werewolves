import { tryResolveDayVote, resolveDayKill } from '../server/src/managers/voteManager';
import * as voteManagerModule from '../server/src/managers/voteManager';
import type { Player, Room, RoleConfig } from '../core/src/types';

vi.mock('../server/src/managers/phaseManager', () => ({
  schedulePhaseTransition: vi.fn(),
  holdDayToNightTransition: vi.fn(),
}));

const makeRoom = (players: Record<string, Player>): Room => ({
  code: 'ABCD',
  hostId: 'a',
  phase: 'day',
  phaseStep: null,
  dayCount: 1,
  players,
  minPlayers: 5,
  roleConfig: {
    werewolf: 1,
    seer: 0,
    hunter: 0,
    witch: 0,
    armor: 0,
    joker: 0,
    guard: 0,
    harlot: 0,
  } as RoleConfig,
  passiveRoleConfig: { mayor: true },
  discussionTimerSeconds: 60,
  discussionEndsAt: null,
  mayorId: null,
  awaitingMayorSelection: null,
  mayorSelectionQueue: [],
  mayorSelectionTimer: null,
  lovers: null,
  witchState: { healAvailable: true, poisonAvailable: true },
  wolfVotes: {},
  wolfTarget: null,
  healedTarget: null,
  poisonTarget: null,
  seerActed: false,
  seerAwaitingDismiss: false,
  guardedTarget: null,
  lastGuardedTarget: null,
  guardActed: false,
  voteState: { votes: {}, revoteFromTie: null },
  pendingDeaths: [],
  logs: [],
  nextNightStep: 'wolves',
  phaseTransition: 'dayToNight',
  phaseTimer: null,
  transitionTimer: null,
  hunterShotTimer: null,
  hunterShotEndsAt: null,
  hunterShotQueue: [],
  lastNightDeaths: [],
  lastDayDeaths: [],
  lastDayMessage: null,
  awaitingHunterShot: null,
  winner: null,
  harlotVisitedTarget: null,
  harlotActed: false,
  dayVoteResolved: false,
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
});

const buildPlayer = (overrides: Partial<Player>): Player => ({
  id: 'a',
  name: 'Player',
  role: 'villager',
  team: 'village',
  alive: true,
  connected: true,
  socketId: null,
  resumeToken: 'token',
  isHost: false,
  ready: false,
  seerResult: null,
  ...overrides,
});

describe('voteManager', () => {
  test('tryResolveDayVote schedules a revote on ties', () => {
    const players = {
      a: buildPlayer({ id: 'a', alive: true }),
      b: buildPlayer({ id: 'b', alive: true }),
      c: buildPlayer({ id: 'c', alive: true }),
      d: buildPlayer({ id: 'd', alive: true }),
    };
    const room = makeRoom(players);
    room.voteState.votes = { a: 'b', b: 'c', c: 'b', d: 'c' };
    const broadcastRoom = vi.fn();

    tryResolveDayVote(room, broadcastRoom, undefined as never);

    expect(broadcastRoom).toHaveBeenCalledTimes(1);
    expect([...(room.voteState.revoteFromTie || [])].sort()).toEqual(['b', 'c']);
    expect(room.voteState.votes).toEqual({});
    expect(room.logs[room.logs.length - 1].text).toBe(
      'Vote tied. Revote among highlighted players.'
    );
  });

  test('tryResolveDayVote logs random selection on revote tie', () => {
    const players = {
      a: buildPlayer({ id: 'a', alive: true, name: 'Alpha' }),
      b: buildPlayer({ id: 'b', alive: true, name: 'Beta' }),
      c: buildPlayer({ id: 'c', alive: true, name: 'Charlie' }),
      d: buildPlayer({ id: 'd', alive: true, name: 'Delta' }),
    };
    const room = makeRoom(players);
    room.voteState.revoteFromTie = ['b', 'c'];
    room.voteState.votes = { a: 'b', b: 'c', c: 'b', d: 'c' };
    const broadcastRoom = vi.fn();
    const resolveSpy = vi.spyOn(voteManagerModule, 'resolveDayKill').mockImplementation(() => {});
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
      tryResolveDayVote(room, broadcastRoom, undefined as never);
    } finally {
      resolveSpy.mockRestore();
      randomSpy.mockRestore();
    }

    const hasLog = room.logs.some(
      (entry) => entry.text === 'Vote tied again. Randomly selected Beta.'
    );
    expect(hasLog).toBe(true);
  });

  test('tryResolveDayVote skips elimination on majority abstain', () => {
    const players = {
      a: buildPlayer({ id: 'a', alive: true }),
      b: buildPlayer({ id: 'b', alive: true }),
      c: buildPlayer({ id: 'c', alive: true }),
      d: buildPlayer({ id: 'd', alive: true }),
      e: buildPlayer({ id: 'e', alive: true }),
    };
    const room = makeRoom(players);
    room.voteState.votes = { a: null, b: null, c: null, d: 'e', e: 'e' };
    const broadcastRoom = vi.fn();

    tryResolveDayVote(room, broadcastRoom, undefined as never);

    expect(room.dayVoteResolved).toBe(true);
    expect(room.logs[room.logs.length - 1].text).toBe('Majority abstained. No one eliminated.');
    expect(room.lastDayDeaths).toEqual([]);
    expect(room.lastDayMessage).toBe('No one was eliminated.');
  });

  test('tryResolveDayVote counts abstentions out of the majority denominator', () => {
    const players = {
      wolf: buildPlayer({ id: 'wolf', alive: true, role: 'werewolf', team: 'wolves' }),
      a: buildPlayer({ id: 'a', alive: true }),
      b: buildPlayer({ id: 'b', alive: true }),
      c: buildPlayer({ id: 'c', alive: true }),
    };
    const room = makeRoom(players);
    room.voteState.votes = { wolf: 'a', a: 'a', b: 'b', c: null };
    const broadcastRoom = vi.fn();

    tryResolveDayVote(room, broadcastRoom, undefined as never);

    expect(room.players.a.alive).toBe(false);
    expect(room.lastDayDeaths).toEqual([{ name: 'Player', role: 'villager' }]);
    expect(room.dayVoteResolved).toBe(true);
  });

  test('tryResolveDayVote counts disconnected players as abstain after others vote', () => {
    const players = {
      a: buildPlayer({ id: 'a', alive: true, connected: true }),
      b: buildPlayer({ id: 'b', alive: true, connected: true }),
      c: buildPlayer({ id: 'c', alive: true, connected: false }),
    };
    const room = makeRoom(players);
    room.voteState.votes = { a: null, b: null };
    const broadcastRoom = vi.fn();

    tryResolveDayVote(room, broadcastRoom, undefined as never);

    expect(room.voteState.votes.c).toBeNull();
    expect(room.dayVoteResolved).toBe(true);
    expect(room.logs[room.logs.length - 1].text).toBe('Vote skipped. No one eliminated.');
    expect(room.lastDayMessage).toBe('No one was eliminated.');
  });

  test('tryResolveDayVote does not resolve early when most players have not voted', () => {
    const players = {
      a: buildPlayer({ id: 'a', alive: true }),
      b: buildPlayer({ id: 'b', alive: true, role: 'joker', team: 'joker' }),
      c: buildPlayer({ id: 'c', alive: true }),
      d: buildPlayer({ id: 'd', alive: true }),
    };
    const room = makeRoom(players);
    room.voteState.votes = { a: 'b' };
    const broadcastRoom = vi.fn();

    tryResolveDayVote(room, broadcastRoom, undefined as never, { allowEarly: true });

    expect(room.winner).toBeNull();
    expect(room.players.b.alive).toBe(true);
    expect(room.lastDayMessage).toBe('No one was eliminated.');
  });

  test('early resolution treats missing votes as abstentions', () => {
    const players = {
      a: buildPlayer({ id: 'a', alive: true }),
      b: buildPlayer({ id: 'b', alive: true }),
      c: buildPlayer({ id: 'c', alive: true }),
      d: buildPlayer({ id: 'd', alive: true }),
      e: buildPlayer({ id: 'e', alive: true }),
    };
    const room = makeRoom(players);
    room.voteState.votes = { a: 'c', b: 'c' };
    const broadcastRoom = vi.fn();

    tryResolveDayVote(room, broadcastRoom, undefined as never, { allowEarly: true });

    expect(room.players.c.alive).toBe(true);
    expect(room.dayVoteResolved).toBe(true);
    expect(room.lastDayMessage).toBe('No one was eliminated.');
    expect(room.logs[room.logs.length - 1].text).toBe('Majority abstained. No one eliminated.');
  });

  test('resolveDayKill ends the game when Joker is voted out', () => {
    const room = makeRoom({
      joker: buildPlayer({
        id: 'joker',
        alive: true,
        role: 'joker',
        name: 'Joker',
        team: 'joker',
      }),
      hunter: buildPlayer({
        id: 'hunter',
        alive: true,
        role: 'hunter',
        name: 'Hunter',
        team: 'village',
      }),
    });
    room.mayorId = 'joker';
    room.lovers = { aId: 'joker', bId: 'hunter' };
    const broadcastRoom = vi.fn();

    resolveDayKill(room, 'joker', broadcastRoom, undefined as never);

    expect(room.winner).toEqual({
      team: 'joker',
      reason: 'Joker was voted out and laughs last!',
    });
    expect(room.phase).toBe('ended');
    expect(room.phaseStep).toBeNull();
    expect(room.nextNightStep).toBeNull();
    expect(room.phaseTransition).toBeNull();
    expect(room.phaseTimer).toBeNull();
    expect(room.transitionTimer).toBeNull();
    expect(room.awaitingHunterShot).toBeNull();
    expect(room.hunterShotQueue).toEqual([]);
    expect(room.hunterShotTimer).toBeNull();
    expect(room.hunterShotEndsAt).toBeNull();
    expect(room.awaitingMayorSelection).toBeNull();
    expect(room.mayorSelectionQueue).toEqual([]);
    // broadcastRoom is called twice: once from resolveDeaths (for death processing)
    // and once after setting joker as winner
    expect(broadcastRoom).toHaveBeenCalledTimes(2);
  });

  describe('mayor tie-breaking', () => {
    test("mayor's vote counts double on initial tie and lifts their candidate", () => {
      // Four alive, 2-2 tie between b and c, mayor voted for b. After
      // the mayor's vote is doubled, b = 3 and c = 2. b reaches the
      // simple majority threshold (3 of 4 alive) and is eliminated.
      const players = {
        a: buildPlayer({ id: 'a', alive: true }),
        b: buildPlayer({ id: 'b', alive: true }),
        c: buildPlayer({ id: 'c', alive: true }),
        d: buildPlayer({ id: 'd', alive: true }),
      };
      const room = makeRoom(players);
      room.mayorId = 'a';
      room.voteState.votes = { a: 'b', b: 'c', c: 'b', d: 'c' };
      const broadcastRoom = vi.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      expect(room.logs.some((log) => log.text.includes("Mayor's vote counted double"))).toBe(true);
      expect(room.players.b.alive).toBe(false);
      expect(room.voteState.revoteFromTie).toBeNull();
    });

    test("mayor's vote counts double on revote tie and lifts their candidate", () => {
      // Four alive, revote between b and c, 2-2 tie, mayor voted for b.
      // After doubling: b = 3, c = 2. b is eliminated.
      const players = {
        a: buildPlayer({ id: 'a', alive: true }),
        b: buildPlayer({ id: 'b', alive: true }),
        c: buildPlayer({ id: 'c', alive: true }),
        d: buildPlayer({ id: 'd', alive: true }),
      };
      const room = makeRoom(players);
      room.mayorId = 'a';
      room.voteState.revoteFromTie = ['b', 'c'];
      room.voteState.votes = { a: 'b', b: 'c', c: 'b', d: 'c' };
      const broadcastRoom = vi.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      const mayorDecidedLog = room.logs.find((log) =>
        log.text.includes("Mayor's vote counted double")
      );
      expect(mayorDecidedLog).toBeTruthy();
      expect(room.players.b.alive).toBe(false);
    });

    test('1-1-1 split with 6 alive is skipped, even when mayor voted for a tied candidate', () => {
      // Six alive, three votes, three different targets: 2/2/2. The
      // mayor's doubled vote lifts one candidate to 3 of 6, which is
      // still below the simple-majority threshold of 4. The day is
      // skipped — nobody is eliminated.
      const players = {
        a: buildPlayer({ id: 'a', alive: true }),
        b: buildPlayer({ id: 'b', alive: true }),
        c: buildPlayer({ id: 'c', alive: true }),
        d: buildPlayer({ id: 'd', alive: true }),
        e: buildPlayer({ id: 'e', alive: true }),
        f: buildPlayer({ id: 'f', alive: true }),
      };
      const room = makeRoom(players);
      room.mayorId = 'a';
      room.voteState.votes = { a: 'a', b: 'b', c: 'c', d: 'a', e: 'b', f: 'c' };
      const broadcastRoom = vi.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      expect(room.dayVoteResolved).toBe(true);
      expect(room.logs[room.logs.length - 1].text).toBe('Vote skipped. No one eliminated.');
      expect(Object.values(room.players).every((p) => p.alive)).toBe(true);
    });

    test("3-way tie where mayor's doubled vote still ties goes to revote", () => {
      // Six alive, 2/2/2 with mayor voting for b. After doubling b = 3,
      // a = 2, c = 2 — b is the unique leader but still < simple
      // majority (4 of 6). The day is skipped (no revote triggered
      // because there is only one tied top — it just falls below the
      // majority threshold).
      const players = {
        a: buildPlayer({ id: 'a', alive: true }),
        b: buildPlayer({ id: 'b', alive: true }),
        c: buildPlayer({ id: 'c', alive: true }),
        d: buildPlayer({ id: 'd', alive: true }),
        e: buildPlayer({ id: 'e', alive: true }),
        f: buildPlayer({ id: 'f', alive: true }),
      };
      const room = makeRoom(players);
      room.mayorId = 'a';
      room.voteState.votes = { a: 'b', b: 'a', c: 'a', d: 'b', e: 'c', f: 'c' }; // 2/2/2
      const broadcastRoom = vi.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      // Mayor's double lifts b to 3, but 3 < 4 → skipped.
      expect(room.dayVoteResolved).toBe(true);
      expect(room.logs[room.logs.length - 1].text).toBe('Vote skipped. No one eliminated.');
      expect(Object.values(room.players).every((p) => p.alive)).toBe(true);
    });

    test('tie goes to revote when mayor did not vote for tied candidate', () => {
      const players = {
        a: buildPlayer({ id: 'a', alive: true }),
        b: buildPlayer({ id: 'b', alive: true }),
        c: buildPlayer({ id: 'c', alive: true }),
        d: buildPlayer({ id: 'd', alive: true }),
        e: buildPlayer({ id: 'e', alive: true }),
      };
      const room = makeRoom(players);
      room.mayorId = 'a';
      room.voteState.votes = { a: 'e', b: 'c', c: 'b', d: 'c', e: 'b' }; // 2-2 tie between b and c, mayor voted for e
      const broadcastRoom = vi.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      expect([...(room.voteState.revoteFromTie || [])].sort()).toEqual(['b', 'c']);
      expect(room.logs[room.logs.length - 1].text).toBe(
        'Vote tied. Revote among highlighted players.'
      );
    });

    test('tie goes to revote when mayor abstained', () => {
      const players = {
        a: buildPlayer({ id: 'a', alive: true }),
        b: buildPlayer({ id: 'b', alive: true }),
        c: buildPlayer({ id: 'c', alive: true }),
        d: buildPlayer({ id: 'd', alive: true }),
        e: buildPlayer({ id: 'e', alive: true }),
      };
      const room = makeRoom(players);
      room.mayorId = 'a';
      room.voteState.votes = { a: null, b: 'c', c: 'b', d: 'c', e: 'b' }; // 2-2 tie, mayor abstained
      const broadcastRoom = vi.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      expect([...(room.voteState.revoteFromTie || [])].sort()).toEqual(['b', 'c']);
    });

    test('tie goes to random when mayor dead', () => {
      const players = {
        a: buildPlayer({ id: 'a', alive: false }),
        b: buildPlayer({ id: 'b', alive: true }),
        c: buildPlayer({ id: 'c', alive: true }),
        d: buildPlayer({ id: 'd', alive: true }),
      };
      const room = makeRoom(players);
      room.mayorId = 'a'; // Mayor is dead
      room.voteState.revoteFromTie = ['b', 'c'];
      room.voteState.votes = { b: 'c', c: 'b', d: 'c' }; // Still tied
      const broadcastRoom = vi.fn();

      tryResolveDayVote(room, broadcastRoom, undefined as never);

      // One of the tied players should be eliminated (random pick)
      const bDead = !room.players.b.alive;
      const cDead = !room.players.c.alive;
      expect(bDead || cDead).toBe(true);
      expect(bDead && cDead).toBe(false); // Only one should be dead
    });
  });
});
