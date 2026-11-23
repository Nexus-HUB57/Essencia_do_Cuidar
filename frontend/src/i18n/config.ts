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

import { IDIOMAS_SUPORTADOS, normalizarIdioma } from './normalize';

/**
 * Lista de idiomas do seletor. Mantida exportada daqui por compatibilidade
 * com os componentes que já importavam de `i18n/config`.
 */
export const supportedLanguages = IDIOMAS_SUPORTADOS;

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
    // Sem `nonExplicitSupportedLngs`: com ele, o i18next passa a tratar
    // "pt" (sem regiao) como suportado e tenta carregar um bundle que nao
    // existe — o resultado e a tela inteira mostrando chaves cruas em
    // pt-BR. O `convertDetectedLanguage` abaixo ja normaliza "en-US" → "en",
    // entao nao precisamos da variante implicita.
    supportedLngs: ['pt-BR', 'es', 'en'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'essencia_lang',
      /**
       * CRÍTICO: normaliza ANTES de cachear. Sem isso o detector grava
       * `en-US` no localStorage e o seletor de idioma passa a exibir
       * "Português" numa tela em inglês.
       */
      convertDetectedLanguage: normalizarIdioma
    }
  });

/**
 * Mantém `<html lang>` em sintonia com o idioma exibido — leitor de tela e
 * buscadores usam esse atributo, e ele ficava travado em "pt-BR" mesmo com
 * a interface em inglês.
 */
function aplicarIdiomaNoDocumento(lng?: string) {
  if (typeof document === 'undefined') return;
  const normal = normalizarIdioma(lng || i18n.resolvedLanguage || i18n.language);
  if (document.documentElement.lang !== normal) {
    document.documentElement.lang = normal;
  }
}

i18n.on('languageChanged', aplicarIdiomaNoDocumento);
aplicarIdiomaNoDocumento(i18n.resolvedLanguage);

export default i18n;
