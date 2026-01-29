import { test, expect } from "@playwright/test";
import {
  createLobbyWithPlayers,
  configureRoles,
  startGameAndReady,
  completeMayorElection,
} from "./helpers";

/**
 * Guard Protection E2E Test
 *
 * Tests the guard's ability to protect players from wolf attacks and poison.
 */

test("guard can protect a player from wolf attack", async ({ browser }) => {
  const names = ["Werewolf", "Guard", "Villager A", "Villager B", "Villager C"];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host, guard] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 1,
    });

    await startGameAndReady(pages);

    await completeMayorElection(host, pages);

    // Wolf selects Villager A as target
    await host.waitForSelector("#wolf-form", { timeout: 10000 });
    await host
      .locator('#wolf-form select[name="target"]')
      .selectOption({ label: names[2] });
    await host.locator('#wolf-form button[type="submit"]').click();
    await host.locator("#wolf-form").waitFor({ state: "detached" });

    // Guard protects Villager A
    await guard.waitForSelector("#guard-form", { timeout: 10000 });
    await guard
      .locator('#guard-form select[name="target"]')
      .selectOption({ label: names[2] });
    await guard.locator('#guard-form button[type="submit"]').click();
    await guard.locator("#guard-form").waitFor({ state: "detached" });

    // Check night report - no one should have died
    await host.waitForSelector('h3:has-text("Night Report")', {
      timeout: 15000,
    });
    const report = host.locator(
      'section.panel:has(h3:has-text("Night Report"))'
    );
    await expect(report).toContainText("No one died last night.");
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.close()));
  }
});

test("guard cannot protect the same player two nights in a row", async ({
  browser,
}) => {
  const names = ["Werewolf", "Guard", "Villager A", "Villager B", "Villager C"];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host, guard] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 0,
      armor: 0,
      joker: 0,
      guard: 1,
    });

    await startGameAndReady(pages);

    await completeMayorElection(host, pages);

    // Night 1: Wolf targets Villager A, Guard protects Villager A
    await host.waitForSelector("#wolf-form", { timeout: 10000 });
    await host
      .locator('#wolf-form select[name="target"]')
      .selectOption({ label: names[2] });
    await host.locator('#wolf-form button[type="submit"]').click();
    await host.locator("#wolf-form").waitFor({ state: "detached" });

    await guard.waitForSelector("#guard-form", { timeout: 10000 });
    await guard
      .locator('#guard-form select[name="target"]')
      .selectOption({ label: names[2] });
    await guard.locator('#guard-form button[type="submit"]').click();
    await guard.locator("#guard-form").waitFor({ state: "detached" });

    // Wait for day and skip voting (abstain)
    await host.waitForSelector('h3:has-text("Night Report")', {
      timeout: 15000,
    });
    await host.waitForSelector("#vote-form", { timeout: 10000 });

    // All players abstain from voting
    for (const page of pages) {
      const form = page.locator('#vote-form');
      if (await form.isVisible()) {
        await form.locator('select[name="target"]').selectOption('__abstain__');
        await page.locator('#vote-submit').click();
      }
    }

    // Host must click "Proceed to Night" after vote is resolved
    const proceedBtn = host.locator('#proceed-to-night-btn');
    await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
    await proceedBtn.click();

    // Wait for night 2
    await host.waitForSelector("#wolf-form", { timeout: 15000 });

    // Wolf targets Villager A again
    await host
      .locator('#wolf-form select[name="target"]')
      .selectOption({ label: names[2] });
    await host.locator('#wolf-form button[type="submit"]').click();
    await host.locator("#wolf-form").waitFor({ state: "detached" });

    // Guard should see that Villager A is disabled (last protected)
    await guard.waitForSelector("#guard-form", { timeout: 10000 });
    
    // Check that Villager A cannot be selected (last protected player)
    const guardSelect = guard.locator('#guard-form select[name="target"]');
    const options = await guardSelect.locator("option").allTextContents();
    
    // Villager A should not be in the available options (excluding the placeholder)
    const selectableOptions = options.filter(opt => opt !== "Select a player");
    expect(selectableOptions).not.toContain(names[2]);
    
    // Guard protects Villager B instead
    await guardSelect.selectOption({ label: names[3] });
    await guard.locator('#guard-form button[type="submit"]').click();
    await guard.locator("#guard-form").waitFor({ state: "detached" });

    // Villager A should die this night since guard protected someone else
    await host.waitForSelector('h3:has-text("Night Report")', {
      timeout: 15000,
    });
    const report = host.locator(
      'section.panel:has(h3:has-text("Night Report"))'
    );
    await expect(report).toContainText(names[2]);
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.close()));
  }
});

test("guard can protect against witch poison", async ({ browser }) => {
  const names = ["Werewolf", "Witch", "Guard", "Villager A", "Villager B"];
  const { contexts, pages } = await createLobbyWithPlayers(browser, names);
  const [host, witch, guard] = pages;

  try {
    await configureRoles(host, {
      werewolf: 1,
      seer: 0,
      hunter: 0,
      witch: 1,
      armor: 0,
      joker: 0,
      guard: 1,
    });

    await startGameAndReady(pages);

    await completeMayorElection(host, pages);

    // Wolf targets Villager A
    await host.waitForSelector("#wolf-form", { timeout: 10000 });
    await host
      .locator('#wolf-form select[name="target"]')
      .selectOption({ label: names[3] });
    await host.locator('#wolf-form button[type="submit"]').click();
    await host.locator("#wolf-form").waitFor({ state: "detached" });

    // Witch poisons Villager B
    await witch.waitForSelector("#poison-select", { timeout: 10000 });
    await witch.locator("#poison-select").selectOption({ label: names[4] });
    await witch.locator("#poison-btn").click();
    // After poisoning, witch needs to skip to proceed (she still has heal available)
    await witch.locator("#skip-witch").click();

    // Guard protects Villager B (poison target)
    await guard.waitForSelector("#guard-form", { timeout: 10000 });
    await guard
      .locator('#guard-form select[name="target"]')
      .selectOption({ label: names[4] });
    await guard.locator('#guard-form button[type="submit"]').click();
    await guard.locator("#guard-form").waitFor({ state: "detached" });

    // Night report: Villager A dies (wolf), Villager B survives (guard protected)
    await host.waitForSelector('h3:has-text("Night Report")', {
      timeout: 15000,
    });
    
    // Find the death list specifically (ul after Night Report header or the "No one died" message)
    const nightReportSection = host.locator('section.panel:has(h3:has-text("Night Report"))');
    const deathList = nightReportSection.locator('h3:has-text("Night Report") + ul, h3:has-text("Night Report") + p');
    
    // Villager A should have died from wolf attack
    await expect(deathList).toContainText(names[3]);
    // Villager B should have survived (not in death report)
    await expect(deathList).not.toContainText(names[4]);
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.close()));
  }
});
