import { createI18n } from 'vue-i18n';
import { de } from './messages/de';
import { en } from './messages/en';
import { SUPPORTED_LOCALES, type SupportedLocale } from './types';

const STORAGE_KEY = 'werewolves.locale';
const DEFAULT_LOCALE: SupportedLocale = 'en';

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

export function normalizeLocale(locale: string | null | undefined): SupportedLocale | null {
  if (typeof locale !== 'string') return null;

  const normalized = locale.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) return null;
  if (isSupportedLocale(normalized)) return normalized;

  const [language] = normalized.split('-');
  return isSupportedLocale(language) ? language : null;
}

function readStoredLocale(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLocale(locale: SupportedLocale) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable in private mode or restricted embeds; locale still applies in memory.
  }
}

export function getStoredLocale(): SupportedLocale | null {
  const storedLocale = readStoredLocale();
  if (storedLocale === null) return null;
  return normalizeLocale(storedLocale) ?? DEFAULT_LOCALE;
}

export function getBrowserLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;

  const { navigator } = window;
  const preferredLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const locale of preferredLocales) {
    const normalized = normalizeLocale(locale);
    if (normalized) return normalized;
  }
  return null;
}

function getInitialLocale(defaultLocale?: string | null): SupportedLocale {
  return (
    getStoredLocale() ?? normalizeLocale(defaultLocale) ?? getBrowserLocale() ?? DEFAULT_LOCALE
  );
}

export const messages = { en, de };

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages,
});

function applyLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export function setLocale(locale: string | null | undefined) {
  const normalizedLocale = normalizeLocale(locale) ?? DEFAULT_LOCALE;
  applyLocale(normalizedLocale);
  writeStoredLocale(normalizedLocale);
}

export function initializeLocale(defaultLocale?: string | null) {
  applyLocale(getInitialLocale(defaultLocale));
}

export function getCurrentLocale(): SupportedLocale {
  const currentLocale = i18n.global.locale.value;
  return normalizeLocale(currentLocale) ?? DEFAULT_LOCALE;
}

initializeLocale();
