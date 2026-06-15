import { test, expect } from '@playwright/test';
import { closeContexts, createLobbyWithPlayers } from './helpers';

test('player can switch language to German and see translated labels', async ({ browser }) => {
  const names = ['Host', 'Player 2'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await host.waitForSelector('h2:has-text("Lobby")');

    await expect(host.locator('text=Share this code')).toBeVisible();
    await expect(host.locator('text=Configured roles:')).toBeVisible();
    await expect(host.locator('text=Minimum players to start:')).toBeVisible();

    const languageSelect = host.locator('select[name="locale"]');
    await expect(languageSelect).toBeVisible();
    await languageSelect.selectOption('de');

    await expect(host.locator('text=Teile diesen Code')).toBeVisible();
    await expect(host.locator('text=Konfigurierte Rollen:')).toBeVisible();
    await expect(host.locator('text=Mindestanzahl Spieler zum Starten:')).toBeVisible();
  } finally {
    await closeContexts(contexts);
  }
});

test('language choice persists across reloads', async ({ browser }) => {
  const names = ['Host', 'Player 2'];
  const { contexts, pages, code } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await host.waitForSelector('h2:has-text("Lobby")');

    const languageSelect = host.locator('select[name="locale"]');
    await languageSelect.selectOption('de');

    await expect(host.locator('text=Teile diesen Code')).toBeVisible();

    await host.reload();

    await host.waitForSelector('h2:has-text("Lobby")');
    await expect(host.locator('text=Teile diesen Code')).toBeVisible();
    await expect(host.locator('text=Share this code')).not.toBeVisible();

    const roomHeader = host.locator(`text=Raum ${code}`);
    await expect(roomHeader).toBeVisible();
  } finally {
    await closeContexts(contexts);
  }
});
