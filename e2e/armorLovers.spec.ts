import { test, expect, type Page } from '@playwright/test';
import {
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
  completeMayorElection,
} from './helpers';

test('armor can link two lovers', async ({ browser }) => {
  const names = ['Werewolf', 'Armor', 'Lover A', 'Lover B', 'Villager'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  const waitForArmorForm = async () => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      for (const page of pages) {
        const form = page.locator('#armor-form');
        try {
          if ((await form.count()) && (await form.isVisible())) {
            return page;
          }
        } catch {
          // Ignore closed pages.
        }
      }
      await host.waitForTimeout(200);
    }
    throw new Error('Armor form did not appear on any page.');
  };

  const revealRoleCard = async (page: Page) => {
    const toggle = page.locator('#toggle-role');
    await toggle.waitFor({ state: 'visible', timeout: 10000 });
    const label = (await toggle.textContent())?.toLowerCase() || '';
    if (label.includes('reveal')) {
      await toggle.click();
    }
  };

  const waitForOptions = async (page: Page, selector: string, minCount: number) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const count = await page.locator(selector).count();
      if (count >= minCount) {
        return;
      }
      await page.waitForTimeout(100);
    }
    throw new Error(`Expected at least ${minCount} options for ${selector}.`);
  };

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 1,
      joker: 0,
      guard: 0,
    });

    await startGameAndReady(pages);

    await completeMayorElection(host, pages);

    const armorPage: Page = await waitForArmorForm();
    const loverASelect = armorPage.locator('#armor-form select[name="loverA"]');
    const loverBSelect = armorPage.locator('#armor-form select[name="loverB"]');
    await waitForOptions(armorPage, '#armor-form select[name="loverA"] option', 3);
    await waitForOptions(armorPage, '#armor-form select[name="loverB"] option', 3);

    const options = (await loverASelect.locator('option').allTextContents()).map((text) =>
      text.trim()
    );
    const loverAName = options[1] || '';
    const loverBName = options[2] || '';
    expect(loverAName).not.toBe('');
    expect(loverBName).not.toBe('');
    expect(loverAName).not.toBe(loverBName);

    await loverASelect.selectOption({ index: 1 });
    await loverBSelect.selectOption({ index: 2 });
    await armorPage.locator('#armor-form button[type="submit"]').click();

    await expect(host.locator('text=Two players are now Lovers.')).toBeVisible();
    const pageByName = new Map(names.map((name, index) => [name, pages[index]]));
    const loverAPage = pageByName.get(loverAName);
    const loverBPage = pageByName.get(loverBName);
    expect(loverAPage).toBeTruthy();
    expect(loverBPage).toBeTruthy();

    await revealRoleCard(loverAPage as Page);
    await revealRoleCard(loverBPage as Page);
    await expect((loverAPage as Page).locator('.role-card')).toContainText(`Lover: ${loverBName}`);
    await expect((loverBPage as Page).locator('.role-card')).toContainText(`Lover: ${loverAName}`);
  } finally {
    await closeContexts(contexts);
  }
});
