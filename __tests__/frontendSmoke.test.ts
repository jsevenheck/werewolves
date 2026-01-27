import type { RoomView } from '../src/shared/types';

const mockState = {
  pendingVote: 'p2',
  playerId: 'p1'
};

jest.mock('../client/src/state/gameState', () => ({
  state: mockState
}));

jest.mock('../client/src/config/constants', () => ({
  ROLE_DETAILS: {}
}));

jest.mock('../client/src/utils/helpers', () => ({
  getPlayerName: (room: RoomView, id: string) => room.players.find((p) => p.id === id)?.name || 'Unknown',
  escapeHtml: (value: string) => value
}));

import { bindPhaseHandlers } from '../client/src/handlers/phaseHandlers';
import { renderDaySection } from '../client/src/renderers/phaseRenderers';

describe('frontend smoke', () => {
  test('phaseHandlers module parses and exports bindPhaseHandlers', () => {
    expect(typeof bindPhaseHandlers).toBe('function');
  });

  test('renderDaySection keeps pending vote in dropdown without confirmation', () => {
    const room = {
      code: 'ABCD',
      phase: 'day',
      phaseStep: null,
      dayCount: 1,
      players: [
        { id: 'p1', name: 'Alice', alive: true, connected: true, isHost: false, role: null },
        { id: 'p2', name: 'Bob', alive: true, connected: true, isHost: false, role: null }
      ],
      hostId: 'p1',
      minPlayers: 5,
      roleConfig: { werewolf: 1, seer: 0, hunter: 0, witch: 0, armor: 0, joker: 0, guard: 0 },
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
      voteState: { yourVote: undefined, submitted: 0, required: 2, revoteFromTie: null },
      lastNightDeaths: [],
      lastDayDeaths: [],
      lastDayMessage: null,
      awaitingHunterShot: false,
      hunterShotPending: false,
      winner: null,
      logs: [],
      self: { id: 'p1', role: null, team: null, alive: true }
    } as RoomView;

    const html = renderDaySection(room, { alive: true, id: 'p1', role: null, team: null });
    expect(html).toContain('<form id="vote-form"');
    expect(html).not.toContain('Vote submitted');
    expect(html).toContain('<option value="p2" selected>Bob</option>');
  });
});
