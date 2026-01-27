import type { RoomView } from '../src/shared/types';

const mockState = {
  room: null as RoomView | null,
  roleVisible: false,
  playerName: 'Alice'
};

jest.mock('../client/src/state/gameState', () => ({
  state: mockState
}));

jest.mock('../client/src/config/constants', () => ({
  ROLE_DETAILS: {}
}));

jest.mock('../client/src/utils/helpers', () => ({
  escapeHtml: (value: string) => value,
  formatPhase: () => 'Day'
}));

jest.mock('../client/src/utils/narrator', () => ({
  narrator: {
    isEnabled: jest.fn(() => true),
    isUnlocked: jest.fn(() => false)
  }
}));

import { renderHeader } from '../client/src/renderers/commonRenderers';

describe('commonRenderers narrator label', () => {
  beforeEach(() => {
    mockState.room = {
      code: 'ABCD',
      phase: 'day',
      phaseStep: null,
      dayCount: 1,
      players: [],
      hostId: null,
      minPlayers: 5,
      roleConfig: {
        werewolf: 1,
        seer: 1,
        hunter: 0,
        witch: 0,
        armor: 0,
        joker: 0,
        guard: 0
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
      guardedTarget: null,
      lastGuardedTarget: null,
      nextNightStep: null,
      phaseTransition: null,
      seerResult: null,
      voteState: {
        revoteFromTie: null,
        submitted: 0,
        required: 0,
        yourVote: null
      },
      lastNightDeaths: [],
      lastDayDeaths: [],
      lastDayMessage: null,
      awaitingHunterShot: false,
      hunterShotPending: false,
      winner: null,
      logs: [],
      self: null
    } as RoomView;
  });

  test('shows tap-to-enable label when enabled but locked', () => {
    const html = renderHeader();
    expect(html).toContain('Narrator: Tap to enable audio');
  });
});
