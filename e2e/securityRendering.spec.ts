import { test, expect } from '@playwright/test';
import { closeContexts, createLobbyWithPlayers } from './helpers';

test('escapes player names and log messages', async ({ browser }) => {
  const maliciousName = '<img src=x>';
  const { contexts, pages } = await createLobbyWithPlayers(browser, ['Host', maliciousName]);
  const [host] = pages;

  try {
    const playersList = host.locator('.players-list');
    await expect(playersList).toContainText(maliciousName);
    await expect(playersList.locator('img')).toHaveCount(0);

    await contexts[1].close();

    const logs = host.locator('.logs');
    await expect(logs).toContainText(`${maliciousName} disconnected.`, { timeout: 10000 });
    await expect(logs.locator('img')).toHaveCount(0);
  } finally {
    await closeContexts(contexts);
  }
});
