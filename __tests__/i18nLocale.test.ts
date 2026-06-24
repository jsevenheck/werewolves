import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getBrowserLocale,
  getCurrentLocale,
  getStoredLocale,
  initializeLocale,
  normalizeLocale,
  setLocale,
} from '../ui-vue/src/i18n';

const localeStorageKey = 'werewolves.locale';

function stubBrowser(
  options: {
    storedLocale?: string;
    browserLanguages?: string[];
    getThrows?: boolean;
    setThrows?: boolean;
  } = {}
) {
  const values = new Map<string, string>();
  if (options.storedLocale !== undefined) {
    values.set(localeStorageKey, options.storedLocale);
  }

  const localStorage = {
    getItem: vi.fn((key: string) => {
      if (options.getThrows) throw new Error('localStorage read blocked');
      return values.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (options.setThrows) throw new Error('localStorage write blocked');
      values.set(key, value);
    }),
  };
  const navigator = {
    languages: options.browserLanguages ?? ['en-US'],
    language: options.browserLanguages?.[0] ?? 'en-US',
  };
  const documentElement = { lang: '' };

  vi.stubGlobal('window', { localStorage, navigator });
  vi.stubGlobal('document', { documentElement });

  return { documentElement, localStorage, values };
}

afterEach(() => {
  vi.unstubAllGlobals();
  initializeLocale('en');
});

describe('i18n locale handling', () => {
  test.each([
    ['de_DE', 'de'],
    ['de-DE', 'de'],
    ['DE', 'de'],
    ['en_US', 'en'],
    ['EN-gb', 'en'],
    ['xx', null],
    ['', null],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });

  test('falls back to English for unsupported stored locales before browser preferences', () => {
    const { documentElement } = stubBrowser({ storedLocale: 'xx', browserLanguages: ['de-DE'] });

    initializeLocale();

    expect(getStoredLocale()).toBe('en');
    expect(getCurrentLocale()).toBe('en');
    expect(documentElement.lang).toBe('en');
  });

  test('uses normalized browser locale when no stored locale exists', () => {
    const { documentElement } = stubBrowser({ browserLanguages: ['de_DE', 'en-US'] });

    initializeLocale();

    expect(getBrowserLocale()).toBe('de');
    expect(getCurrentLocale()).toBe('de');
    expect(documentElement.lang).toBe('de');
  });

  test('normalizes malformed stored locales', () => {
    const { documentElement } = stubBrowser({ storedLocale: 'DE_de', browserLanguages: ['en-US'] });

    initializeLocale();

    expect(getStoredLocale()).toBe('de');
    expect(getCurrentLocale()).toBe('de');
    expect(documentElement.lang).toBe('de');
  });

  test('setLocale never stores or applies unsupported locale strings', () => {
    const { documentElement, values } = stubBrowser({ browserLanguages: ['de-DE'] });

    setLocale('not-a-locale');

    expect(getCurrentLocale()).toBe('en');
    expect(documentElement.lang).toBe('en');
    expect(values.get(localeStorageKey)).toBe('en');
  });

  test('storage failures do not prevent locale application', () => {
    const { documentElement } = stubBrowser({ browserLanguages: ['de-DE'], setThrows: true });

    expect(() => setLocale('de-DE')).not.toThrow();

    expect(getCurrentLocale()).toBe('de');
    expect(documentElement.lang).toBe('de');
  });
});
