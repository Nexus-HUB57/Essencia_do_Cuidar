import { useTranslation, Trans } from 'react-i18next';

export default function ComoFunciona() {
  const { t } = useTranslation();
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 fade-in">
      <h1 className="text-3xl md:text-4xl font-bold text-center mb-3">{t('comoFunciona.title')}</h1>
      <p className="text-center text-slate-500 mb-12 max-w-xl mx-auto">
        {t('comoFunciona.subtitle')}
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-serenity-600 mb-6">{t('comoFunciona.forFamilies')}</h2>
        <ol className="space-y-4">
          {(t('comoFunciona.families', { returnObjects: true }) as unknown as string[][]).map(([t, d], i) => (
            <li key={i} className="card flex gap-4">
              <span className="w-10 h-10 shrink-0 rounded-full bg-serenity-100 text-serenity-700 font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{t}</h3>
                <p className="text-sm text-slate-500 mt-1">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-emerald-600 mb-6">{t('comoFunciona.forProfessionals')}</h2>
        <ol className="space-y-4">
          {(t('comoFunciona.professionals', { returnObjects: true }) as unknown as string[][]).map(([t, d], i) => (
            <li key={i} className="card flex gap-4">
              <span className="w-10 h-10 shrink-0 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{t}</h3>
                <p className="text-sm text-slate-500 mt-1">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="card bg-amber-50 border-amber-200">
        <h3 className="font-semibold text-amber-900">{t('comoFunciona.safetyTitle')}</h3>
        <ul className="text-sm text-amber-800 mt-2 space-y-1 list-disc list-inside">
          {(t('comoFunciona.safety', { returnObjects: true }) as unknown as string[]).map((linha, i) => (
            <li key={i}><Trans i18nKey={`comoFunciona.safety.${i}`} components={{ strong: <strong /> }} /></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
