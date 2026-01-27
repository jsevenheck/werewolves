import { sanitizeRoom } from '../src/server/managers/broadcastManager';
import type { Room, Player } from '../src/shared/types';

const makeRoom = (): Room => ({
  code: 'ABCD',
  phase: 'day',
  phaseStep: null,
  dayCount: 1,
  players: {},
  hostId: 'p1',
  minPlayers: 5,
  roleConfig: { werewolf: 1, seer: 0, hunter: 0, witch: 0, armor: 0, joker: 0, guard: 0 },
  passiveRoleConfig: { mayor: true },
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
  createdAt: Date.now(),
  lastActivityAt: Date.now()
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
  voteTarget: null,
  nightAction: null,
  ready: false,
  seerResult: null,
  ...overrides
});

describe('broadcastManager', () => {
  test('sanitizeRoom hides roles and uses public logs for alive viewers', () => {
    const room = makeRoom();
    room.players = {
      p1: buildPlayer({ id: 'p1', name: 'Alice', role: 'villager', team: 'village', isHost: true }),
      p2: buildPlayer({ id: 'p2', name: 'Bob', role: 'werewolf', team: 'wolves' })
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
      p3: buildPlayer({ id: 'p3', name: 'Cara', role: 'villager', team: 'village' })
    };
    room.lovers = { aId: 'p1', bId: 'p2' };

    const viewLover = sanitizeRoom(room, 'p1');
    expect(viewLover.loversKnown).toBe(true);
    expect(viewLover.loverName).toBe('Bob');

    const viewOther = sanitizeRoom(room, 'p3');
    expect(viewOther.loversKnown).toBe(false);
    expect(viewOther.loverName).toBeNull();
  });
});
