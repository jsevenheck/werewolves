import { test, expect } from '@playwright/test';
import { closeContexts, createLobbyWithPlayers } from './helpers';

test('resume with invalid token clears session and stays on landing', async ({ browser }) => {
  const names = ['Host', 'Guest'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [, guest] = pages;

  const staleContext = await browser.newContext();
  contexts.push(staleContext);

  try {
    await guest.waitForSelector('h2:has-text("Lobby")');
    await guest.waitForFunction(() => localStorage.getItem('werewolves.session'));
    const rawSession = await guest.evaluate(() => localStorage.getItem('werewolves.session'));
    expect(rawSession).not.toBeNull();
    const parsed = JSON.parse(rawSession || 'null');
    const badSession = { ...parsed, resumeToken: 'invalid-token' };

    await staleContext.addInitScript((payload) => {
      localStorage.setItem('werewolves.session', JSON.stringify(payload));
    }, badSession);

    const page = await staleContext.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await page.waitForSelector('#create-form', { timeout: 10000 });
    await expect(page.locator('#resume-btn')).toHaveCount(0);
    const cleared = await page.evaluate(() => localStorage.getItem('werewolves.session'));
    expect(cleared).toBeNull();
  } finally {
    await closeContexts(contexts);
  }
});
