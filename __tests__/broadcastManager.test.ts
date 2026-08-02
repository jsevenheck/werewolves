import { sanitizeRoom } from '../server/src/managers/broadcastManager';
import type { Room, Player } from '../core/src/types';

const makeRoom = (): Room => ({
  code: 'ABCD',
  phase: 'day',
  phaseStep: null,
  dayCount: 1,
  players: {},
  hostId: 'p1',
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
  },
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
  winner: null,
  lastNightDeaths: [],
  lastDayDeaths: [],
  lastDayMessage: null,
  awaitingHunterShot: null,
  logs: [],
  nextNightStep: null,
  transitionTimer: null,
  phaseTransition: null,
  phaseTimer: null,
  hunterShotTimer: null,
  hunterShotEndsAt: null,
  hunterShotQueue: [],
  harlotVisitedTarget: null,
  harlotActed: false,
  dayVoteResolved: false,
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
});

const buildPlayer = (overrides: Partial<Player>): Player => ({
  id: 'p1',
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

describe('broadcastManager', () => {
  test('sanitizeRoom hides roles and uses public logs for alive viewers', () => {
    const room = makeRoom();
    room.players = {
      p1: buildPlayer({ id: 'p1', name: 'Alice', role: 'villager', team: 'village', isHost: true }),
      p2: buildPlayer({ id: 'p2', name: 'Bob', role: 'werewolf', team: 'wolves' }),
    };
    room.logs.push({ ts: 1, text: 'Full log', publicText: 'Public log' });

    const view = sanitizeRoom(room, 'p1');

    const playerSelf = view.players.find((p) => p.id === 'p1');
    const playerOther = view.players.find((p) => p.id === 'p2');
    expect(playerSelf?.role).toBe('villager');
    expect(playerOther?.role).toBeNull();
    expect(view.logs[0].text).toBe('Public log');

    room.phase = 'ended';
    const endedView = sanitizeRoom(room, 'p1');
    const endedOther = endedView.players.find((p) => p.id === 'p2');
    expect(endedOther?.role).toBe('werewolf');
  });

  test('sanitizeRoom exposes lover info to linked players', () => {
    const room = makeRoom();
    room.players = {
      p1: buildPlayer({ id: 'p1', name: 'Alice', role: 'villager', team: 'village', isHost: true }),
      p2: buildPlayer({ id: 'p2', name: 'Bob', role: 'villager', team: 'village' }),
      p3: buildPlayer({ id: 'p3', name: 'Cara', role: 'villager', team: 'village' }),
    };
    room.lovers = { aId: 'p1', bId: 'p2' };

    const viewLover = sanitizeRoom(room, 'p1');
    expect(viewLover.loversKnown).toBe(true);
    expect(viewLover.loverName).toBe('Bob');

    const viewOther = sanitizeRoom(room, 'p3');
    expect(viewOther.loversKnown).toBe(false);
    expect(viewOther.loverName).toBeNull();
  });

  test('dead viewers see deadOnly action logs; alive viewers do not', () => {
    const room = makeRoom();
    room.phase = 'day';
    room.players = {
      p1: buildPlayer({ id: 'p1', name: 'Alice', role: 'villager', team: 'village', isHost: true }),
      p2: buildPlayer({ id: 'p2', name: 'Bob', role: 'werewolf', team: 'wolves', alive: false }),
    };
    room.logs.push({
      ts: 1,
      text: 'Public death',
      publicText: 'Public death',
      message: null,
      publicMessage: null,
    });
    room.logs.push({
      ts: 2,
      text: 'Wolves chose Bob.',
      publicText: null,
      message: { key: 'server.logs.wolfAttackTarget', params: { target: 'Bob' } },
      deadOnly: true,
    });

    const deadView = sanitizeRoom(room, 'p2');
    const aliveView = sanitizeRoom(room, 'p1');

    // Dead viewer sees the deadOnly action log; alive viewer does not.
    expect(deadView.logs.map((l) => l.text)).toContain('server.logs.wolfAttackTarget');
    expect(aliveView.logs.map((l) => l.text)).not.toContain('server.logs.wolfAttackTarget');
    // Both still see the public log.
    expect(deadView.logs.map((l) => l.text)).toContain('Public death');
    expect(aliveView.logs.map((l) => l.text)).toContain('Public death');
  });

  test('player role tags are revealed for dead players before game end', () => {
    const room = makeRoom();
    room.phase = 'day';
    room.players = {
      p1: buildPlayer({ id: 'p1', name: 'Alice', role: 'villager', team: 'village', isHost: true }),
      p2: buildPlayer({ id: 'p2', name: 'Bob', role: 'werewolf', team: 'wolves', alive: false }),
    };

    // Alive viewers see the dead player's role on the card mid-game.
    const aliveView = sanitizeRoom(room, 'p1');
    const aliveBob = aliveView.players.find((p) => p.id === 'p2');
    expect(aliveBob?.role).toBe('werewolf');

    // Living players' roles remain hidden mid-game.
    const deadView = sanitizeRoom(room, 'p2');
    const deadAlice = deadView.players.find((p) => p.id === 'p1');
    expect(deadAlice?.role).toBeNull();

    // At game end everyone's role is revealed on the cards.
    room.phase = 'ended';
    const endedView = sanitizeRoom(room, 'p1');
    const endedBob = endedView.players.find((p) => p.id === 'p2');
    expect(endedBob?.role).toBe('werewolf');
  });
});
