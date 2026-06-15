import { createI18n } from 'vue-i18n';
import { de } from './messages/de';
import { en } from './messages/en';
import { SUPPORTED_LOCALES, type SupportedLocale } from './types';

const STORAGE_KEY = 'werewolves.locale';
const DEFAULT_LOCALE: SupportedLocale = 'en';

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

function normalizeLocale(locale: string | null | undefined): SupportedLocale | null {
  if (!locale) return null;
  const normalized = locale.toLowerCase();
  if (isSupportedLocale(normalized)) return normalized;
  if (normalized.startsWith('de')) return 'de';
  if (normalized.startsWith('en')) return 'en';
  return null;
}

function getStoredLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;
  return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
}

function getBrowserLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;
  const preferredLocales = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language];
  for (const locale of preferredLocales) {
    const normalized = normalizeLocale(locale);
    if (normalized) return normalized;
  }
  return null;
}

function getInitialLocale(defaultLocale?: SupportedLocale): SupportedLocale {
  return getStoredLocale() ?? defaultLocale ?? getBrowserLocale() ?? DEFAULT_LOCALE;
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

export function setLocale(locale: SupportedLocale) {
  applyLocale(locale);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, locale);
  }
}

export function initializeLocale(defaultLocale?: SupportedLocale) {
  applyLocale(getInitialLocale(defaultLocale));
}

export function getCurrentLocale(): SupportedLocale {
  const currentLocale = i18n.global.locale.value;
  return normalizeLocale(currentLocale) ?? DEFAULT_LOCALE;
}

initializeLocale();
