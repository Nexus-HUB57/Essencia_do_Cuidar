/**
 * Feature 6 — Seletor de idioma.
 * Dropdown minimalista que troca i18n.language e persiste no localStorage.
 */
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../i18n/config';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language || 'pt-BR';

  return (
    <select
      value={current}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="text-xs bg-transparent border border-slate-200 rounded-md px-2 py-1 cursor-pointer hover:border-serenity-300"
      aria-label="Idioma"
    >
      {supportedLanguages.map((l) => (
        <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
      ))}
    </select>
  );
}
