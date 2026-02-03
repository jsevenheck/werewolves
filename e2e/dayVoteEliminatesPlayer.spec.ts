import { test, expect } from '@playwright/test';
import {
  advanceToDay,
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  getAliveNames,
  proceedToNightIfAvailable,
  startGameAndReady,
  voteAllForTarget,
  waitForDayOnAllPages,
} from './helpers';

test('day vote eliminates a player', async ({ browser }) => {
  const names = ['Host', 'Player 2', 'Player 3', 'Player 4', 'Player 5'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;
  const players = pages.map((page, index) => ({ page, name: names[index] }));

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0,
    });

    await startGameAndReady(pages);
    const advanceResult = await advanceToDay(host, pages);
    await waitForDayOnAllPages(pages);

    const dayPage = advanceResult.dayPage || host;
    const aliveNames = await getAliveNames(dayPage);
    expect(aliveNames.length).toBeGreaterThan(1);
    const [targetName] = aliveNames;
    if (!targetName) {
      throw new Error('Expected at least one alive player to vote out.');
    }

    await voteAllForTarget(players, targetName);
    await dayPage.waitForSelector('text=was voted out', { timeout: 10000 });

    // Host proceeds to night if game didn't end (e.g., if wolf was voted out, game ends)
    await proceedToNightIfAvailable(host);
  } finally {
    await closeContexts(contexts);
  }
});
