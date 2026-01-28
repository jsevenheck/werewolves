import { test, expect } from '@playwright/test';
import {
  advanceToDay,
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
  waitForDayOnAllPages
} from './helpers';

test('host can start a 5-player game and reach day', async ({ browser }) => {
  const names = ['Host', 'Player 2', 'Player 3', 'Player 4', 'Player 5'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0
    });

    await startGameAndReady(pages);
    const advanceResult = await advanceToDay(host, pages);
    await waitForDayOnAllPages(pages);

    const dayPage = advanceResult.dayPage || host;
    await dayPage.waitForSelector('h3:has-text("Night Report")', { timeout: 15000 });
    const voteForm = dayPage.locator('#vote-form');
    if (await voteForm.count()) {
      await expect(voteForm).toBeVisible();
    } else {
      await expect(dayPage.locator('text=You are dead')).toBeVisible();
    }
  } finally {
    await closeContexts(contexts);
  }
});
