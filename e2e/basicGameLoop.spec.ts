import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';

type NightSubmissionState = { wolf: boolean; seer: boolean; witch: boolean };

type RoleConfig = {
  werewolf: number;
  seer: number;
  hunter: number;
  witch: number;
  armor: number;
  joker: number;
  minPlayers?: number;
};

const ROLE_FIELDS: (keyof RoleConfig)[] = ['werewolf', 'seer', 'hunter', 'witch', 'armor', 'joker'];

const joinRoom = async (page: Page, name: string, code: string) => {
  await page.goto('/');
  await page.fill('#join-form input[name="name"]', name);
  await page.fill('#join-form input[name="code"]', code);
  await page.click('#join-form button[type="submit"]');
  await page.waitForSelector('h2:has-text("Lobby")');
};

const createLobbyWithPlayers = async (browser: Browser, names: string[]) => {
  const contexts = [] as Awaited<ReturnType<Browser['newContext']>>[];
  const pages = [] as Page[];
  for (let i = 0; i < names.length; i += 1) {
    const context = await browser.newContext();
    contexts.push(context);
    pages.push(await context.newPage());
  }
  const [host, ...guests] = pages;
  await host.goto('/');
  await host.fill('#create-form input[name="name"]', names[0]);
  await host.click('#create-form button[type="submit"]');
  await host.waitForSelector('text=Share this code');
  const codeRaw = await host.locator('section:has(h2:has-text("Lobby")) strong').textContent();
  const code = (codeRaw || '').trim();
  expect(code).not.toBe('');

  for (let i = 0; i < guests.length; i += 1) {
    await joinRoom(guests[i], names[i + 1], code);
  }

  return { contexts, pages, names, code };
};

const configureRoles = async (host: Page, config: RoleConfig) => {
  for (const role of ROLE_FIELDS) {
    const value = config[role] ?? 0;
    const input = host.locator(`input[data-role="${role}"]`);
    await input.fill(String(value));
    await input.dispatchEvent('change');
  }
  await host.fill('#min-players', String(config.minPlayers || 4));
  await host.dispatchEvent('#min-players', 'change');
  await host.waitForTimeout(200);
};

const startGameAndReady = async (pages: Page[]) => {
  const [host] = pages;
  await host.click('#start-game');
  await Promise.all(pages.map((page) => page.waitForSelector('h2:has-text("Your Role")')));
  for (const page of pages) {
    const readyBtn = page.locator('#ready-btn');
    if (await readyBtn.count()) {
      await readyBtn.click();
    }
  }
  await host.waitForSelector('#continue-btn:not([disabled])');
  await host.click('#continue-btn');
};

const tryClick = async (locator: Locator) => {
  if ((await locator.count()) === 0) {
    return false;
  }
  if (!(await locator.first().isVisible())) {
    return false;
  }
  await locator.first().click();
  return true;
};

const selectFirstOption = async (select: Locator) => {
  const options = select.locator('option');
  const count = await options.count();
  if (count > 1) {
    await select.selectOption({ index: 1 });
    return true;
  }
  return false;
};

const selectOptionByLabel = async (select: Locator, label?: string | null) => {
  if (!label) {
    return false;
  }
  try {
    await select.selectOption({ label });
    return true;
  } catch {
    return false;
  }
};

const trySubmitNightActions = async (
  pages: Page[],
  submissionState: Map<Page, NightSubmissionState>,
  options: { wolfTargetName?: string } = {}
) => {
  const { wolfTargetName } = options;
  let acted = false;
  for (const page of pages) {
    const state = submissionState.get(page) || { wolf: false, seer: false, witch: false };

    const wolfForm = page.locator('#wolf-form');
    if ((await wolfForm.count()) && (await wolfForm.isVisible())) {
      if (!state.wolf) {
        const select = wolfForm.locator('select[name="target"]');
        const picked =
          (await selectOptionByLabel(select, wolfTargetName)) || (await selectFirstOption(select));
        if (picked) {
          await wolfForm.locator('button[type="submit"]').click();
          state.wolf = true;
          acted = true;
        }
      }
    } else {
      state.wolf = false;
    }

    const seerForm = page.locator('#seer-form');
    if ((await seerForm.count()) && (await seerForm.isVisible())) {
      if (!state.seer) {
        const select = seerForm.locator('select[name="target"]');
        if (await selectFirstOption(select)) {
          await seerForm.locator('button[type="submit"]').click();
          state.seer = true;
          acted = true;
        }
      }
    } else {
      state.seer = false;
    }

    const skipWitch = page.locator('#skip-witch');
    if ((await skipWitch.count()) && (await skipWitch.isVisible())) {
      if (!state.witch) {
        await skipWitch.click();
        state.witch = true;
        acted = true;
      }
    } else {
      state.witch = false;
    }

    submissionState.set(page, state);
  }
  return acted;
};

const trySubmitArmor = async (pages: Page[]) => {
  for (const page of pages) {
    const armorForm = page.locator('#armor-form');
    if ((await armorForm.count()) && (await armorForm.isVisible())) {
      const selects = armorForm.locator('select');
      const first = selects.nth(0);
      const second = selects.nth(1);
      const optionCount = await first.locator('option').count();
      if (optionCount > 2) {
        await first.selectOption({ index: 1 });
        await second.selectOption({ index: 2 });
      } else if (optionCount > 1) {
        await first.selectOption({ index: 1 });
        await second.selectOption({ index: 1 });
      }
      await armorForm.locator('button[type="submit"]').click();
      return true;
    }
  }
  return false;
};

const findHunterPromptPage = async (pages: Page[]) => {
  for (const page of pages) {
    const overlay = page.locator('#hunter-overlay');
    if (await overlay.count()) {
      return page;
    }
    const form = page.locator('#hunter-form');
    if (await form.count()) {
      return page;
    }
  }
  return null;
};

const submitHunterShot = async (page: Page) => {
  await page.waitForSelector('#hunter-form', { state: 'attached' });
  const select = page.locator('#hunter-form select[name="target"]');
  const optionCount = await select.locator('option').count();
  if (optionCount > 1) {
    await select.selectOption({ index: 1 });
  }
  await page.click('#hunter-form button[type="submit"]', { force: true });
  await page.locator('#hunter-overlay').waitFor({ state: 'detached', timeout: 5000 });
};

const ensureHunterOverlay = async (page: Page, roomCode: string) => {
  const overlay = page.locator('#hunter-overlay');
  const firstTry = await overlay
    .waitFor({ state: 'attached', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (firstTry) return true;
  await page.reload();
  await page.waitForTimeout(500);
  await page.goto('/');
  await page.fill('#join-form input[name="name"]', 'Hunter');
  await page.fill('#join-form input[name="code"]', roomCode);
  await page.click('#join-form button[type="submit"]');
  await overlay.waitFor({ state: 'attached', timeout: 8000 });
  return true;
};

const waitForPhase = async (page: Page, phase: string) => {
  await page.waitForSelector(`p:has-text("Phase: ${phase}")`, { timeout: 20000 });
};

test('basic game loop', async ({ browser }) => {
  const { contexts, pages, code } = await createLobbyWithPlayers(browser, ['Host', 'Player 2', 'Player 3', 'Player 4', 'Player 5']);
  const [host] = pages;

  await configureRoles(host, {
    werewolf: 1,
    seer: 1,
    hunter: 1,
    witch: 0,
    armor: 0,
    joker: 0,
    minPlayers: 5
  });

  await startGameAndReady(pages);

  await waitForPhase(host, 'Night (Wolves)');

  const submissionState = new Map<Page, NightSubmissionState>();
  let loopCount = 0;
  let reachedDay = false;

  while (loopCount < 6 && !reachedDay) {
    await trySubmitArmor(pages);
    await trySubmitNightActions(pages, submissionState);

    if (await host.locator('h2:has-text("Day")').count()) {
      reachedDay = true;
      break;
    }

    if (await host.locator('#host-skip-btn').count()) {
      await tryClick(host.locator('#host-skip-btn'));
    }

    if (await host.locator('#skip-step').count()) {
      await tryClick(host.locator('#skip-step'));
    }

    loopCount += 1;
    await host.waitForTimeout(500);
  }

  expect(reachedDay).toBeTruthy();

  const hunterPage = await findHunterPromptPage(pages);
  if (hunterPage) {
    await ensureHunterOverlay(hunterPage, code);
    await submitHunterShot(hunterPage);
  }

  const dayPage = pages[0];
  await dayPage.waitForSelector('#vote-form', { timeout: 10000 });
  const voteSelect = dayPage.locator('#vote-form select[name="target"]');
  await voteSelect.selectOption({ index: 1 });
  await dayPage.click('#vote-form button[type="submit"]');

  await Promise.all(contexts.map((context) => context.close()));
});
