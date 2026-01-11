const { sanitizeRoom } = require('../src/server/managers/broadcastManager');

const makeRoom = () => ({
  code: 'ABCD',
  phase: 'day',
  phaseStep: null,
  dayCount: 1,
  players: {},
  hostId: 'p1',
  minPlayers: 5,
  roleConfig: {},
  lovers: null,
  witchState: { healAvailable: true, poisonAvailable: true },
  wolfVotes: {},
  wolfTarget: null,
  nextNightStep: null,
  phaseTransition: null,
  logs: [],
  voteState: { votes: {}, revoteFromTie: null },
  lastNightDeaths: [],
  awaitingHunterShot: null,
  winner: null
});

describe('broadcastManager', () => {
  test('sanitizeRoom hides roles and uses public logs for alive viewers', () => {
    const room = makeRoom();
    room.players = {
      p1: { id: 'p1', name: 'Alice', role: 'villager', team: 'village', alive: true, connected: true, isHost: true, ready: false },
      p2: { id: 'p2', name: 'Bob', role: 'werewolf', team: 'wolves', alive: true, connected: true, isHost: false, ready: false }
    };
    room.logs.push({ ts: 1, text: 'Full log', publicText: 'Public log' });

    const view = sanitizeRoom(room, 'p1');

    const playerSelf = view.players.find((p) => p.id === 'p1');
    const playerOther = view.players.find((p) => p.id === 'p2');
    expect(playerSelf.role).toBe('villager');
    expect(playerOther.role).toBeNull();
    expect(view.logs[0].text).toBe('Public log');

    room.phase = 'ended';
    const endedView = sanitizeRoom(room, 'p1');
    const endedOther = endedView.players.find((p) => p.id === 'p2');
    expect(endedOther.role).toBe('werewolf');
  });

  test('sanitizeRoom exposes lover info to linked players', () => {
    const room = makeRoom();
    room.players = {
      p1: { id: 'p1', name: 'Alice', role: 'villager', team: 'village', alive: true, connected: true, isHost: true, ready: false },
      p2: { id: 'p2', name: 'Bob', role: 'villager', team: 'village', alive: true, connected: true, isHost: false, ready: false },
      p3: { id: 'p3', name: 'Cara', role: 'villager', team: 'village', alive: true, connected: true, isHost: false, ready: false }
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
