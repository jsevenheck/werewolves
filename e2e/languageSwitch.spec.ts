import { test, expect } from '@playwright/test';

test.use({ locale: 'en-US' });

const localeStorageKey = 'werewolves.locale';

async function expectStoredLocale(page: import('@playwright/test').Page, locale: 'en' | 'de') {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), localeStorageKey))
    .toBe(locale);
}

test('player can switch lobby language between English and German', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Werewolves', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Lobby' })).toBeVisible();

  await page.locator('#create-form input[name="name"]').fill('Host');
  await page.locator('#create-form').getByRole('button', { name: 'Create Lobby' }).click();

  await expect(page.getByRole('heading', { name: /^Room [A-Z2-9]{4}$/ })).toBeVisible();
  await expect(page.getByText('Share this code so friends can join:')).toBeVisible();
  await expect(page.getByText('Configured roles:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();

  await page.getByLabel('Language').selectOption('de');

  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expectStoredLocale(page, 'de');
  await expect(page.getByLabel('Sprache')).toHaveValue('de');
  await expect(page.getByRole('heading', { name: /^Raum [A-Z2-9]{4}$/ })).toBeVisible();
  await expect(page.getByText('Teile diesen Code, damit Freunde beitreten können:')).toBeVisible();
  await expect(page.getByText('Konfigurierte Rollen:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spiel starten' })).toBeVisible();
  await expect(page.getByText('Share this code so friends can join:')).toBeHidden();

  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expectStoredLocale(page, 'de');
  await expect(page.getByRole('heading', { name: /^Raum [A-Z2-9]{4}$/ })).toBeVisible();
  await expect(page.getByText('Teile diesen Code, damit Freunde beitreten können:')).toBeVisible();

  await page.getByLabel('Sprache').selectOption('en');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expectStoredLocale(page, 'en');
  await expect(page.getByLabel('Language')).toHaveValue('en');
  await expect(page.getByRole('heading', { name: /^Room [A-Z2-9]{4}$/ })).toBeVisible();
  await expect(page.getByText('Share this code so friends can join:')).toBeVisible();
  await expect(page.getByText('Configured roles:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByText('Teile diesen Code, damit Freunde beitreten können:')).toBeHidden();
});
