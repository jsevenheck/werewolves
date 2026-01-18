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
    const input = host.locator(`input[data-role="${role}"]`);
    await input.fill(String(value));
    await input.dispatchEvent('change');
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

const selectFirstOption = async (select) => {
  const options = select.locator('option');
  const count = await options.count();
  if (count > 1) {
    await select.selectOption({ index: 1 });
    return true;
  }
  return false;
};

const selectOptionByLabel = async (select, label) => {
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

const trySubmitNightActions = async (pages, submissionState, options = {}) => {
  const { wolfTargetName } = options;
  let acted = false;
  for (const page of pages) {
    const state = submissionState.get(page) || { wolf: false, seer: false, witch: false };

    const wolfForm = page.locator('#wolf-form');
    if (await wolfForm.count() && (await wolfForm.isVisible())) {
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
    if (await seerForm.count() && (await seerForm.isVisible())) {
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
    if (await skipWitch.count() && (await skipWitch.isVisible())) {
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

const trySubmitArmor = async (pages) => {
  for (const page of pages) {
    const armorForm = page.locator('#armor-form');
    if (await armorForm.count() && (await armorForm.isVisible())) {
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

const findHunterPromptPage = async (pages) => {
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

const submitHunterShot = async (page) => {
  await page.waitForSelector('#hunter-form', { state: 'attached' });
  const select = page.locator('#hunter-form select[name="target"]');
  const optionCount = await select.locator('option').count();
  if (optionCount > 1) {
    await select.selectOption({ index: 1 });
  }
  await page.click('#hunter-form button[type="submit"]', { force: true });
  await page.locator('#hunter-overlay').waitFor({ state: 'detached', timeout: 5000 });
};

const ensureHunterOverlay = async (page, roomCode) => {
  const overlay = page.locator('#hunter-overlay');
  const firstTry = await overlay
    .waitFor({ state: 'attached', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (firstTry) {
    return true;
  }
  await page.reload();
  if (roomCode) {
    const resumeBtn = page.locator('#resume-btn');
    const hasResume = await resumeBtn
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (hasResume) {
      await resumeBtn.click();
      await page.waitForSelector(`text=Room ${roomCode}`, { timeout: 10000 });
    }
  }
  return overlay
    .waitFor({ state: 'attached', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
};

const reconnectPage = async (page, roomCode) => {
  await page.reload();
  if (!roomCode) {
    return;
  }
  const roomHeader = page.locator(`text=Room ${roomCode}`);
  const inRoom = await roomHeader
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (inRoom) {
    return;
  }
  const resumeBtn = page.locator('#resume-btn');
  const hasResume = await resumeBtn
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (hasResume) {
    await resumeBtn.click();
    await roomHeader.waitFor({ state: 'visible', timeout: 10000 });
  }
};

const waitForDayOnAllPages = async (pages) => {
  await Promise.all(
    pages.map((page) =>
      page
        .waitForSelector('h3:has-text("Night Report")', { timeout: 15000 })
        .catch(() => null)
    )
  );
};

const findVisiblePage = async (pages, selector) => {
  for (const page of pages) {
    const locator = page.locator(selector);
    try {
      if (await locator.isVisible()) {
        return page;
      }
    } catch {
      // Ignore closed pages.
    }
  }
  return null;
};

const getPhaseText = async (page) => {
  try {
    const phase = page.locator('text=Phase:');
    if (!(await phase.count())) {
      return null;
    }
    const text = await phase.first().textContent();
    return text ? text.trim() : null;
  } catch {
    return null;
  }
};

const advanceToDay = async (host, pages, options = {}) => {
  const { allowHunterStop = false, wolfTargetName } = options;
  const submissionState = new Map();
  const dayReportSelector = 'h3:has-text("Night Report")';
  const gameOverSelector = 'h2:has-text("Game Over")';
  let hunterShot = false;
  let lastPhase = null;
  for (let i = 0; i < 120; i += 1) {
    lastPhase = (await getPhaseText(host)) || lastPhase;
    const dayPage = await findVisiblePage(pages, dayReportSelector);
    if (dayPage) {
      return { hunterShot, gameOver: false, dayVisible: true, dayPage };
    }
    if (await findVisiblePage(pages, gameOverSelector)) {
      return { hunterShot, gameOver: true, dayVisible: false };
    }
    if (await trySubmitArmor(pages)) {
      await host.waitForTimeout(200);
      continue;
    }
    const hunterPage = await findHunterPromptPage(pages);
    if (hunterPage) {
      await submitHunterShot(hunterPage);
      hunterShot = true;
      if (allowHunterStop) {
        const dayVisible = !!(await findVisiblePage(pages, dayReportSelector));
        return { hunterShot, gameOver: false, dayVisible };
      }
      await host.waitForTimeout(200);
      continue;
    }
    if (await trySubmitNightActions(pages, submissionState, { wolfTargetName })) {
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
  const finalDayPage = await findVisiblePage(pages, dayReportSelector);
  if (finalDayPage) {
    return { hunterShot, gameOver: false, dayVisible: true, dayPage: finalDayPage };
  }
  throw new Error(`Failed to reach day phase in time. Last phase: ${lastPhase || 'unknown'}`);
};

const getAliveNames = async (page) => {
  return page.evaluate(() => {
    return [...document.querySelectorAll('.player-card')]
      .filter((card) => !card.classList.contains('dead'))
      .map((card) => card.querySelector('strong')?.textContent?.trim())
      .filter(Boolean);
  });
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
    const advanceResult = await advanceToDay(host, pages);
    await waitForDayOnAllPages(pages);

    const dayPage = advanceResult.dayPage || host;
    await expect(dayPage.locator('h3:has-text("Night Report")')).toBeVisible();
    const voteForm = dayPage.locator('#vote-form');
    if (await voteForm.count()) {
      await expect(voteForm).toBeVisible();
    } else {
      await expect(dayPage.locator('text=You are dead')).toBeVisible();
    }
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
    const advanceResult = await advanceToDay(host, pages);
    await waitForDayOnAllPages(pages);

    const dayPage = advanceResult.dayPage || host;
    const aliveNames = await getAliveNames(dayPage);
    expect(aliveNames.length).toBeGreaterThan(1);
    const targetName = aliveNames[0];

    await voteAllForTarget(players, targetName);
    await dayPage.waitForSelector('text=was voted out', { timeout: 10000 });
  } finally {
    await closeContexts(contexts);
  }
});

test('hunter prompt allows a follow-up shot', async ({ browser }) => {
  const names = ['Host', 'Player 2', 'Player 3', 'Player 4'];
  const { contexts, pages, code } = await createLobbyWithPlayers(browser, names);
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
    const hunterPlayer = players[1];
    const safeTarget = players[2]?.name || players[3]?.name;
    const advanceResult = await advanceToDay(host, pages, {
      allowHunterStop: true,
      wolfTargetName: safeTarget
    });

    if (!advanceResult.hunterShot && !advanceResult.gameOver) {
      const dayPage = advanceResult.dayPage || host;
      await waitForDayOnAllPages(pages);
      await reconnectPage(hunterPlayer.page, code);
      await voteAllForTarget(players, hunterPlayer.name);
      await dayPage.waitForSelector(`text=${hunterPlayer.name} was voted out`, { timeout: 20000 });
      const overlayReady = await ensureHunterOverlay(hunterPlayer.page, code);
      expect(overlayReady).toBe(true);
      await submitHunterShot(hunterPlayer.page);
    }

    const resultPage = advanceResult.dayPage || host;
    await resultPage.waitForSelector('text=shot by Hunter', { timeout: 20000 });
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
