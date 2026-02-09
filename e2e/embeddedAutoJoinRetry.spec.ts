import { expect, test } from '@playwright/test';

test('embedded auto-join shows retry and recovers after reconnect', async ({ page }) => {
  const sessionId = `embedded-${Date.now()}`;
  const playerId = `player-${Date.now()}`;
  await page.goto(
    `/embedded-test.html?sessionId=${sessionId}&playerId=${playerId}&playerName=Embedded+Tester&socketPath=%2Fsocket.io-bad&autoFixOnRetry=1`
  );

  const retryButton = page.getByRole('button', { name: 'Retry' });
  await expect(retryButton).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Please retry\./)).toBeVisible();

  await retryButton.click();

  await expect(page.locator('h1')).toContainText('Room', { timeout: 15000 });
  await expect(retryButton).toHaveCount(0);
});
