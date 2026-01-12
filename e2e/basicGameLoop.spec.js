const { test, expect } = require('@playwright/test');

const ROLE_FIELDS = ['werewolf', 'seer', 'hunter', 'witch', 'armor', 'joker'];

const joinRoom = async (page, name, code) => {
  await page.goto('/');
  await page.fill('#join-form input[name="name"]', name);
  await page.fill('#join-form input[name="code"]', code);
  await page.click('#join-form button[type="submit"]');
  await page.waitForSelector('h2:has-text("Lobby")');
};

const createLobbyWithPlayers = async (browser, names) => {
  const contexts = [];
  const pages = [];
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

const configureRoles = async (host, config) => {
  for (const role of ROLE_FIELDS) {
    const value = config[role] ?? 0;
    await host.fill(`input[data-role="${role}"]`, String(value));
  }
  await host.fill('#min-players', String(config.minPlayers || 4));
  await host.dispatchEvent('#min-players', 'change');
  await host.waitForTimeout(200);
};

const startGameAndReady = async (pages) => {
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

const tryClick = async (locator) => {
  if (await locator.count() === 0) {
    return false;
  }
  if (!(await locator.first().isVisible())) {
    return false;
  }
  await locator.first().click();
  return true;
};

const findHunterPromptPage = async (pages) => {
  for (const page of pages) {
    const overlay = page.locator('#hunter-overlay');
    if (await overlay.isVisible()) {
      return page;
    }
  }
  return null;
};

const submitHunterShot = async (page) => {
  await page.waitForSelector('#hunter-form');
  const select = page.locator('#hunter-form select[name="target"]');
  const optionCount = await select.locator('option').count();
  if (optionCount > 1) {
    await select.selectOption({ index: 1 });
  }
  await page.click('#hunter-form button[type="submit"]');
  await page.locator('#hunter-overlay').waitFor({ state: 'detached', timeout: 5000 });
};

const advanceToDay = async (host, pages, options = {}) => {
  const { allowHunterStop = false } = options;
  const dayReport = host.locator('h3:has-text("Night Report")');
  let hunterShot = false;
  for (let i = 0; i < 120; i += 1) {
    if (await dayReport.count()) {
      return { hunterShot, gameOver: false, dayVisible: true };
    }
    if (await host.locator('h2:has-text("Game Over")').count()) {
      return { hunterShot, gameOver: true, dayVisible: false };
    }
    const hunterPage = await findHunterPromptPage(pages);
    if (hunterPage) {
      await submitHunterShot(hunterPage);
      hunterShot = true;
      if (allowHunterStop) {
        return { hunterShot, gameOver: false, dayVisible: await dayReport.count() > 0 };
      }
      await host.waitForTimeout(200);
      continue;
    }
    if (await tryClick(host.locator('#host-skip-btn'))) {
      await host.waitForTimeout(150);
      continue;
    }
    if (await tryClick(host.locator('#skip-step'))) {
      await host.waitForTimeout(150);
      continue;
    }
    await host.waitForTimeout(200);
  }
  await dayReport.waitFor({ state: 'visible', timeout: 20000 });
  return { hunterShot, gameOver: false, dayVisible: true };
};

const getAliveNames = async (page) => {
  return page.evaluate(() => {
    return [...document.querySelectorAll('.player-card')]
      .filter((card) => !card.classList.contains('dead'))
      .map((card) => card.querySelector('strong')?.textContent?.trim())
      .filter(Boolean);
  });
};

const revealRoleName = async (page) => {
  const toggle = page.locator('#toggle-role');
  if (await toggle.count() === 0) {
    return null;
  }
  const roleText = page.locator('.role-card strong');
  if (!(await roleText.count())) {
    await toggle.click();
    await roleText.waitFor({ state: 'visible' });
  }
  const text = await roleText.textContent();
  return text ? text.trim() : null;
};

const findRolePage = async (players, roleName) => {
  for (const player of players) {
    const role = await revealRoleName(player.page);
    if (role === roleName) {
      return player;
    }
  }
  return null;
};

const voteAllForTarget = async (players, targetName) => {
  for (const player of players) {
    const form = player.page.locator('#vote-form');
    if (!(await form.count()) || !(await form.isVisible())) {
      continue;
    }
    const select = form.locator('select[name="target"]');
    if (player.name === targetName) {
      await select.selectOption('__abstain__');
    } else {
      await select.selectOption({ label: targetName });
    }
    await player.page.click('#vote-submit');
  }
};

const closeContexts = async (contexts) => {
  for (const context of contexts) {
    try {
      await context.close();
    } catch {
      // Ignore contexts already closed during test teardown.
    }
  }
};

test('host can start a 4-player game and reach day', async ({ browser }) => {
  const names = ['Host', 'Player 2', 'Player 3', 'Player 4'];
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
      minPlayers: 4
    });

    await startGameAndReady(pages);
    await advanceToDay(host, pages);

    await expect(host.locator('h3:has-text("Night Report")')).toBeVisible();
    await expect(host.locator('#vote-form')).toBeVisible();
  } finally {
    await closeContexts(contexts);
  }
});

test('day vote eliminates a player', async ({ browser }) => {
  const names = ['Host', 'Player 2', 'Player 3', 'Player 4'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;
  const players = pages.map((page, index) => ({ page, name: names[index] }));

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      minPlayers: 4
    });

    await startGameAndReady(pages);
    await advanceToDay(host, pages);

    const aliveNames = await getAliveNames(host);
    expect(aliveNames.length).toBeGreaterThan(1);
    const targetName = aliveNames[0];

    await voteAllForTarget(players, targetName);
    await host.waitForSelector('text=was voted out', { timeout: 10000 });
  } finally {
    await closeContexts(contexts);
  }
});

test('hunter prompt allows a follow-up shot', async ({ browser }) => {
  const names = ['Host', 'Player 2', 'Player 3', 'Player 4'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;
  const players = pages.map((page, index) => ({ page, name: names[index] }));

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 1,
      witch: 0,
      armor: 0,
      joker: 0,
      minPlayers: 4
    });

    await startGameAndReady(pages);
    const advanceResult = await advanceToDay(host, pages, { allowHunterStop: true });

    if (!advanceResult.hunterShot && !advanceResult.gameOver) {
      const hunterPlayer = await findRolePage(players, 'Hunter');
      expect(hunterPlayer).not.toBeNull();

      await voteAllForTarget(players, hunterPlayer.name);
      await hunterPlayer.page.waitForSelector('#hunter-overlay', { timeout: 10000 });
      await submitHunterShot(hunterPlayer.page);
    }

    await host.waitForSelector('text=shot by Hunter', { timeout: 10000 });
  } finally {
    await closeContexts(contexts);
  }
});

test('player can resume session after reconnect', async ({ browser }) => {
  const names = ['Host', 'Player 2'];
  const { contexts, pages, code } = await createLobbyWithPlayers(browser, names);
  const [host, guest] = pages;
  const [, guestContext] = contexts;

  try {
    await host.waitForSelector('h2:has-text("Lobby")');
    await guest.waitForSelector('h2:has-text("Lobby")');
    await guest.waitForFunction(() => localStorage.getItem('werewolves.session'));
    await guest.close();

    const resumed = await guestContext.newPage();
    await resumed.goto('/');
    const roomHeader = resumed.locator(`text=Room ${code}`);
    const autoResumed = await roomHeader
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!autoResumed) {
      await resumed.waitForSelector('#resume-btn', { timeout: 10000 });
      await resumed.click('#resume-btn');
      await roomHeader.waitFor({ state: 'visible', timeout: 10000 });
    }
    await expect(resumed.locator('.players-list')).toContainText('Player 2');
  } finally {
    await closeContexts(contexts);
  }
});
