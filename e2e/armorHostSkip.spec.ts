import { test } from '@playwright/test';
import { closeContexts, configureRoles, createLobbyWithPlayers, startGameAndReady } from './helpers';

test('host can skip armor selection', async ({ browser }) => {
  const names = ['Host', 'Player 2', 'Player 3', 'Player 4'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      armor: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      joker: 0,
      minPlayers: 4
    });
    await startGameAndReady(pages);
    await host.waitForSelector('#skip-armor', { timeout: 15000 });
    await host.click('#skip-armor');
    await host.waitForSelector('h2:has-text("Night Phase")', { timeout: 15000 });
  } finally {
    await closeContexts(contexts);
  }
});
