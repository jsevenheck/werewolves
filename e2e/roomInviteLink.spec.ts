import { expect, test } from '@playwright/test';

test('room invite link pre-fills the join code', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  // Headless Chromium exposes navigator.share but rejects it with
  // AbortError (no user gesture), which makes shareRoomLink return
  // silently and never raise the "copied" alert. Stub it away so the
  // deterministic clipboard path is exercised instead.
  await hostContext.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await hostContext.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:5173',
  });
  const host = await hostContext.newPage();
  const joiner = await joinerContext.newPage();

  try {
    await host.goto('/');
    await host.fill('#create-form input[name="name"]', 'Host');
    await host.click('#create-form button[type="submit"]');
    await host.waitForSelector('[data-room-code]');

    const code = (await host.locator('[data-room-code]').getAttribute('data-room-code'))?.trim();
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    await expect(host.locator('#share-room-link')).toBeVisible();
    const copyDialog = host.waitForEvent('dialog');
    await host.click('#share-room-link');
    const dialog = await copyDialog;
    expect(dialog.message()).toContain('copied');
    await dialog.accept();
    await expect
      .poll(() => host.evaluate(() => navigator.clipboard.readText()))
      .toContain(`?room=${code}`);

    await joiner.goto(`/?room=${code}`);
    await expect(joiner.locator('#join-form input[name="code"]')).toHaveValue(code ?? '');
    await expect(joiner.locator('#share-room-link')).toHaveCount(0);
  } finally {
    await Promise.all([hostContext.close(), joinerContext.close()]);
  }
});
