import { test, expect, type Page } from '@playwright/test';
import {
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
} from './helpers';

const getRoleName = async (page: Page) => {
  const toggle = page.locator('#toggle-role');
  await toggle.waitFor({ state: 'visible', timeout: 10000 });
  const label = (await toggle.textContent())?.toLowerCase() || '';
  if (label.includes('reveal')) {
    await toggle.click();
  }
  const roleLabel = page.locator('.role-card strong');
  await roleLabel.waitFor({ state: 'visible', timeout: 5000 });
  return (await roleLabel.textContent())?.trim().toLowerCase() || '';
};

const mapRolesToPages = async (pages: Page[], names: string[]) => {
  const roles: string[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const role = await getRoleName(pages[i]);
    roles[i] = role;
  }
  return { roles, names };
};

test('werewolves cannot target other werewolves in the vote dropdown', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 2,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      passiveRoles: { mayor: false },
    });

    await startGameAndReady(pages);

    const { roles } = await mapRolesToPages(pages, names);
    const wolfIndexes = roles
      .map((role, index) => (role === 'werewolf' ? index : -1))
      .filter((index) => index >= 0);
    if (wolfIndexes.length < 2) {
      throw new Error('Expected two werewolves to be assigned.');
    }

    const wolfNames = wolfIndexes.map((index) => names[index]);
    const wolfPage = pages[wolfIndexes[0]];
    await wolfPage.waitForSelector('#wolf-form', { timeout: 15000 });
    const optionTexts = (
      await wolfPage.locator('#wolf-form select[name="target"] option').allTextContents()
    ).map((text) => text.trim());

    wolfNames.forEach((name) => expect(optionTexts).not.toContain(name));
  } finally {
    await closeContexts(contexts);
  }
});
