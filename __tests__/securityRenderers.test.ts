import type { RoomView } from '../src/shared/types';

const mockState = {
  room: null as RoomView | null
};

jest.mock('../client/src/state/gameState', () => ({
  state: mockState
}));

import { renderLogsPanel, renderPlayersPanel } from '../client/src/renderers/commonRenderers';

const baseRoom = (): RoomView => ({
  code: 'ABCD',
  phase: 'lobby',
  phaseStep: null,
  dayCount: 0,
  players: [],
  hostId: null,
  minPlayers: 5,
  roleConfig: {
    werewolf: 1,
    seer: 0,
    hunter: 0,
    witch: 0,
    armor: 0,
    joker: 0
  },
  passiveRoleConfig: { mayor: true },
  mayorId: null,
  awaitingMayorSelection: false,
  mayorSelectionPending: false,
  loversKnown: false,
  loversAssigned: false,
  loverName: null,
  witchState: { healAvailable: null, poisonAvailable: null },
  wolfVotes: null,
  wolfTarget: null,
  wolfPeers: [],
  nextNightStep: null,
  phaseTransition: null,
  seerResult: null,
  voteState: { yourVote: undefined, submitted: 0, required: 0, revoteFromTie: null },
  lastNightDeaths: [],
  lastDayDeaths: [],
  lastDayMessage: null,
  awaitingHunterShot: false,
  hunterShotPending: false,
  hunterShotEndsAt: null,
  winner: null,
  logs: [],
  self: null
});

describe('security rendering', () => {
  test('renderPlayersPanel escapes player names', () => {
    mockState.room = {
      ...baseRoom(),
      players: [
        {
          id: 'p1',
          name: '<img src=x onerror=alert(1)>',
          alive: true,
          connected: true,
          isHost: false,
          role: null
        }
      ]
    };

    const html = renderPlayersPanel();
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  test('renderLogsPanel escapes log text', () => {
    mockState.room = {
      ...baseRoom(),
      logs: [
        {
          ts: 1,
          text: '<script>alert("x")</script>'
        }
      ]
    };

    const html = renderLogsPanel();
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
  });
});
