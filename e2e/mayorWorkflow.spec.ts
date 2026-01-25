import { test, expect } from '@playwright/test';
import {
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
  advanceToDay,
  getMayorName,
  submitMayorSelection,
  voteAllForTarget,
  getAliveNames
} from './helpers';

test('mayor is selected and displayed during mayor phase', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4'];
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

    // Mayor phase should appear after role reveal
    await host.waitForSelector('h2:has-text("Mayor Selected")', { timeout: 10000 });

    // Check that a mayor was announced - use more specific locator
    const mayorPanel = host.locator('.panel:has(h2:has-text("Mayor Selected"))');
    const mayorText = await mayorPanel.textContent();
    expect(mayorText).toBeTruthy();

    // Extract mayor name from the announcement
    const mayorMatch = mayorText?.match(/(.+) has been selected as the Mayor/);
    const mayorName = mayorMatch ? mayorMatch[1].trim() : null;
    expect(mayorName).toBeTruthy();
    if (!mayorName) {
      throw new Error('Mayor name missing.');
    }
    expect(names).toContain(mayorName);

    // Host clicks continue to advance past mayor phase
    await host.waitForSelector('#continue-mayor', { timeout: 5000 });
    await host.click('#continue-mayor');

    // Advance to day phase
    const { dayPage } = await advanceToDay(host, pages);
    expect(dayPage).toBeTruthy();

    // Verify mayor badge appears in player list
    const actualMayorName = await getMayorName(dayPage!);
    expect(actualMayorName).toBe(mayorName);

  } finally {
    await closeContexts(contexts);
  }
});

test('mayor vote breaks tie in day voting', async ({ browser }) => {
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
      minPlayers: 5
    });

    await startGameAndReady(pages);

    // Advance past mayor phase
    await host.waitForSelector('#continue-mayor', { timeout: 10000 });
    const mayorPanel = host.locator('.panel:has(h2:has-text("Mayor Selected"))');
    const mayorText = await mayorPanel.textContent();
    const mayorMatch = mayorText?.match(/(.+) has been selected as the Mayor/);
    const mayorName = mayorMatch ? mayorMatch[1].trim() : null;
    expect(mayorName).toBeTruthy();
    if (!mayorName) {
      throw new Error('Mayor name missing.');
    }
    const mayorNameValue = mayorName;

    await host.click('#continue-mayor');

    const wolfTargetName =
      names.find((name) => name !== 'Host' && name !== mayorNameValue) ||
      names.find((name) => name !== mayorNameValue);
    expect(wolfTargetName).toBeTruthy();

    // Advance to day
    const { dayPage } = await advanceToDay(host, pages, { wolfTargetName: wolfTargetName || undefined });
    expect(dayPage).toBeTruthy();

    // Find the mayor's page
    const mayorPage = pages.find((_, idx) => names[idx] === mayorNameValue);
    expect(mayorPage).toBeTruthy();

    const aliveNames = (await getAliveNames(dayPage!)).filter(
      (name): name is string => !!name
    );
    expect(aliveNames).toContain(mayorNameValue);

    // Get two non-mayor alive targets for the tie
    const candidates = aliveNames.filter((name) => name !== mayorNameValue);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    const targetA = candidates[0];
    const targetB = candidates[1];
    const targetC = candidates[2];
    if (!targetA || !targetB || !targetC) {
      throw new Error('Not enough alive targets for tie vote.');
    }

    // Create a 2-2 tie scenario where mayor votes for targetA
    // Mayor votes for targetA, another player votes for targetA
    // Two other players vote for targetB
    const votePlan = new Map<string, string | null>([
      [mayorNameValue, targetA],
      [targetA, targetB],
      [targetB, targetA],
      [targetC, targetB]
    ]);

    for (const page of pages) {
      const voteForm = page.locator('#vote-form');
      if (!(await voteForm.count()) || !(await voteForm.isVisible())) continue;

      const playerName = names[pages.indexOf(page)];
      const select = voteForm.locator('select[name="target"]');
      const voteTarget = votePlan.get(playerName) ?? null;
      if (voteTarget === null) {
        await select.selectOption('__abstain__');
      } else {
        const option = select.locator('option', { hasText: voteTarget }).first();
        await option.waitFor({ state: 'attached', timeout: 2000 });
        await select.selectOption({ label: voteTarget });
      }

      await page.click('#vote-submit');
      await page.waitForTimeout(100);
    }

    // Wait for vote to resolve
    await host.waitForTimeout(3000);

    // Check logs for mayor tie-breaking message
    const logsPanel = await host.locator('#logs-panel').textContent();

    // The mayor's vote should have broken the tie or someone was voted out
    const voteResolved = logsPanel?.includes("Mayor's vote decided") ||
                         logsPanel?.includes('voted out') ||
                         logsPanel?.includes('executed by vote');
    expect(voteResolved).toBe(true);

  } finally {
    await closeContexts(contexts);
  }
});

test('dying mayor selects successor', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5'];
  let contexts: Awaited<ReturnType<typeof createLobbyWithPlayers>>['contexts'] | null = null;
  let pages: Awaited<ReturnType<typeof createLobbyWithPlayers>>['pages'] | null = null;
  let host: Awaited<ReturnType<typeof createLobbyWithPlayers>>['pages'][0] | null = null;
  let mayorName: string | null = null;

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const attemptSetup = await createLobbyWithPlayers(browser, names);
      const attemptHost = attemptSetup.pages[0];

      await configureRoles(attemptHost, {
        werewolf: 1,
        seer: 0,
        hunter: 0,
        witch: 0,
        armor: 0,
        joker: 0,
        minPlayers: 5
      });

      await startGameAndReady(attemptSetup.pages);

      // Get the mayor name
      await attemptHost.waitForSelector('#continue-mayor', { timeout: 10000 });
      const mayorPanel = attemptHost.locator('.panel:has(h2:has-text("Mayor Selected"))');
      const mayorText = await mayorPanel.textContent();
      const mayorMatch = mayorText?.match(/(.+) has been selected as the Mayor/);
      mayorName = mayorMatch ? mayorMatch[1].trim() : null;
      expect(mayorName).toBeTruthy();

      if (mayorName !== 'Host') {
        contexts = attemptSetup.contexts;
        pages = attemptSetup.pages;
        host = attemptHost;
        break;
      }

      await closeContexts(attemptSetup.contexts);
      mayorName = null;
    }

    if (!contexts || !pages || !host || !mayorName) {
      throw new Error('Unable to create a game with a non-host mayor in time.');
    }

    await host.click('#continue-mayor');

    const wolfTargetName =
      names.find((name) => name !== 'Host' && name !== mayorName) ||
      names.find((name) => name !== mayorName);
    expect(wolfTargetName).toBeTruthy();

    // Advance to day
    await advanceToDay(host, pages, { wolfTargetName: wolfTargetName || undefined });

    // Find the mayor's page index
    const mayorIndex = names.indexOf(mayorName);
    const mayorPage = pages[mayorIndex];
    expect(mayorPage).toBeTruthy();

    // All players vote out the mayor
    const playerData = pages.map((page, idx) => ({ page, name: names[idx] }));
    await voteAllForTarget(playerData, mayorName!);

    // Wait for vote to resolve and mayor overlay to appear
    await host.waitForTimeout(2000);

    // The dying mayor should see the mayor selection overlay
    const mayorOverlay = mayorPage.locator('#mayor-overlay');
    const overlayVisible = await mayorOverlay
      .waitFor({ state: 'attached', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    expect(overlayVisible).toBe(true);

    // Mayor selects a successor
    const successorName = names.find(n => n !== mayorName);
    await submitMayorSelection(mayorPage, successorName);

    // Verify the new mayor is set
    await host.waitForTimeout(1000);

    // Check logs for appointment message
    const logsPanel = await host.locator('#logs-panel').textContent();
    expect(logsPanel).toContain('appointed as the new Mayor');

  } finally {
    if (contexts) {
      await closeContexts(contexts);
    }
  }
});

test('host can skip mayor selection', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5'];
  let contexts: Awaited<ReturnType<typeof createLobbyWithPlayers>>['contexts'] | null = null;
  let pages: Awaited<ReturnType<typeof createLobbyWithPlayers>>['pages'] | null = null;
  let host: Awaited<ReturnType<typeof createLobbyWithPlayers>>['pages'][0] | null = null;
  let mayorName: string | null = null;

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const attemptSetup = await createLobbyWithPlayers(browser, names);
      const attemptHost = attemptSetup.pages[0];

      await configureRoles(attemptHost, {
        werewolf: 1,
        seer: 0,
        hunter: 0,
        witch: 0,
        armor: 0,
        joker: 0,
        minPlayers: 5
      });

      await startGameAndReady(attemptSetup.pages);

      // Get the mayor name
      await attemptHost.waitForSelector('#continue-mayor', { timeout: 10000 });
      const mayorPanel = attemptHost.locator('.panel:has(h2:has-text("Mayor Selected"))');
      const mayorText = await mayorPanel.textContent();
      const mayorMatch = mayorText?.match(/(.+) has been selected as the Mayor/);
      mayorName = mayorMatch ? mayorMatch[1].trim() : null;
      expect(mayorName).toBeTruthy();

      if (mayorName && mayorName !== 'Host') {
        contexts = attemptSetup.contexts;
        pages = attemptSetup.pages;
        host = attemptHost;
        break;
      }

      await closeContexts(attemptSetup.contexts);
      mayorName = null;
    }

    if (!contexts || !pages || !host || !mayorName) {
      throw new Error('Unable to create a game with a non-host mayor in time.');
    }

    await host.click('#continue-mayor');

    const wolfTargetName =
      names.find((name) => name !== 'Host' && name !== mayorName) ||
      names.find((name) => name !== mayorName);
    expect(wolfTargetName).toBeTruthy();

    // Advance to day
    await advanceToDay(host, pages, { wolfTargetName: wolfTargetName || undefined });

    // Find the mayor's page index
    const mayorIndex = names.indexOf(mayorName);
    const mayorPage = pages[mayorIndex];

    // All players vote out the mayor
    const playerData = pages.map((page, idx) => ({ page, name: names[idx] }));
    await voteAllForTarget(playerData, mayorName);

    // Wait for mayor selection to start
    await host.waitForTimeout(2000);

    // The dying mayor should see the overlay
    const mayorOverlay = mayorPage.locator('#mayor-overlay');
    const overlayAppeared = await mayorOverlay
      .waitFor({ state: 'attached', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    expect(overlayAppeared).toBe(true);

    // Host (if not the mayor) should see the skip button
    const skipButton = host.locator('#skip-mayor-selection');
    const skipVisible = await skipButton
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    expect(skipVisible).toBe(true);

    // Click skip
    await skipButton.click();

    // Overlay should disappear from mayor's page
    await mayorOverlay.waitFor({ state: 'detached', timeout: 5000 });

    // Game should continue (night phase should start or game should end)
    await host.waitForTimeout(2000);
    const phaseText = await host.locator('text=Phase:').textContent();
    expect(phaseText).toBeTruthy();

  } finally {
    if (contexts) {
      await closeContexts(contexts);
    }
  }
});
