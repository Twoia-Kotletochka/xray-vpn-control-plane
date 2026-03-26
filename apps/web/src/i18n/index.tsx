import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { en } from './en';
import { ru } from './ru';
import type { DeepTranslate } from './schema';

export type Locale = 'ru' | 'en';

type UiDictionary = DeepTranslate<typeof ru>;

type LocaleContextValue = {
  locale: Locale;
  localeTag: string;
  setLocale: (locale: Locale) => void;
  ui: UiDictionary;
};

const storageKey = 'server-vpn-locale';

function resolveInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'ru';
  }

  const stored = window.localStorage.getItem(storageKey);

  if (stored === 'ru' || stored === 'en') {
    return stored;
  }

  return 'ru';
}

function getUi(locale: Locale): UiDictionary {
  return locale === 'en' ? en : ru;
}

function getLocaleTag(locale: Locale) {
  return locale === 'en' ? 'en-US' : 'ru-RU';
}

const defaultLocale = resolveInitialLocale();

const LocaleContext = createContext<LocaleContextValue>({
  locale: defaultLocale,
  localeTag: getLocaleTag(defaultLocale),
  setLocale: () => undefined,
  ui: getUi(defaultLocale),
});

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      localeTag: getLocaleTag(locale),
      setLocale,
      ui: getUi(locale),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  return useContext(LocaleContext);
}

export const ui: UiDictionary = ru;
