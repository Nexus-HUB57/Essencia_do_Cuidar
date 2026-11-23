/**
 * Feature 6 — i18n setup.
 * Idiomas suportados: pt-BR (default), es, en.
 * Usa localStorage para persistir a escolha do usuário.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptBR from './locales/pt-BR.json';
import es from './locales/es.json';
import en from './locales/en.json';

export const supportedLanguages = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'es',    label: 'Español',   flag: '🇪🇸' },
  { code: 'en',    label: 'English',   flag: '🇬🇧' }
];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      'es':    { translation: es },
      'en':    { translation: en }
    },
    fallbackLng: 'pt-BR',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'essencia_lang'
    }
  });

export default i18n;
