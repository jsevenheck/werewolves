import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { MIN_PLAYERS } from '@shared/constants';
import type { PassiveRole } from '@shared/types';

type SubmissionState = { wolf: boolean; seer: boolean; witch: boolean; guard: boolean; mayor: boolean };

export type PassiveRoleConfig = Partial<Record<PassiveRole, boolean>>;

type RoleCountKey = 'werewolf' | 'seer' | 'hunter' | 'witch' | 'armor' | 'joker' | 'guard' | 'harlot';

export type RoleConfig = {
  werewolf: number;
  seer: number;
  hunter: number;
  witch: number;
  armor: number;
  joker: number;
  guard?: number;
  harlot?: number;
  passiveRoles?: PassiveRoleConfig;
};

type AdvanceToDayResult = {
  hunterShot: boolean;
  gameOver: boolean;
  dayVisible: boolean;
  dayPage?: Page | null;
};

const ROLE_FIELDS: RoleCountKey[] = ['werewolf', 'seer', 'hunter', 'witch', 'armor', 'joker', 'guard', 'harlot'];

const joinRoom = async (page: Page, name: string, code: string) => {
  await page.goto('/');
  await page.fill('#join-form input[name="name"]', name);
  await page.fill('#join-form input[name="code"]', code);
  await page.click('#join-form button[type="submit"]');
  await page.waitForSelector('h2:has-text("Lobby")');
};

export const createLobbyWithPlayers = async (browser: Browser, names: string[]) => {
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

export const configureRoles = async (host: Page, config: RoleConfig) => {
  await host.waitForSelector('#role-config', { timeout: 10000 });
  const expectedTotal = ROLE_FIELDS.reduce((sum, role) => sum + (config[role] ?? 0), 0);
  const passiveRoles = config.passiveRoles;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await host.evaluate(
      ({ desired, passive }) => {
        const form = document.getElementById('role-config');
        if (!form) return;
        const roleInputs = form.querySelectorAll<HTMLInputElement>('.role-input');
        roleInputs.forEach((input) => {
          const role = input.dataset.role as keyof typeof desired | undefined;
          if (!role) return;
          input.value = String(desired[role] ?? 0);
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        if (passive) {
          const passiveInputs = form.querySelectorAll<HTMLInputElement>('.passive-role-input');
          passiveInputs.forEach((input) => {
            const role = input.dataset.passiveRole as keyof typeof passive | undefined;
            if (!role || passive[role] === undefined) return;
            input.checked = Boolean(passive[role]);
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
        }
        form.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { desired: config, passive: passiveRoles }
    );

    const applied = await host
      .waitForFunction(
        ({ total, min, passive }) => {
          const summary = Array.from(document.querySelectorAll('p')).find((el) =>
            (el.textContent || '').includes('Configured roles:')
          );
          const minText = Array.from(document.querySelectorAll('p')).find((el) =>
            (el.textContent || '').includes('Minimum players to start:')
          );
          const passiveOk = !passive || Object.entries(passive).every(([role, value]) => {
            const input = document.querySelector<HTMLInputElement>(
              `.passive-role-input[data-passive-role="${role}"]`
            );
            if (!input) return false;
            return input.checked === Boolean(value);
          });
          const summaryText = summary?.textContent || '';
          const minPlayersText = minText?.textContent || '';
          return (
            summaryText.includes(`Configured roles: ${total} /`) &&
            minPlayersText.includes(`Minimum players to start: ${min}`) &&
            passiveOk
          );
        },
        { total: expectedTotal, min: MIN_PLAYERS, passive: passiveRoles },
        { timeout: 3000 }
      )
      .then(() => true)
      .catch(() => false);

    if (applied) {
      await host.waitForTimeout(150);
      return;
    }
  }

  throw new Error('Failed to apply role configuration in time.');
};

export const startGameAndReady = async (pages: Page[]) => {
  const [host] = pages;
  pages.forEach((page) => {
    page.on('dialog', (dialog) => dialog.accept());
  });
  await host.waitForSelector('#start-game:not([disabled])', { timeout: 15000 });
  const startDeadline = Date.now() + 20000;
  let hostStarted = false;
  while (Date.now() < startDeadline) {
    await host.click('#start-game');
    hostStarted = await host
      .waitForSelector('h2:has-text("Your Role")', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (hostStarted) break;
    const stillLobby = await host.locator('#start-game').count();
    if (!stillLobby) break;
    await host.waitForTimeout(250);
  }
  if (!hostStarted) {
    throw new Error('Start game did not transition to role reveal.');
  }
  await Promise.all(
    pages.map((page) =>
      page.waitForSelector('h2:has-text("Your Role")', { timeout: 30000 })
    )
  );
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
  const first = locator.first();
  if (!(await first.isVisible())) {
    return false;
  }
  try {
    await first.click();
    return true;
  } catch {
    return false;
  }
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

const selectFirstOptionAvoidingLabel = async (select: Locator, avoidLabel?: string | null) => {
  const options = select.locator('option');
  const count = await options.count();
  if (count <= 1) {
    return false;
  }
  if (!avoidLabel) {
    await select.selectOption({ index: 1 });
    return true;
  }
  for (let i = 1; i < count; i += 1) {
    const text = (await options.nth(i).textContent())?.trim() || '';
    if (text && text !== avoidLabel) {
      await select.selectOption({ index: i });
      return true;
    }
  }
  return false;
};

const selectOptionByLabel = async (select: Locator, label?: string | null) => {
  if (!label) {
    return false;
  }
  const option = select.locator('option', { hasText: label }).first();
  const optionCount = await option.count().catch(() => 0);
  if (!optionCount) {
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
  submissionState: Map<Page, SubmissionState>,
  options: {
    wolfTargetName?: string;
    avoidWolfTargetName?: string;
    guardTargetName?: string;
    avoidGuardTargetName?: string;
  } = {}
) => {
  const { wolfTargetName, avoidWolfTargetName, guardTargetName, avoidGuardTargetName } = options;
  let acted = false;
  for (const page of pages) {
    const state =
      submissionState.get(page) || { wolf: false, seer: false, witch: false, guard: false, mayor: false };

    const wolfForm = page.locator('#wolf-form');
    if ((await wolfForm.count()) && (await wolfForm.isVisible())) {
      if (!state.wolf) {
        const select = wolfForm.locator('select[name="target"]');
        const picked = wolfTargetName
          ? await selectOptionByLabel(select, wolfTargetName)
          : false;
        const selected = picked || await selectFirstOptionAvoidingLabel(select, avoidWolfTargetName);
        if (selected) {
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

    const guardForm = page.locator('#guard-form');
    if ((await guardForm.count()) && (await guardForm.isVisible())) {
      if (!state.guard) {
        const select = guardForm.locator('select[name="target"]');
        const picked = guardTargetName ? await selectOptionByLabel(select, guardTargetName) : false;
        const selected = picked || (await selectFirstOptionAvoidingLabel(select, avoidGuardTargetName));
        if (selected) {
          await guardForm.locator('button[type="submit"]').click();
          state.guard = true;
          acted = true;
        }
      }
    } else {
      state.guard = false;
    }

    submissionState.set(page, state);
  }
  return acted;
};

const trySubmitMayorVotes = async (
  pages: Page[],
  submissionState: Map<Page, SubmissionState>,
  options: { mayorTargetName?: string } = {}
) => {
  const { mayorTargetName } = options;
  let acted = false;
  for (const page of pages) {
    const state =
      submissionState.get(page) || { wolf: false, seer: false, witch: false, guard: false, mayor: false };
    try {
      const form = page.locator('#mayor-vote-form');
      if ((await form.count()) && (await form.isVisible())) {
        if (!state.mayor) {
        const select = form.locator('select[name="target"]');
        const picked = mayorTargetName
          ? await selectOptionByLabel(select, mayorTargetName)
          : false;
        if (mayorTargetName && !picked) {
          continue;
        }
        const selected = picked || (await selectFirstOption(select));
        if (!selected) {
          continue;
        }
          await form.locator('button[type="submit"]').click();
          state.mayor = true;
          acted = true;
        }
      } else {
        state.mayor = false;
      }
      submissionState.set(page, state);
    } catch {
      // Ignore closed pages.
    }
  }
  return acted;
};

export const completeMayorElection = async (
  host: Page,
  pages: Page[],
  options: { mayorTargetName?: string } = {}
) => {
  const submissionState = new Map<Page, SubmissionState>();
  const deadline = Date.now() + 15000;
  let formSeen = false;
  while (Date.now() < deadline) {
    const formVisible = await host
      .locator('#mayor-vote-form')
      .isVisible()
      .catch(() => false);
    if (formVisible) {
      formSeen = true;
    }
    if (formSeen && !formVisible) {
      return;
    }
    if (formVisible) {
      const acted = await trySubmitMayorVotes(pages, submissionState, options);
      if (!acted) {
        await host.waitForTimeout(200);
      }
      continue;
    }
    await host.waitForTimeout(200);
  }
  throw new Error('Mayor election did not resolve in time.');
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
    try {
      const overlay = page.locator('#hunter-overlay');
      if (await overlay.count()) {
        return page;
      }
      const form = page.locator('#hunter-form');
      if (await form.count()) {
        return page;
      }
    } catch {
      // Ignore closed pages.
    }
  }
  return null;
};

export const submitHunterShot = async (page: Page) => {
  await page.waitForSelector('#hunter-form', { state: 'attached' });
  const select = page.locator('#hunter-form select[name="target"]');
  const optionCount = await select.locator('option').count();
  if (optionCount > 1) {
    await select.selectOption({ index: 1 });
  }
  await page.click('#hunter-form button[type="submit"]', { force: true });
  await page.locator('#hunter-overlay').waitFor({ state: 'detached', timeout: 5000 });
};

export const ensureHunterOverlay = async (page: Page, roomCode?: string) => {
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

export const reconnectPage = async (page: Page, roomCode?: string) => {
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

export const waitForDayOnAllPages = async (pages: Page[]) => {
  await Promise.all(
    pages.map((page) =>
      page
        .waitForSelector('h3:has-text("Night Report")', { timeout: 15000 })
        .catch(() => null)
    )
  );
};

const findVisiblePage = async (pages: Page[], selector: string) => {
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

const getPhaseText = async (page: Page) => {
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

export const advanceToDay = async (
  host: Page,
  pages: Page[],
  options: {
    allowHunterStop?: boolean;
    wolfTargetName?: string;
    avoidWolfTargetName?: string;
    guardTargetName?: string;
    avoidGuardTargetName?: string;
    mayorTargetName?: string;
  } = {}
): Promise<AdvanceToDayResult> => {
  const {
    allowHunterStop = false,
    wolfTargetName,
    avoidWolfTargetName,
    guardTargetName,
    avoidGuardTargetName,
    mayorTargetName
  } = options;
  const submissionState = new Map<Page, SubmissionState>();
  const dayReportSelector = 'h3:has-text("Night Report")';
  const gameOverSelector = 'h2:has-text("Game Over")';
  let hunterShot = false;
  let lastPhase: string | null = null;
  for (let i = 0; i < 120; i += 1) {
    lastPhase = (await getPhaseText(host)) || lastPhase;
    const dayPage = await findVisiblePage(pages, dayReportSelector);
    if (dayPage) {
      return { hunterShot, gameOver: false, dayVisible: true, dayPage };
    }
    if (await findVisiblePage(pages, gameOverSelector)) {
      return { hunterShot, gameOver: true, dayVisible: false };
    }
    if (await trySubmitMayorVotes(pages, submissionState, { mayorTargetName })) {
      await host.waitForTimeout(200);
      continue;
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
    if (
      await trySubmitNightActions(pages, submissionState, {
        wolfTargetName,
        avoidWolfTargetName,
        guardTargetName,
        avoidGuardTargetName
      })
    ) {
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
    if (await tryClick(host.locator('#proceed-to-night-btn'))) {
      await host.waitForTimeout(150);
      continue;
    }
    if (await tryClick(host.locator('#skip-mayor-selection'))) {
      await host.waitForTimeout(150);
      continue;
    }
    if (await tryClick(host.locator('#skip-hunter-shot'))) {
      await host.waitForTimeout(150);
      continue;
    }
    if (await tryClick(host.locator('#proceed-to-night-btn'))) {
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

export const getAliveNames = async (page: Page) => {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.player-card'))
      .filter((card) => !card.classList.contains('dead'))
      .map((card) => card.querySelector('strong')?.textContent?.trim())
      .filter(Boolean);
  });
};

export const voteAllForTarget = async (
  players: { page: Page; name: string }[],
  targetName: string
) => {
  for (const player of players) {
    const form = player.page.locator('#vote-form');
    if (!(await form.count()) || !(await form.isVisible())) {
      continue;
    }
    const select = form.locator('select[name="target"]');
    if (player.name === targetName) {
      await select.selectOption('__abstain__');
    } else {
      const picked = await selectOptionByLabel(select, targetName);
      if (!picked) {
        await select.locator('option', { hasText: targetName }).first().waitFor({ state: 'attached', timeout: 5000 });
        await select.selectOption({ label: targetName });
      }
    }
    await player.page.click('#vote-submit');
  }
};

export const closeContexts = async (contexts: Array<Awaited<ReturnType<Browser['newContext']>>>) => {
  for (const context of contexts) {
    try {
      await context.close();
    } catch {
      // Ignore contexts already closed during test teardown.
    }
  }
};

export const findMayorPromptPage = async (pages: Page[]) => {
  for (const page of pages) {
    try {
      const overlay = page.locator('#mayor-overlay');
      if (await overlay.count()) {
        return page;
      }
      const form = page.locator('#mayor-form');
      if (await form.count()) {
        return page;
      }
    } catch {
      // Ignore closed pages.
    }
  }
  return null;
};

export const submitMayorSelection = async (page: Page, targetName?: string) => {
  await page.waitForSelector('#mayor-form', { state: 'attached' });
  const select = page.locator('#mayor-form select[name="target"]');
  if (targetName) {
    await selectOptionByLabel(select, targetName);
  } else {
    const optionCount = await select.locator('option').count();
    if (optionCount > 1) {
      await select.selectOption({ index: 1 });
    }
  }
  await page.click('#mayor-form button[type="submit"]', { force: true });
  await page.locator('#mayor-overlay').waitFor({ state: 'detached', timeout: 5000 });
};

export const ensureMayorOverlay = async (page: Page, roomCode?: string) => {
  const overlay = page.locator('#mayor-overlay');
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

export const getMayorName = async (page: Page) => {
  const mayorBadge = page.locator('.player-card:has(.tag:has-text("Mayor")) strong');
  const count = await mayorBadge.count();
  if (count > 0) {
    return mayorBadge.first().textContent();
  }
  return null;
};

export const waitForMayorSelectionPending = async (pages: Page[], timeout = 10000) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    for (const page of pages) {
      const overlay = page.locator('#mayor-overlay');
      if (await overlay.count()) {
        return page;
      }
      const pendingPanel = page.locator('h2:has-text("Awaiting Mayor Selection")');
      if (await pendingPanel.count()) {
        return page;
      }
    }
    await pages[0].waitForTimeout(200);
  }
  return null;
};
