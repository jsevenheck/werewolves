import { test, expect, type Page } from '@playwright/test';
import {
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady
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
      return { page: pages[i], name: names[i], role: roles[i] };
    }
  }
  throw new Error('No valid target found.');
};

test('guard blocks the wolf kill', async ({ browser }) => {
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
      guard: 1,
      passiveRoles: { mayor: false }
    });

    await startGameAndReady(pages);

    const { byRole, roles } = await mapRolesToPages(pages, names);
    const wolf = byRole.get('werewolf');
    const guard = byRole.get('guard');
    if (!wolf || !guard) {
      throw new Error('Expected werewolf and guard roles to be assigned.');
    }

    const target = pickTarget(pages, names, roles, new Set(['werewolf', 'guard']));

    await wolf.page.waitForSelector('#wolf-form', { timeout: 15000 });
    await wolf.page.locator('#wolf-form select[name="target"]').selectOption({ label: target.name });
    await wolf.page.locator('#wolf-form button[type="submit"]').click();
    await wolf.page.locator('#wolf-form').waitFor({ state: 'detached', timeout: 15000 });

    await guard.page.waitForSelector('#guard-form', { timeout: 15000 });
    await guard.page.locator('#guard-form select[name="target"]').selectOption({ label: target.name });
    await guard.page.locator('#guard-form button[type="submit"]').click();
    await guard.page.locator('#guard-form').waitFor({ state: 'detached', timeout: 15000 });

    const report = host.locator('section.panel:has(h3:has-text("Night Report"))');
    await expect(report).toContainText('No one died last night.', { timeout: 20000 });
  } finally {
    await closeContexts(contexts);
  }
});

test('guard blocks witch poison (current behavior)', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 1,
      armor: 0,
      joker: 0,
      guard: 1,
      passiveRoles: { mayor: false }
    });

    await startGameAndReady(pages);

    const { byRole, roles } = await mapRolesToPages(pages, names);
    const wolf = byRole.get('werewolf');
    const guard = byRole.get('guard');
    const witch = byRole.get('witch');
    if (!wolf || !guard || !witch) {
      throw new Error('Expected werewolf, guard, and witch roles to be assigned.');
    }

    const target = pickTarget(
      pages,
      names,
      roles,
      new Set(['werewolf', 'guard', 'witch'])
    );

    await wolf.page.waitForSelector('#wolf-form', { timeout: 15000 });
    await wolf.page.locator('#wolf-form select[name="target"]').selectOption({ label: target.name });
    await wolf.page.locator('#wolf-form button[type="submit"]').click();
    await wolf.page.locator('#wolf-form').waitFor({ state: 'detached', timeout: 15000 });

    await expect(witch.page.locator('#poison-select')).toBeVisible({ timeout: 15000 });
    await witch.page.locator('#poison-select').selectOption({ label: target.name });
    await witch.page.locator('#poison-btn').click();
    await witch.page.locator('#skip-witch').click();

    await guard.page.waitForSelector('#guard-form', { timeout: 15000 });
    await guard.page.locator('#guard-form select[name="target"]').selectOption({ label: target.name });
    await guard.page.locator('#guard-form button[type="submit"]').click();
    await guard.page.locator('#guard-form').waitFor({ state: 'detached', timeout: 15000 });

    const report = host.locator('section.panel:has(h3:has-text("Night Report"))');
    await expect(report).toContainText('No one died last night.', { timeout: 20000 });
  } finally {
    await closeContexts(contexts);
  }
});

test('guard cannot protect self and cannot protect the same target on consecutive nights', async ({ browser }) => {
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
      guard: 1,
      passiveRoles: { mayor: false }
    });

    await startGameAndReady(pages);

    const { byRole, roles } = await mapRolesToPages(pages, names);
    const wolf = byRole.get('werewolf');
    const guard = byRole.get('guard');
    if (!wolf || !guard) {
      throw new Error('Expected werewolf and guard roles to be assigned.');
    }

    const targetA = pickTarget(pages, names, roles, new Set(['werewolf', 'guard']));

    // Night 1: guard protects target A.
    await wolf.page.waitForSelector('#wolf-form', { timeout: 15000 });
    await wolf.page.locator('#wolf-form select[name="target"]').selectOption({ label: targetA.name });
    await wolf.page.locator('#wolf-form button[type="submit"]').click();
    await wolf.page.locator('#wolf-form').waitFor({ state: 'detached', timeout: 15000 });

    await guard.page.waitForSelector('#guard-form', { timeout: 15000 });
    await guard.page.locator('#guard-form select[name="target"]').selectOption({ label: targetA.name });
    await guard.page.locator('#guard-form button[type="submit"]').click();

    await host.locator('section.panel:has(h3:has-text("Night Report"))').waitFor({ timeout: 20000 });

    // Day 1: host ends voting early and waits for night to begin.
    await host.locator('#end-vote-btn').click();

    // Night 2: guard options should exclude self and the previous target.
    await wolf.page.waitForSelector('#wolf-form', { timeout: 15000 });
    await wolf.page.locator('#wolf-form select[name="target"]').selectOption({ label: targetA.name });
    await wolf.page.locator('#wolf-form button[type="submit"]').click();
    await wolf.page.locator('#wolf-form').waitFor({ state: 'detached', timeout: 15000 });

    await guard.page.waitForSelector('#guard-form', { timeout: 15000 });
    const optionTexts = (await guard.page
      .locator('#guard-form select[name="target"] option')
      .allTextContents())
      .map((text) => text.trim());
    expect(optionTexts).not.toContain(guard.name);
    expect(optionTexts).not.toContain(targetA.name);

    // Submit a valid guard action to allow the night to resolve cleanly.
    await guard.page.locator('#guard-form select[name="target"]').selectOption({ index: 1 });
    await guard.page.locator('#guard-form button[type="submit"]').click();

    const report = host.locator('section.panel:has(h3:has-text("Night Report"))');
    await expect(report).toBeVisible({ timeout: 20000 });
  } finally {
    await closeContexts(contexts);
  }
});
