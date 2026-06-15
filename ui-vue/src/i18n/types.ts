export const SUPPORTED_LOCALES = ['en', 'de'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export interface LocaleOption {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
}
