import { test, expect } from '@playwright/test';
import { closeContexts, configureRoles, createLobbyWithPlayers } from './helpers';

test('precheck blocks starting when there is no werewolf', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 0,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0
    });

    await host.waitForTimeout(600);
    await host.waitForSelector('#start-game', { timeout: 10000 });

    const dialogPromise = new Promise<string>((resolve) => {
      host.once('dialog', (dialog) => {
        const message = dialog.message();
        dialog.accept();
        resolve(message);
      });
    });

    await host.locator('#start-game').click({ force: true });
    const message = await dialogPromise;
    expect(message).toBe('Need at least 1 Werewolf');
  } finally {
    await closeContexts(contexts);
  }
});

test('precheck blocks starting when role count exceeds players', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 6,
      seer: 1,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0
    });

    await host.waitForTimeout(600);
    await host.waitForSelector('#start-game', { timeout: 10000 });

    const dialogPromise = new Promise<string>((resolve) => {
      host.once('dialog', (dialog) => {
        const message = dialog.message();
        dialog.accept();
        resolve(message);
      });
    });

    await host.locator('#start-game').click({ force: true });
    const message = await dialogPromise;
    expect(message).toBe('Role count exceeds players');
  } finally {
    await closeContexts(contexts);
  }
});
