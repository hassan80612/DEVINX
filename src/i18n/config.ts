export const locales = ['pt-BR', 'en', 'es', 'ar'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'pt-BR';
export const rtlLocales: Locale[] = ['ar'];

export function direction(locale: Locale) {
  return rtlLocales.includes(locale) ? 'rtl' : 'ltr';
}
