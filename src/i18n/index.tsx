import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import en from '../locales/en.json';
import de from '../locales/de.json';
import es from '../locales/es.json';

export type Locale = 'de' | 'en' | 'es';

export const SUPPORTED_LOCALES: readonly Locale[] = ['de', 'en', 'es'];
const DEFAULT_LOCALE: Locale = 'en';
const COOKIE = 'lang';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const catalogs = { de, en, es } as const;

/** Translation keys are derived from the English catalog (source of truth). */
export type TranslationKey = keyof typeof en;

/** Endonymic names for the language switcher (shown the same in every locale). */
export const LOCALE_NAMES: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
};

function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Read the locale seeded by the edge function or a prior manual switch. */
export function readCookieLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const match = document.cookie.match(/(?:^|;\s*)lang=([^;]+)/);
  return isLocale(match?.[1]) ? (match![1] as Locale) : DEFAULT_LOCALE;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

interface I18nValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readCookieLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${COOKIE}=${next}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    const dict = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
    return {
      locale,
      setLocale,
      t: (key, params) => {
        const template = dict[key] ?? en[key] ?? String(key);
        return interpolate(template, params);
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
