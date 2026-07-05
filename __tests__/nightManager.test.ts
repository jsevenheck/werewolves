import { scheduleNightStep, schedulePhaseTransition } from '../server/src/managers/phaseManager';
import { queueDeath, resolveDeaths } from '../server/src/managers/deathManager';
import {
  tryFinalizeWolfVote,
  handleWitchDecision,
  resolveNight,
} from '../server/src/managers/nightManager';
import { NIGHT_RESOLVE_DELAY_MS } from '../server/src/config/constants';
import type { Player, Room, RoleConfig } from '../core/src/types';

vi.mock('../server/src/managers/phaseManager', () => ({
  scheduleNightStep: vi.fn(),
  schedulePhaseTransition: vi.fn(),
}));

vi.mock('../server/src/managers/deathManager', () => ({
  queueDeath: vi.fn(),
  resolveDeaths: vi.fn(),
}));

const makeRoom = (): Room => ({
  code: 'ABCD',
  hostId: 'w1',
  phase: 'night',
  phaseStep: 'wolves',
  dayCount: 0,
  players: {},
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
  nextNightStep: null,
  phaseTransition: null,
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

describe('nightManager', () => {
  test('tryFinalizeWolfVote picks a tied target and advances', () => {
    const room = makeRoom();
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'werewolf', team: 'wolves', alive: true }),
      w2: buildPlayer({ id: 'w2', role: 'werewolf', team: 'wolves', alive: true }),
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
      v2: buildPlayer({ id: 'v2', role: 'villager', team: 'village', alive: true }),
    };
    room.wolfVotes = { w1: 'v1', w2: 'v2' };
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    tryFinalizeWolfVote(room, vi.fn(), undefined as never);

    expect(room.wolfTarget).toBe('v1');
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'seer', expect.any(Function), undefined);
    randomSpy.mockRestore();
  });

  test('tryFinalizeWolfVote advances when no wolves are alive', () => {
    const room = makeRoom();
    room.players = {
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
    };

    tryFinalizeWolfVote(room, vi.fn(), undefined as never);

    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'seer', expect.any(Function), undefined);
  });

  test('handleWitchDecision uses heal potion and advances', () => {
    const room = makeRoom();
    room.wolfTarget = 'v1';
    room.players = {
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
    };

    handleWitchDecision(room, 'w1', 'heal', null, vi.fn(), undefined as never);

    expect(room.witchState.healAvailable).toBe(false);
    expect(room.healedTarget).toBe('v1');
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'guard', expect.any(Function), undefined);
  });

  test('handleWitchDecision does not consume heal when wolf target is invalid', () => {
    const room = makeRoom();
    room.wolfTarget = 'v1';
    room.players = {
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: false }),
    };
    const broadcastRoom = vi.fn();

    handleWitchDecision(room, 'w1', 'heal', null, broadcastRoom, undefined as never);

    expect(room.witchState.healAvailable).toBe(true);
    expect(room.healedTarget).toBeNull();
    expect(broadcastRoom).not.toHaveBeenCalled();
    expect(scheduleNightStep).not.toHaveBeenCalled();
  });

  test('handleWitchDecision keeps witch step open when poison remains', () => {
    const room = makeRoom();
    room.wolfTarget = 'v1';
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'witch', team: 'village', alive: true }),
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
    };
    const broadcastRoom = vi.fn();

    handleWitchDecision(room, 'w1', 'heal', null, broadcastRoom, undefined as never);

    expect(room.witchState.healAvailable).toBe(false);
    expect(room.witchState.poisonAvailable).toBe(true);
    expect(room.healedTarget).toBe('v1');
    expect(scheduleNightStep).not.toHaveBeenCalled();
    expect(broadcastRoom).toHaveBeenCalledWith(room);
  });

  test('handleWitchDecision keeps witch step open when heal remains', () => {
    const room = makeRoom();
    room.wolfTarget = 'v1';
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'witch', team: 'village', alive: true }),
      v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
    };
    const broadcastRoom = vi.fn();

    handleWitchDecision(room, 'w1', 'poison', 'v1', broadcastRoom, undefined as never);

    expect(room.witchState.poisonAvailable).toBe(false);
    expect(room.witchState.healAvailable).toBe(true);
    expect(room.poisonTarget).toBe('v1');
    expect(scheduleNightStep).not.toHaveBeenCalled();
    expect(broadcastRoom).toHaveBeenCalledWith(room);
  });

  test('handleWitchDecision uses poison potion and advances', () => {
    const room = makeRoom();
    room.players = {
      v2: buildPlayer({ id: 'v2', role: 'villager', team: 'village', alive: true }),
    };

    handleWitchDecision(room, 'w1', 'poison', 'v2', vi.fn(), undefined as never);

    expect(room.witchState.poisonAvailable).toBe(false);
    expect(room.poisonTarget).toBe('v2');
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'guard', expect.any(Function), undefined);
  });

  test('handleWitchDecision rejects the witch poisoning herself', () => {
    const room = makeRoom();
    room.players = {
      w1: buildPlayer({ id: 'w1', role: 'witch', team: 'village', alive: true }),
      v2: buildPlayer({ id: 'v2', role: 'villager', team: 'village', alive: true }),
    };

    handleWitchDecision(room, 'w1', 'poison', 'w1', vi.fn(), undefined as never);

    expect(room.witchState.poisonAvailable).toBe(true);
    expect(room.poisonTarget).toBeNull();
  });

  test('resolveNight queues deaths, resolves, and transitions', () => {
    vi.useFakeTimers();
    try {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.wolfTarget = 'v1';
      room.poisonTarget = 'v2';

      resolveNight(room, vi.fn(), undefined as never);

      expect(queueDeath).toHaveBeenCalledWith(room, 'v1', 'eaten by Werewolves');
      expect(queueDeath).toHaveBeenCalledWith(room, 'v2', 'poisoned by Witch');
      expect(resolveDeaths).toHaveBeenCalledWith(room, 'night', expect.any(Function), undefined);
      expect(room.healedTarget).toBeNull();
      expect(room.poisonTarget).toBeNull();
      vi.advanceTimersByTime(NIGHT_RESOLVE_DELAY_MS);
      expect(schedulePhaseTransition).toHaveBeenCalledWith(
        room,
        'nightToDay',
        expect.any(Function)
      );
    } finally {
      vi.useRealTimers();
    }
  });

  describe('Guard protection', () => {
    test('guard protection blocks wolf kill', () => {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.wolfTarget = 'v1';
      room.guardedTarget = 'v1';
      room.players = {
        v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
      };

      resolveNight(room, vi.fn(), undefined as never);

      expect(queueDeath).not.toHaveBeenCalledWith(room, 'v1', 'eaten by Werewolves');
    });

    test('guard protection blocks witch poison', () => {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.poisonTarget = 'v1';
      room.guardedTarget = 'v1';
      room.players = {
        v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
      };

      resolveNight(room, vi.fn(), undefined as never);

      expect(queueDeath).not.toHaveBeenCalledWith(room, 'v1', 'poisoned by Witch');
    });

    test('wolf kills player when guard protects someone else', () => {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.wolfTarget = 'v1';
      room.guardedTarget = 'v2';
      room.players = {
        v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
        v2: buildPlayer({ id: 'v2', role: 'villager', team: 'village', alive: true }),
      };

      resolveNight(room, vi.fn(), undefined as never);

      expect(queueDeath).toHaveBeenCalledWith(room, 'v1', 'eaten by Werewolves');
    });
  });

  describe('Harlot additional death', () => {
    test('harlot dies when visiting wolf victim', () => {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.wolfTarget = 'v1';
      room.harlotVisitedTarget = 'v1';
      room.players = {
        v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
        h1: buildPlayer({ id: 'h1', role: 'harlot', team: 'village', alive: true }),
      };

      resolveNight(room, vi.fn(), undefined as never);

      expect(queueDeath).toHaveBeenCalledWith(room, 'v1', 'eaten by Werewolves');
      expect(queueDeath).toHaveBeenCalledWith(room, 'h1', 'caught visiting the victim');
    });

    test('harlot survives when visiting someone else', () => {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.wolfTarget = 'v1';
      room.harlotVisitedTarget = 'v2';
      room.players = {
        v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
        v2: buildPlayer({ id: 'v2', role: 'villager', team: 'village', alive: true }),
        h1: buildPlayer({ id: 'h1', role: 'harlot', team: 'village', alive: true }),
      };

      resolveNight(room, vi.fn(), undefined as never);

      expect(queueDeath).toHaveBeenCalledWith(room, 'v1', 'eaten by Werewolves');
      expect(queueDeath).not.toHaveBeenCalledWith(room, 'h1', expect.any(String));
    });

    test('harlot dies when attacked directly by wolves', () => {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.wolfTarget = 'h1';
      room.harlotVisitedTarget = 'v1';
      room.players = {
        v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
        h1: buildPlayer({ id: 'h1', role: 'harlot', team: 'village', alive: true }),
      };

      resolveNight(room, vi.fn(), undefined as never);

      expect(queueDeath).toHaveBeenCalledWith(room, 'h1', 'eaten by Werewolves');
      // Should not trigger "caught visiting" because harlot didn't visit the wolf victim
      expect(queueDeath).not.toHaveBeenCalledWith(room, 'h1', 'caught visiting the victim');
    });

    test('harlot survives when wolf kill is prevented by guard', () => {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.wolfTarget = 'v1';
      room.guardedTarget = 'v1';
      room.harlotVisitedTarget = 'v1';
      room.players = {
        v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
        h1: buildPlayer({ id: 'h1', role: 'harlot', team: 'village', alive: true }),
      };

      resolveNight(room, vi.fn(), undefined as never);

      // Wolf kill was prevented by guard
      expect(queueDeath).not.toHaveBeenCalledWith(room, 'v1', 'eaten by Werewolves');
      // Harlot should not die because the kill was prevented
      expect(queueDeath).not.toHaveBeenCalledWith(room, 'h1', 'caught visiting the victim');
    });

    test('harlot survives when wolf kill is prevented by witch heal', () => {
      const room = makeRoom();
      room.phaseStep = 'resolve';
      room.wolfTarget = 'v1';
      room.healedTarget = 'v1';
      room.harlotVisitedTarget = 'v1';
      room.players = {
        v1: buildPlayer({ id: 'v1', role: 'villager', team: 'village', alive: true }),
        h1: buildPlayer({ id: 'h1', role: 'harlot', team: 'village', alive: true }),
      };

      resolveNight(room, vi.fn(), undefined as never);

      // Wolf kill was prevented by witch heal
      expect(queueDeath).not.toHaveBeenCalledWith(room, 'v1', 'eaten by Werewolves');
      // Harlot should not die because the kill was prevented
      expect(queueDeath).not.toHaveBeenCalledWith(room, 'h1', 'caught visiting the victim');
    });
  });
});
