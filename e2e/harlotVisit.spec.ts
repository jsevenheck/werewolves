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
  const byRole = new Map<string, { page: Page; name: string }>();
  const roles: string[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const role = await getRoleName(pages[i]);
    roles[i] = role;
    byRole.set(role, { page: pages[i], name: names[i] });
  }
  return { byRole, roles };
};

const pickTarget = (pages: Page[], names: string[], roles: string[], forbidden: Set<string>) => {
  for (let i = 0; i < pages.length; i += 1) {
    if (!forbidden.has(roles[i])) {
      return { page: pages[i], name: names[i], role: roles[i], index: i };
    }
  }
  throw new Error('No valid target found.');
};

test('harlot dies when visiting the wolf victim', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0,
      harlot: 1,
      passiveRoles: { mayor: false },
    });

    await startGameAndReady(pages);

    const { byRole, roles } = await mapRolesToPages(pages, names);
    const wolf = byRole.get('werewolf');
    const harlot = byRole.get('harlot');
    if (!wolf || !harlot) {
      throw new Error('Expected werewolf and harlot roles to be assigned.');
    }

    // Pick a villager as the target (not wolf or harlot)
    const target = pickTarget(pages, names, roles, new Set(['werewolf', 'harlot']));

    // Wolf targets the villager
    await wolf.page.waitForSelector('#wolf-form', { timeout: 15000 });
    await wolf.page
      .locator('#wolf-form select[name="target"]')
      .selectOption({ label: target.name });
    await wolf.page.locator('#wolf-form button[type="submit"]').click();
    await wolf.page.locator('#wolf-form').waitFor({ state: 'detached', timeout: 15000 });

    // Harlot visits the same villager (wolf's target)
    await harlot.page.waitForSelector('#harlot-form', { timeout: 15000 });
    await harlot.page
      .locator('#harlot-form select[name="target"]')
      .selectOption({ label: target.name });
    await harlot.page.locator('#harlot-form button[type="submit"]').click();
    await harlot.page.locator('#harlot-form').waitFor({ state: 'detached', timeout: 15000 });

    // Check night report: both target and harlot should have died
    const report = host.locator('section.panel:has(h3:has-text("Night Report"))');
    await expect(report).toBeVisible({ timeout: 20000 });
    await expect(report).toContainText(target.name, { timeout: 5000 });
    await expect(report).toContainText(harlot.name, { timeout: 5000 });
  } finally {
    await closeContexts(contexts);
  }
});

test('harlot survives when visiting someone other than the wolf victim', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 0,
      harlot: 1,
      passiveRoles: { mayor: false },
    });

    await startGameAndReady(pages);

    const { byRole, roles } = await mapRolesToPages(pages, names);
    const wolf = byRole.get('werewolf');
    const harlot = byRole.get('harlot');
    if (!wolf || !harlot) {
      throw new Error('Expected werewolf and harlot roles to be assigned.');
    }

    // Pick two different villagers
    const forbidden = new Set(['werewolf', 'harlot']);
    const target1 = pickTarget(pages, names, roles, forbidden);
    // Find a second valid target
    const target2Candidates = pages
      .map((p, i) => ({ page: p, name: names[i], role: roles[i], index: i }))
      .filter((c) => !forbidden.has(c.role) && c.index !== target1.index);
    if (target2Candidates.length === 0) {
      throw new Error('No second valid target found.');
    }
    const target2 = target2Candidates[0];

    // Wolf targets first villager
    await wolf.page.waitForSelector('#wolf-form', { timeout: 15000 });
    await wolf.page
      .locator('#wolf-form select[name="target"]')
      .selectOption({ label: target1.name });
    await wolf.page.locator('#wolf-form button[type="submit"]').click();
    await wolf.page.locator('#wolf-form').waitFor({ state: 'detached', timeout: 15000 });

    // Harlot visits second villager (different from wolf's target)
    await harlot.page.waitForSelector('#harlot-form', { timeout: 15000 });
    await harlot.page
      .locator('#harlot-form select[name="target"]')
      .selectOption({ label: target2.name });
    await harlot.page.locator('#harlot-form button[type="submit"]').click();
    await harlot.page.locator('#harlot-form').waitFor({ state: 'detached', timeout: 15000 });

    // Check night report: only target1 should have died, harlot survives
    const report = host.locator('section.panel:has(h3:has-text("Night Report"))');
    await expect(report).toBeVisible({ timeout: 20000 });
    // The night report should show target1 died
    await expect(report).toContainText(target1.name, { timeout: 5000 });
    // The night report should NOT say harlot died - look for the death entry pattern
    // Deaths are shown as "Name (Role)" so check the harlot didn't appear as a death victim
    const reportText = await report.textContent();
    const deathPattern = new RegExp(`${harlot.name}.*\\(Harlot\\)`);
    expect(reportText).not.toMatch(deathPattern);
  } finally {
    await closeContexts(contexts);
  }
});

test('harlot survives when wolf kill is blocked by guard', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 1,
      harlot: 1,
      passiveRoles: { mayor: false },
    });

    await startGameAndReady(pages);

    const { byRole, roles } = await mapRolesToPages(pages, names);
    const wolf = byRole.get('werewolf');
    const guard = byRole.get('guard');
    const harlot = byRole.get('harlot');
    if (!wolf || !guard || !harlot) {
      throw new Error('Expected werewolf, guard, and harlot roles to be assigned.');
    }

    // Pick a villager as the target
    const target = pickTarget(pages, names, roles, new Set(['werewolf', 'guard', 'harlot']));

    // Wolf targets the villager
    await wolf.page.waitForSelector('#wolf-form', { timeout: 15000 });
    await wolf.page
      .locator('#wolf-form select[name="target"]')
      .selectOption({ label: target.name });
    await wolf.page.locator('#wolf-form button[type="submit"]').click();
    await wolf.page.locator('#wolf-form').waitFor({ state: 'detached', timeout: 15000 });

    // Guard protects the same villager
    await guard.page.waitForSelector('#guard-form', { timeout: 15000 });
    await guard.page
      .locator('#guard-form select[name="target"]')
      .selectOption({ label: target.name });
    await guard.page.locator('#guard-form button[type="submit"]').click();
    await guard.page.locator('#guard-form').waitFor({ state: 'detached', timeout: 15000 });

    // Harlot visits the same villager (wolf's target, but guard protected)
    await harlot.page.waitForSelector('#harlot-form', { timeout: 15000 });
    await harlot.page
      .locator('#harlot-form select[name="target"]')
      .selectOption({ label: target.name });
    await harlot.page.locator('#harlot-form button[type="submit"]').click();
    await harlot.page.locator('#harlot-form').waitFor({ state: 'detached', timeout: 15000 });

    // Check night report: no one should have died (guard blocked the kill)
    const report = host.locator('section.panel:has(h3:has-text("Night Report"))');
    await expect(report).toContainText('No one died last night.', { timeout: 20000 });
  } finally {
    await closeContexts(contexts);
  }
});
