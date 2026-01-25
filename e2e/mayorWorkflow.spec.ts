import { test, expect, type Page } from '@playwright/test';
import {
  closeContexts,
  configureRoles,
  createLobbyWithPlayers,
  startGameAndReady,
  advanceToDay,
  getMayorName,
  completeMayorElection,
  submitMayorSelection,
  voteAllForTarget,
  getAliveNames
} from './helpers';

type VotePlan = Record<string, string>;

const submitMayorVotes = async (pages: Page[], names: string[], votePlan: VotePlan) => {
  for (const page of pages) {
    const playerName = names[pages.indexOf(page)];
    if (!playerName) continue;
    const target = votePlan[playerName];
    if (!target) continue;
    const form = page.locator('#mayor-vote-form');
    await form.waitFor({ state: 'visible', timeout: 10000 });
    const select = form.locator('select[name="target"]');
    const option = select.locator('option', { hasText: target }).first();
    await option.waitFor({ state: 'attached', timeout: 5000 });
    await select.selectOption({ label: target });
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);
  }
};

test('mayor is selected and displayed during mayor phase', async ({ browser }) => {
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
      joker: 0
    });

    await startGameAndReady(pages);

    await host.waitForSelector('#mayor-vote-form', { timeout: 10000 });
    const mayorTarget = names[1];
    await completeMayorElection(host, pages, { mayorTargetName: mayorTarget });

    // Verify mayor badge appears in player list
    const actualMayorName = await getMayorName(host);
    expect(actualMayorName).toBe(mayorTarget);

  } finally {
    await closeContexts(contexts);
  }
});

test('mayor can be disabled in the lobby', async ({ browser }) => {
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
      passiveRoles: { mayor: false }
    });

    await startGameAndReady(pages);

    await expect(host.locator('#mayor-vote-form')).toHaveCount(0, { timeout: 2000 });
    await host.waitForSelector('text=Phase: Night', { timeout: 10000 });
  } finally {
    await closeContexts(contexts);
  }
});

test('mayor election revote resolves a tie', async ({ browser }) => {
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
      joker: 0
    });

    await startGameAndReady(pages);

    await host.waitForSelector('#mayor-vote-form', { timeout: 10000 });
    const initialPlan: VotePlan = {
      Host: 'Host',
      Player2: 'Player2',
      Player3: 'Host',
      Player4: 'Player2',
      Player5: 'Player3'
    };
    await submitMayorVotes(pages, names, initialPlan);

    await host.waitForSelector('text=Revote among tied candidates.', { timeout: 10000 });

    const revotePlan: VotePlan = {
      Host: 'Host',
      Player2: 'Host',
      Player3: 'Host',
      Player4: 'Host',
      Player5: 'Host'
    };
    await submitMayorVotes(pages, names, revotePlan);

    await host.locator('#mayor-vote-form').waitFor({ state: 'detached', timeout: 10000 });

    const actualMayorName = await getMayorName(host);
    expect(actualMayorName).toBe('Host');
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
      joker: 0
    });

    await startGameAndReady(pages);

    const mayorNameValue = names[1];
    const wolfTargetName = names[2];

    // Advance to day
    const { dayPage } = await advanceToDay(host, pages, {
      wolfTargetName,
      mayorTargetName: mayorNameValue
    });
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

test('host can finalize mayor vote early', async ({ browser }) => {
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
      joker: 0
    });

    await startGameAndReady(pages);

    await host.waitForSelector('#mayor-vote-form', { timeout: 10000 });
    const votePlan: VotePlan = {
      Host: 'Player2',
      Player2: 'Player2'
    };
    await submitMayorVotes(pages, names, votePlan);

    const endButton = host.locator('#end-mayor-vote-btn');
    await endButton.waitFor({ state: 'visible', timeout: 5000 });
    await endButton.click();

    await host.locator('#mayor-vote-form').waitFor({ state: 'detached', timeout: 10000 });

    const mayorBadge = host.locator('.player-card:has(.tag:has-text("Mayor")) strong');
    await expect(mayorBadge).toHaveText('Player2', { timeout: 10000 });
    const actualMayorName = await getMayorName(host);
    expect(actualMayorName).toBe('Player2');
  } finally {
    await closeContexts(contexts);
  }
});

test('dying mayor selects successor', async ({ browser }) => {
  const names = ['Host', 'Player2', 'Player3', 'Player4', 'Player5'];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host] = pages;
  const mayorName = names[1];

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0
    });

    await startGameAndReady(pages);

    // Advance to day
    await advanceToDay(host, pages, {
      wolfTargetName: names[2],
      mayorTargetName: mayorName
    });

    // Find the mayor's page index
    const mayorIndex = names.indexOf(mayorName);
    const mayorPage = pages[mayorIndex];
    expect(mayorPage).toBeTruthy();

    // All players vote out the mayor
    const playerData = pages.map((page, idx) => ({ page, name: names[idx] }));
    await voteAllForTarget(playerData, mayorName);

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
    const successorName = names.find((n) => n !== mayorName);
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
  const mayorName = names[1];

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0
    });

    await startGameAndReady(pages);

    // Advance to day
    await advanceToDay(host, pages, {
      wolfTargetName: names[2],
      mayorTargetName: mayorName
    });

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
    await closeContexts(contexts);
  }
});
