import { test, expect } from '@playwright/test';
import {
  advanceToDay,
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  ensureHunterOverlay,
  proceedToNightIfAvailable,
  reconnectPage,
  startGameAndReady,
  submitHunterShot,
  voteAllForTarget,
  waitForDayOnAllPages
} from './helpers';

test('hunter prompt allows a follow-up shot', async ({ browser }) => {
  const names = ['Host', 'Player 2', 'Player 3', 'Player 4', 'Player 5'];
  const { contexts, pages, code } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;
  const players = pages.map((page, index) => ({ page, name: names[index] }));

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 1,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0
    });

    await startGameAndReady(pages);
    const hunterPlayer = players[1];
    const safeTarget = players[2]?.name || players[3]?.name || players[4]?.name;
    const advanceResult = await advanceToDay(host, pages, {
      allowHunterStop: true,
      wolfTargetName: safeTarget
    });

    if (!advanceResult.hunterShot && !advanceResult.gameOver) {
      const dayPage = advanceResult.dayPage || host;
      await waitForDayOnAllPages(pages);
      await reconnectPage(hunterPlayer.page, code);
      await voteAllForTarget(players, hunterPlayer.name);
      await dayPage.waitForSelector(`text=${hunterPlayer.name} was voted out`, { timeout: 20000 });
      const overlayReady = await ensureHunterOverlay(hunterPlayer.page, code);
      expect(overlayReady).toBe(true);
      await submitHunterShot(hunterPlayer.page);
      // After hunter shot, proceed to night if game didn't end
      await proceedToNightIfAvailable(host);
    }

    const resultPage = advanceResult.dayPage || host;
    await resultPage.waitForSelector('text=shot by Hunter', { timeout: 20000 });
  } finally {
    await closeContexts(contexts);
  }
});
