import { test, expect } from '@playwright/test';
import { closeContexts, createLobbyWithPlayers } from './helpers';

test('player can resume session after reconnect', async ({ browser }) => {
  const names = ['Host', 'Player 2'];
  const { contexts, pages, code } = await createLobbyWithPlayers(browser, names);
  const [host, guest] = pages;
  const [, guestContext] = contexts;

  try {
    await host.waitForSelector('h2:has-text("Lobby")');
    await guest.waitForSelector('h2:has-text("Lobby")');
    await guest.waitForFunction(() => localStorage.getItem('werewolves.session'));
    await guest.close();

    const resumed = await guestContext.newPage();
    await resumed.goto('/');
    const roomHeader = resumed.locator(`text=Room ${code}`);
    const autoResumed = await roomHeader
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!autoResumed) {
      await resumed.waitForSelector('#resume-btn', { timeout: 10000 });
      await resumed.click('#resume-btn');
      await roomHeader.waitFor({ state: 'visible', timeout: 10000 });
    }
    await expect(resumed.locator('.players-list')).toContainText('Player 2');
  } finally {
    await closeContexts(contexts);
  }
});
