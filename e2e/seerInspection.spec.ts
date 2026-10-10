import { test, expect } from '@playwright/test';
import {
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
  completeMayorElection,
  reconnectPage,
} from './helpers';

test('seer can inspect and see the result', async ({ browser }) => {
  const names = ['Werewolf', 'Seer', 'Villager A', 'Villager B', 'Villager C'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host, seer] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 1,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0,
    });

    await startGameAndReady(pages);

    await completeMayorElection(host, pages);

    await host.waitForSelector('#wolf-form', { timeout: 10000 });
    await host.locator('#wolf-form select[name="target"]').selectOption({ label: names[2] });
    await host.locator('#wolf-form button[type="submit"]').click();

    await seer.waitForSelector('#seer-form', { timeout: 10000 });
    await seer.locator('#seer-form select[name="target"]').selectOption({ label: names[0] });
    await seer.locator('#seer-form button[type="submit"]').click();

    await seer.locator('.seer-result-overlay').waitFor({ state: 'visible', timeout: 10000 });
    await seer.locator('.seer-result-btn').click();

    await seer.locator('#seer-form').waitFor({ state: 'detached', timeout: 10000 });
    const toggleRole = seer.locator('#toggle-role');
    await toggleRole.waitFor({ state: 'visible', timeout: 10000 });
    for (let i = 0; i < 5; i += 1) {
      try {
        await toggleRole.click();
        break;
      } catch {
        await seer.waitForTimeout(200);
      }
    }
    await expect(seer.locator('.role-card')).toContainText(`Last vision: ${names[0]} is Werewolf`);
  } finally {
    await closeContexts(contexts);
  }
});

test('seer can restore and dismiss a pending result after reload', async ({ browser }) => {
  const names = ['Werewolf', 'Seer', 'Villager A', 'Villager B', 'Villager C'];
  const { contexts, pages, code } = await createLobbyWithPlayers(browser, names);
  const [host, seer] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 1,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0,
    });

    await startGameAndReady(pages);
    await completeMayorElection(host, pages);

    await host.waitForSelector('#wolf-form', { timeout: 10000 });
    await host.locator('#wolf-form select[name="target"]').selectOption({ label: names[2] });
    await host.locator('#wolf-form button[type="submit"]').click();

    await seer.waitForSelector('#seer-form', { timeout: 10000 });
    await seer.locator('#seer-form select[name="target"]').selectOption({ label: names[0] });
    await seer.locator('#seer-form button[type="submit"]').click();
    await seer.locator('.seer-result-overlay').waitFor({ state: 'visible', timeout: 10000 });

    await reconnectPage(seer, code);
    await expect(seer.locator('.seer-result-overlay')).toBeVisible();
    await expect(seer.locator('.seer-result-overlay')).toContainText(names[0]);

    await seer.locator('.seer-result-btn').click();
    await expect(seer.locator('.seer-result-overlay')).toBeHidden();
    await seer.locator('#seer-form').waitFor({ state: 'detached', timeout: 10000 });
  } finally {
    await closeContexts(contexts);
  }
});
