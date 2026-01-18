import { test, expect } from '@playwright/test';
import {
  advanceToDay,
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
  voteAllForTarget
} from './helpers';

test('village wins after the last werewolf is eliminated', async ({ browser }) => {
  const names = ['Werewolf', 'Villager A', 'Villager B', 'Villager C'];
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
      minPlayers: 4
    });

    await startGameAndReady(pages);
    const advanceResult = await advanceToDay(host, pages, { wolfTargetName: names[1] });
    const dayPage = advanceResult.dayPage || host;

    await voteAllForTarget(players, names[0]);

    await dayPage.waitForSelector('h2:has-text("Game Over")', { timeout: 20000 });
    const panel = dayPage.locator('section.panel:has(h2:has-text("Game Over"))');
    await expect(panel).toContainText('Winner: VILLAGE');
  } finally {
    await closeContexts(contexts);
  }
});

test('wolves win when they reach parity', async ({ browser }) => {
  const names = ['Werewolf', 'Villager A', 'Villager B'];
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
      minPlayers: 3
    });

    await startGameAndReady(pages);
    await advanceToDay(host, pages, { wolfTargetName: names[1] });

    await host.waitForSelector('h2:has-text("Game Over")', { timeout: 20000 });
    const panel = host.locator('section.panel:has(h2:has-text("Game Over"))');
    await expect(panel).toContainText('Winner: WOLVES');
  } finally {
    await closeContexts(contexts);
  }
});

test('joker wins when voted out during the day', async ({ browser }) => {
  const names = ['Werewolf', 'Joker', 'Villager A', 'Villager B'];
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
      joker: 1,
      minPlayers: 4
    });

    await startGameAndReady(pages);
    const advanceResult = await advanceToDay(host, pages, { wolfTargetName: names[2] });
    const dayPage = advanceResult.dayPage || host;

    await voteAllForTarget(players, names[1]);

    await dayPage.waitForSelector('h2:has-text("Game Over")', { timeout: 20000 });
    const panel = dayPage.locator('section.panel:has(h2:has-text("Game Over"))');
    await expect(panel).toContainText('Winner: JOKER');
  } finally {
    await closeContexts(contexts);
  }
});
