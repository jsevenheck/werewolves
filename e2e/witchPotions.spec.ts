import { test, expect, type Page } from '@playwright/test';
import {
  waitForDayOnAllPages,
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
  completeMayorElection
} from './helpers';

const waitForWitchStep = async (_host: Page, witch: Page) => {
  await expect(witch.locator('#heal-btn')).toBeVisible({ timeout: 15000 });
};

const submitAbstainVotes = async (pages: Page[]) => {
  for (const page of pages) {
    const form = page.locator('#vote-form');
    if (!(await form.count()) || !(await form.isVisible())) {
      continue;
    }
    await form.locator('select[name="target"]').selectOption('__abstain__');
    await page.click('#vote-submit');
  }
};

const advanceToNextNight = async (host: Page) => {
  const skipButton = host.locator('#host-skip-btn');
  if (await skipButton.isVisible()) {
    await skipButton.click();
  }
  await host.waitForSelector('#wolf-form', { timeout: 15000 });
};

test('witch can heal and poison across nights', async ({ browser }) => {
  const names = ['Werewolf', 'Witch', 'Villager A', 'Villager B', 'Villager C'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host, witch] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 1,
      armor: 0,
      joker: 0
    });

    await startGameAndReady(pages);

    await completeMayorElection(host, pages);

    await host.waitForSelector('#wolf-form', { timeout: 10000 });
    await host.locator('#wolf-form select[name="target"]').selectOption({ label: names[2] });
    await host.locator('#wolf-form button[type="submit"]').click();
    await host.locator('#wolf-form').waitFor({ state: 'detached' });

    await waitForWitchStep(host, witch);
    const healBtn = witch.locator('#heal-btn');
    await expect(healBtn).toBeEnabled();
    await healBtn.click();
    const poisonBtn = witch.locator('#poison-btn');
    const poisonSelect = witch.locator('#poison-select');
    await expect(poisonBtn).toBeEnabled();
    await expect(poisonSelect).toBeEnabled();
    await expect(witch.locator('#skip-witch')).toBeVisible();
    await witch.locator('#skip-witch').click();

    await host.waitForSelector('h3:has-text("Night Report")', { timeout: 15000 });
    const firstReport = host.locator('section.panel:has(h3:has-text("Night Report"))');
    await expect(firstReport).toContainText('No one died last night.');

    await waitForDayOnAllPages(pages);
    await submitAbstainVotes(pages);
    await advanceToNextNight(host);
    await host.locator('#wolf-form select[name="target"]').selectOption({ label: names[3] });
    await host.locator('#wolf-form button[type="submit"]').click();
    await host.locator('#wolf-form').waitFor({ state: 'detached' });

    await waitForWitchStep(host, witch);
    await witch.locator('#poison-select').selectOption({ label: names[4] });
    await witch.locator('#poison-btn').click();

    await host.waitForSelector('h3:has-text("Night Report")', { timeout: 15000 });
    const secondReport = host.locator('section.panel:has(h3:has-text("Night Report"))');
    await expect(secondReport).toContainText(names[3]);
    await expect(secondReport).toContainText(names[4]);
  } finally {
    await closeContexts(contexts);
  }
});

test('witch can heal and poison in the same night', async ({ browser }) => {
  const names = ['Werewolf', 'Witch', 'Villager A', 'Villager B', 'Villager C'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host, witch] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 1,
      armor: 0,
      joker: 0
    });

    await startGameAndReady(pages);

    await completeMayorElection(host, pages);

    await host.waitForSelector('#wolf-form', { timeout: 10000 });
    await host.locator('#wolf-form select[name="target"]').selectOption({ label: names[2] });
    await host.locator('#wolf-form button[type="submit"]').click();
    await host.locator('#wolf-form').waitFor({ state: 'detached' });

    await waitForWitchStep(host, witch);
    const healBtn = witch.locator('#heal-btn');
    await expect(healBtn).toBeEnabled();
    await healBtn.click();
    await expect(healBtn).toBeDisabled();

    const poisonSelect = witch.locator('#poison-select');
    const poisonBtn = witch.locator('#poison-btn');
    await expect(poisonSelect).toBeEnabled();
    await expect(poisonBtn).toBeEnabled();
    await poisonSelect.selectOption({ label: names[3] });
    await poisonBtn.click();

    await host.waitForSelector('h3:has-text("Night Report")', { timeout: 15000 });
    const reportSummary = host
      .locator('h3:has-text("Night Report")')
      .locator('xpath=following-sibling::*[1]');
    await expect(reportSummary).toContainText(names[3]);
    await expect(reportSummary).not.toContainText(names[2]);
  } finally {
    await closeContexts(contexts);
  }
});
