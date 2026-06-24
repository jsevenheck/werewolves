import { test, expect } from '@playwright/test';

const localeStorageKey = 'werewolves.locale';

test('invalid stored locale falls back to English instead of crashing or using browser locale', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'de-DE' });
  await context.addInitScript(
    ({ key, value }: { key: string; value: string }) => window.localStorage.setItem(key, value),
    { key: localeStorageKey, value: 'xx' }
  );
  const page = await context.newPage();

  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Werewolves', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Lobby' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Werwölfe', level: 1 })).toBeHidden();

  await context.close();
});

test('browser and malformed stored locales normalize to supported languages', async ({
  browser,
}) => {
  const browserLocaleContext = await browser.newContext({ locale: 'de-DE' });
  const browserLocalePage = await browserLocaleContext.newPage();

  await browserLocalePage.goto('/');

  await expect(browserLocalePage.locator('html')).toHaveAttribute('lang', 'de');
  await expect(
    browserLocalePage.getByRole('heading', { name: 'Werwölfe', level: 1 })
  ).toBeVisible();

  await browserLocaleContext.close();

  const storedLocaleContext = await browser.newContext({ locale: 'en-US' });
  await storedLocaleContext.addInitScript(
    ({ key, value }: { key: string; value: string }) => window.localStorage.setItem(key, value),
    { key: localeStorageKey, value: 'de_DE' }
  );
  const storedLocalePage = await storedLocaleContext.newPage();

  await storedLocalePage.goto('/');

  await expect(storedLocalePage.locator('html')).toHaveAttribute('lang', 'de');
  await expect(storedLocalePage.getByRole('heading', { name: 'Werwölfe', level: 1 })).toBeVisible();
  await storedLocalePage.locator('#create-form input[name="name"]').fill('Host');
  await storedLocalePage.getByRole('button', { name: 'Lobby erstellen' }).click();
  await expect(storedLocalePage.getByRole('combobox', { name: 'Sprache' })).toHaveValue('de');

  await storedLocaleContext.close();
});
