import { test, expect } from '@playwright/test';
import {
  advanceToDay,
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
  voteAllForTarget,
  findMayorPromptPage,
  submitMayorSelection
} from './helpers';

test('village wins after the last werewolf is eliminated', async ({ browser }) => {
  const names = ['Werewolf', 'Villager A', 'Villager B', 'Villager C', 'Villager D'];
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
      joker: 0
    });

    await startGameAndReady(pages);
    const advanceResult = await advanceToDay(host, pages, { wolfTargetName: names[1] });
    const dayPage = advanceResult.dayPage || host;

    await voteAllForTarget(players, names[0]);

    // Handle potential mayor selection if the werewolf was mayor
    for (let i = 0; i < 10; i++) {
      const mayorPage = await findMayorPromptPage(pages);
      if (mayorPage) {
        await submitMayorSelection(mayorPage);
      }

      const gameOver = await dayPage.locator('h2:has-text("Game Over")').isVisible().catch(() => false);
      if (gameOver) break;

      // Also check for skip button if host needs to skip
      const skipBtn = host.locator('#skip-mayor-selection');
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click();
      }

      await dayPage.waitForTimeout(500);
    }

    await dayPage.waitForSelector('h2:has-text("Game Over")', { timeout: 20000 });
    const panel = dayPage.locator('section.panel:has(h2:has-text("Game Over"))');
    await expect(panel).toContainText('Winner: VILLAGE');
  } finally {
    await closeContexts(contexts);
  }
});

test('wolves win when they reach parity', async ({ browser }) => {
  const names = ['Werewolf A', 'Werewolf B', 'Villager A', 'Villager B', 'Villager C'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 2,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0,
      passiveRoles: { mayor: false }
    });

    await startGameAndReady(pages);
    await advanceToDay(host, pages, { wolfTargetName: names[2] });

    await host.waitForSelector('h2:has-text("Game Over")', { timeout: 20000 });
    const panel = host.locator('section.panel:has(h2:has-text("Game Over"))');
    await expect(panel).toContainText('Winner: WOLVES');
  } finally {
    await closeContexts(contexts);
  }
});

test('joker wins when voted out during the day', async ({ browser }) => {
  const names = ['Werewolf', 'Joker', 'Villager A', 'Villager B', 'Villager C'];
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
      joker: 1
    });

    await startGameAndReady(pages);
    const advanceResult = await advanceToDay(host, pages, { wolfTargetName: names[2] });
    const dayPage = advanceResult.dayPage || host;

    await voteAllForTarget(players, names[1]);

    // Handle potential mayor selection if the joker was mayor
    for (let i = 0; i < 10; i++) {
      const mayorPage = await findMayorPromptPage(pages);
      if (mayorPage) {
        await submitMayorSelection(mayorPage);
      }

      const gameOver = await dayPage.locator('h2:has-text("Game Over")').isVisible().catch(() => false);
      if (gameOver) break;

      // Also check for skip button if host needs to skip
      const skipBtn = host.locator('#skip-mayor-selection');
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click();
      }

      await dayPage.waitForTimeout(500);
    }

    await dayPage.waitForSelector('h2:has-text("Game Over")', { timeout: 20000 });
    const panel = dayPage.locator('section.panel:has(h2:has-text("Game Over"))');
    await expect(panel).toContainText('Winner: JOKER');
  } finally {
    await closeContexts(contexts);
  }
});
