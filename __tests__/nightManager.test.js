jest.mock('../src/server/managers/phaseManager', () => ({
  scheduleNightStep: jest.fn(),
  schedulePhaseTransition: jest.fn()
}));

jest.mock('../src/server/managers/deathManager', () => ({
  queueDeath: jest.fn(),
  resolveDeaths: jest.fn()
}));

const { scheduleNightStep, schedulePhaseTransition } = require('../src/server/managers/phaseManager');
const { queueDeath, resolveDeaths } = require('../src/server/managers/deathManager');
const { tryFinalizeWolfVote, handleWitchDecision, resolveNight } = require('../src/server/managers/nightManager');

const makeRoom = () => ({
  players: {},
  wolfVotes: {},
  wolfTarget: null,
  witchState: { healAvailable: true, poisonAvailable: true },
  healedTarget: null,
  poisonTarget: null,
  phase: 'night',
  phaseStep: 'wolves',
  winner: null,
  awaitingHunterShot: null
});

describe('nightManager', () => {
  test('tryFinalizeWolfVote picks a tied target and advances', () => {
    const room = makeRoom();
    room.players = {
      w1: { id: 'w1', role: 'werewolf', alive: true },
      w2: { id: 'w2', role: 'werewolf', alive: true },
      v1: { id: 'v1', role: 'villager', alive: true },
      v2: { id: 'v2', role: 'villager', alive: true }
    };
    room.wolfVotes = { w1: 'v1', w2: 'v2' };
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    tryFinalizeWolfVote(room, jest.fn());

    expect(room.wolfTarget).toBe('v1');
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'seer', expect.any(Function));
    randomSpy.mockRestore();
  });

  test('tryFinalizeWolfVote advances when no wolves are alive', () => {
    const room = makeRoom();
    room.players = {
      v1: { id: 'v1', role: 'villager', alive: true }
    };

    tryFinalizeWolfVote(room, jest.fn());

    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'seer', expect.any(Function));
  });

  test('handleWitchDecision uses heal potion and advances', () => {
    const room = makeRoom();
    room.wolfTarget = 'v1';

    handleWitchDecision(room, 'heal', null, jest.fn());

    expect(room.witchState.healAvailable).toBe(false);
    expect(room.healedTarget).toBe('v1');
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'resolve', expect.any(Function));
  });

  test('handleWitchDecision uses poison potion and advances', () => {
    const room = makeRoom();
    room.players = { v2: { id: 'v2', role: 'villager', alive: true } };

    handleWitchDecision(room, 'poison', 'v2', jest.fn());

    expect(room.witchState.poisonAvailable).toBe(false);
    expect(room.poisonTarget).toBe('v2');
    expect(scheduleNightStep).toHaveBeenCalledWith(room, 'resolve', expect.any(Function));
  });

  test('resolveNight queues deaths, resolves, and transitions', () => {
    const room = makeRoom();
    room.wolfTarget = 'v1';
    room.poisonTarget = 'v2';

    resolveNight(room, jest.fn());

    expect(queueDeath).toHaveBeenCalledWith(room, 'v1', 'eaten by Werewolves');
    expect(queueDeath).toHaveBeenCalledWith(room, 'v2', 'poisoned by Witch');
    expect(resolveDeaths).toHaveBeenCalledWith(room, 'night', expect.any(Function), undefined);
    expect(room.healedTarget).toBeNull();
    expect(room.poisonTarget).toBeNull();
    expect(schedulePhaseTransition).toHaveBeenCalledWith(room, 'nightToDay', expect.any(Function));
  });
});
