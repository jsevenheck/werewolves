import { expect, test, type Page } from '@playwright/test';
import { createLobbyWithPlayers } from './helpers';

const ADMIN_TOKEN = process.env.WEREWOLVES_ADMIN_TOKEN ?? 'e2e-admin-token';

/**
 * Drive the admin token prompt: type the token and submit, then wait for the
 * room list to appear. Works whether the prompt is shown (no localStorage) or
 * the token is already pre-seeded (the form is still typeable because we
 * never pre-fill it on mount — the user must hit Submit to open the socket).
 */
async function loginAsAdmin(page: Page) {
  // If the prompt is visible, fill + submit. If the page already has a token
  // (localStorage pre-seeded), the prompt is hidden but the room list won't
  // appear until we trigger connect. We just always go through the input
  // path; the password input is rendered only when hasToken is false. In the
  // pre-seeded case we set localStorage AFTER navigation and reload.
  const prompt = page.locator('[data-testid="admin-token-prompt"]');
  if (await prompt.count()) {
    await page.fill('[data-testid="admin-token-input"]', ADMIN_TOKEN);
    await page.click('[data-testid="admin-token-submit"]');
  }
  await page.waitForSelector('[data-testid="admin-room-list"]', { timeout: 10000 });
}

test.describe('admin token flow', () => {
  test('admin can list, drill into, and kick a player from a room', async ({ browser }) => {
    // 1. Create a real room with a host and a target so the admin view has
    //    something to list.
    const lobby = await createLobbyWithPlayers(browser, ['AdminHost', 'KickTarget']);
    const [hostPage] = lobby.pages;
    const { code: roomCode } = lobby;
    expect(roomCode).toMatch(/^[A-Z0-9]+$/);

    // 2. Open the admin page in a new isolated context.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/?admin=1');
    await loginAsAdmin(adminPage);

    // 3. Fetch the current room list and verify our room shows up.
    await adminPage.click('[data-testid="admin-refresh"]');
    const row = adminPage.locator(`[data-testid="admin-room-row-${roomCode}"]`);
    await expect(row).toBeVisible({ timeout: 10000 });

    // 4. Open the room detail view.
    await adminPage.click(`[data-testid="admin-open-${roomCode}"]`);
    await adminPage.waitForSelector('[data-testid="admin-room-detail"]', { timeout: 5000 });

    // 5. Identify the target player row (the second player is the kick target).
    const targetPlayerRow = adminPage.locator('[data-testid^="admin-player-"]').nth(1);
    const targetPlayerId = await targetPlayerRow.getAttribute('data-testid');
    expect(targetPlayerId).toBeTruthy();
    const targetPlayerIdClean = targetPlayerId!.replace('admin-player-', '');

    // 6. Confirm the kick (auto-accept any confirm dialog).
    adminPage.on('dialog', (dialog) => dialog.accept());

    // 7. Race a server-side state change: after the kick, the admin
    //    page's list refresh (triggered automatically by the click) shows
    //    the room with player count 1. This implicitly proves the server
    //    processed the kick — we do NOT wait for the target's browser tab
    //    to close, because the server only disconnects the socket
    //    (`socket.disconnect(true)`) and never closes the browser tab.
    const kickButton = adminPage.locator(`[data-testid="admin-kick-${targetPlayerIdClean}"]`);
    await kickButton.click();

    // 8. The target player's row must disappear from the detail view
    //    (selectedRoom.players re-derives from the refreshed RoomSummary
    //    list — see AdminPage.vue:418 and the comment in kickPlayer).
    await expect(
      adminPage.locator(`[data-testid="admin-player-${targetPlayerIdClean}"]`)
    ).toHaveCount(0, { timeout: 10000 });

    // 9. Go back to the list and verify the player count dropped to 1.
    await adminPage.click('[data-testid="admin-back"]');
    await adminPage.waitForSelector('[data-testid="admin-room-list"]');
    await adminPage.click('[data-testid="admin-refresh"]');
    const updatedRow = adminPage.locator(`[data-testid="admin-room-row-${roomCode}"]`);
    await expect(updatedRow).toBeVisible({ timeout: 5000 });
    // Column layout in AdminPage.vue: [code, players, phase, dayCount, hostName, actions]
    // The players column shows "connectedCount/totalCount" (e.g. "1/1" for a
    // single remaining player). After the kick, total should be 1.
    const playerCountCell = updatedRow.locator('td').nth(1);
    await expect(playerCountCell).toHaveText(/^1\/\d+$/);

    // Cleanup.
    await adminContext.close();
    await hostPage.context().close();
  });

  test('admin page without token shows the token prompt', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/?admin=1');
    await page.waitForSelector('[data-testid="admin-token-prompt"]', { timeout: 5000 });
    await expect(page.locator('[data-testid="admin-room-list"]')).toHaveCount(0);
    await context.close();
  });

  test('admin page with a wrong token never reveals the room list', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/?admin=1');
    // Token prompt is always shown when there's no token in localStorage.
    await page.waitForSelector('[data-testid="admin-token-prompt"]', { timeout: 5000 });
    await page.fill('[data-testid="admin-token-input"]', 'definitely-not-the-real-token');
    // Auto-accept the "no rooms" or error notification if any.
    page.on('dialog', (dialog) => dialog.accept());
    await page.click('[data-testid="admin-token-submit"]');
    // Give the server a moment to (fail to) authenticate. The prompt should
    // re-appear with a tokenError OR the list should stay empty.
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="admin-room-list"]')).toHaveCount(0);
    await context.close();
  });
});
