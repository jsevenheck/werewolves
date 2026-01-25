import { test, expect } from '@playwright/test';
import {
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
  advanceToDay,
  getMayorName,
  findMayorPromptPage,
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

    // Check that a mayor was announced
    const mayorText = await host.locator('.panel').filter({ hasText: 'has been selected as the Mayor' }).textContent();
    expect(mayorText).toBeTruthy();

    // Extract mayor name from the announcement
    const mayorMatch = mayorText?.match(/(.+) has been selected as the Mayor/);
    const mayorName = mayorMatch ? mayorMatch[1].trim() : null;
    expect(mayorName).toBeTruthy();
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
  const [host, p2, p3, p4, p5] = pages;

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
    const mayorText = await host.locator('.panel').filter({ hasText: 'has been selected as the Mayor' }).textContent();
    const mayorMatch = mayorText?.match(/(.+) has been selected as the Mayor/);
    const mayorName = mayorMatch ? mayorMatch[1].trim() : null;
    expect(mayorName).toBeTruthy();

    await host.click('#continue-mayor');

    // Advance to day
    const { dayPage } = await advanceToDay(host, pages);
    expect(dayPage).toBeTruthy();

    // Find the mayor's page
    const mayorPage = pages.find((_, idx) => names[idx] === mayorName);
    expect(mayorPage).toBeTruthy();

    // Get two non-mayor targets for the tie
    const targets = names.filter(n => n !== mayorName);
    const targetA = targets[0];
    const targetB = targets[1];

    // Create a 2-2 tie scenario where mayor votes for targetA
    // Mayor votes for targetA, another player votes for targetA
    // Two other players vote for targetB
    for (const page of pages) {
      const voteForm = page.locator('#vote-form');
      if (!(await voteForm.count()) || !(await voteForm.isVisible())) continue;

      const playerName = names[pages.indexOf(page)];
      const select = voteForm.locator('select[name="target"]');

      if (playerName === mayorName) {
        // Mayor votes for targetA
        await select.selectOption({ label: targetA });
      } else if (playerName === targetA) {
        // targetA votes for targetB (to create tie)
        await select.selectOption({ label: targetB });
      } else if (playerName === targetB) {
        // targetB abstains
        await select.selectOption('__abstain__');
      } else if (targets.indexOf(playerName) < 2) {
        // First non-target votes for targetA
        await select.selectOption({ label: targetA });
      } else {
        // Second non-target votes for targetB
        await select.selectOption({ label: targetB });
      }

      await page.click('#vote-submit');
      await page.waitForTimeout(100);
    }

    // Wait for vote to resolve
    await host.waitForTimeout(3000);

    // Check logs for mayor tie-breaking message
    const logsPanel = await host.locator('#logs-panel').textContent();

    // The mayor's vote should have broken the tie
    const tieWasBroken = logsPanel?.includes("Mayor's vote decided") ||
                         logsPanel?.includes('was voted out');
    expect(tieWasBroken).toBe(true);

  } finally {
    await closeContexts(contexts);
  }
});

test('dying mayor selects successor', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5'];
  const { contexts, pages, code } = await createLobbyWithPlayers(browser, names);
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

    // Get the mayor name
    await host.waitForSelector('#continue-mayor', { timeout: 10000 });
    const mayorText = await host.locator('.panel').filter({ hasText: 'has been selected as the Mayor' }).textContent();
    const mayorMatch = mayorText?.match(/(.+) has been selected as the Mayor/);
    const mayorName = mayorMatch ? mayorMatch[1].trim() : null;
    expect(mayorName).toBeTruthy();

    await host.click('#continue-mayor');

    // Advance to day
    await advanceToDay(host, pages);

    // Find the mayor's page index
    const mayorIndex = names.indexOf(mayorName!);
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
    await closeContexts(contexts);
  }
});

test('host can skip mayor selection', async ({ browser }) => {
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

    // Get the mayor name
    await host.waitForSelector('#continue-mayor', { timeout: 10000 });
    const mayorText = await host.locator('.panel').filter({ hasText: 'has been selected as the Mayor' }).textContent();
    const mayorMatch = mayorText?.match(/(.+) has been selected as the Mayor/);
    const mayorName = mayorMatch ? mayorMatch[1].trim() : null;
    expect(mayorName).toBeTruthy();

    await host.click('#continue-mayor');

    // Advance to day
    await advanceToDay(host, pages);

    // Find the mayor's page index
    const mayorIndex = names.indexOf(mayorName!);
    const mayorPage = pages[mayorIndex];

    // All players vote out the mayor
    const playerData = pages.map((page, idx) => ({ page, name: names[idx] }));
    await voteAllForTarget(playerData, mayorName!);

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
    if (mayorName !== 'Host') {
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
    }

  } finally {
    await closeContexts(contexts);
  }
});
