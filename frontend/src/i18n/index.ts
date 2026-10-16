import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptBR from './locales/pt-BR.json';
import es from './locales/es.json';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = ['pt-BR', 'es', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, { label: string; short: string; flag: string }> = {
  'pt-BR': { label: 'Português (Brasil)', short: 'PT', flag: '🇧🇷' },
  es:      { label: 'Español',          short: 'ES', flag: '🇪🇸' },
  en:      { label: 'English',          short: 'EN', flag: '🇺🇸' }
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'pt-BR',
    fallbackNS: 'translation',
    debug: false,
    interpolation: { escapeValue: false },
    resources: {
      'pt-BR': { translation: ptBR },
      es: { translation: es },
      en: { translation: en }
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'essencia_lang',
      caches: ['localStorage'],
      convertDetectedLanguage: (lng) => {
        // Map browser languages like "pt" or "pt-BR" to our supported set.
        if (!lng) return 'pt-BR';
        const lower = lng.toLowerCase();
        if (lower.startsWith('pt')) return 'pt-BR';
        if (lower.startsWith('es')) return 'es';
        if (lower.startsWith('en')) return 'en';
        return 'pt-BR';
      }
    },
    // If a key is missing in a non-default language, fall back to English,
    // then to the default (pt-BR) — react-i18next returns the key if all fail.
    saveMissing: false,
    react: { useSuspense: false }
  });

export function changeLanguage(lng: SupportedLanguage) {
  void i18n.changeLanguage(lng);
  try {
    localStorage.setItem('essencia_lang', lng);
    document.documentElement.lang = lng;
  } catch {
    /* localStorage may be unavailable */
  }
}

export function getCurrentLanguage(): SupportedLanguage {
  const lng = (i18n.language || 'pt-BR') as string;
  if (SUPPORTED_LANGUAGES.includes(lng as SupportedLanguage)) return lng as SupportedLanguage;
  // Map common browser-reported values to a supported language.
  const lower = lng.toLowerCase();
  if (lower.startsWith('pt')) return 'pt-BR';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('en')) return 'en';
  return 'pt-BR';
}

export default i18n;
