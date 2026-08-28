/**
 * Хэлний дэмжлэг — `useT()` hook.
 *
 * Хатуу кодолсон текст байхгүй: бүх UI мөр `mn.json` / `en.json`-оос ирнэ.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import mn from './mn.json';
import en from './en.json';

export type Locale = 'mn' | 'en';

const DICTIONARIES: Record<Locale, Record<string, string>> = { mn, en };
const STORAGE_KEY = 'shalgalt.locale';

export type TranslationKey = keyof typeof mn;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey | string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'mn';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'mn' || stored === 'en') return stored;
  return window.navigator.language.startsWith('en') ? 'en' : 'mn';
}

/** `{name}` хэлбэрийн орлуулагчийг бөглөнө. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey | string, params?: Record<string, string | number>): string => {
      const dictionary = DICTIONARIES[locale];
      const fallback = DICTIONARIES.mn;
      const template = dictionary[key] ?? fallback[key];
      if (template === undefined) {
        // Орчуулга дутуу бол түлхүүрийг өөрийг нь харуулна (dev-д анзаарагдана)
        if (import.meta.env.DEV) console.warn(`[i18n] Орчуулга дутуу: "${key}"`);
        return key;
      }
      return interpolate(template, params);
    },
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale: setLocaleState, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n нь I18nProvider дотор ашиглагдах ёстой.');
  return context;
}

/** Хамгийн олон ашиглагдах хэлбэр: `const t = useT()`. */
export function useT(): I18nValue['t'] {
  return useI18n().t;
}
