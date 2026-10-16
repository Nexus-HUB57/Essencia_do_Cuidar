import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  type SupportedLanguage,
  changeLanguage,
  getCurrentLanguage
} from '../i18n';

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<SupportedLanguage>(getCurrentLanguage());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (lng: string) => {
      if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lng)) {
        setCurrent(lng as SupportedLanguage);
      }
    };
    i18n.on('languageChanged', handler);
    return () => { i18n.off('languageChanged', handler); };
  }, [i18n]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }
  }, [open]);

  function selectLang(lng: SupportedLanguage) {
    changeLanguage(lng);
    setCurrent(lng);
    setOpen(false);
  }

  const currentMeta = LANGUAGE_LABELS[current];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('languageSwitcher.label')}
        title={t('languageSwitcher.label')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm border border-slate-200 hover:border-serenity-300 hover:bg-serenity-50 text-slate-600 transition"
      >
        <span aria-hidden="true" className="text-base leading-none">{currentMeta.flag}</span>
        <span className="font-medium hidden sm:inline">{currentMeta.short}</span>
        <svg
          aria-hidden="true"
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t('languageSwitcher.selectLabel')}
          className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden z-40"
        >
          {SUPPORTED_LANGUAGES.map((lng) => {
            const meta = LANGUAGE_LABELS[lng];
            const active = current === lng;
            return (
              <li key={lng} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => selectLang(lng)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
                    active
                      ? 'bg-serenity-50 text-serenity-700 font-medium'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  lang={lng}
                >
                  <span aria-hidden="true" className="text-base leading-none">{meta.flag}</span>
                  <span className="flex-1">{meta.label}</span>
                  {active && (
                    <span aria-hidden="true" className="text-serenity-600">✓</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
