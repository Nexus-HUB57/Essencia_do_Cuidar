import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Landing() {
  const { t } = useTranslation();
  const stepsFamiles = t('landing.stepsFamiles', { returnObjects: true }) as Array<{ title: string; desc: string }>;
  const stepsProfessionals = t('landing.stepsProfessionals', { returnObjects: true }) as Array<{ title: string; desc: string }>;
  const securityItems = t('landing.security.items', { returnObjects: true }) as Array<{ title: string; desc: string }>;

  return (
    <div className="fade-in">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-serenity-50 via-white to-emerald-50 -z-10" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-200 rounded-full blur-3xl opacity-30 -z-10" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-serenity-200 rounded-full blur-3xl opacity-40 -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="badge-blue mb-4">
              {t('landing.hero.badge')}
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-slate-900">
              {t('landing.hero.title1')}
              <span className="block text-serenity-500">{t('landing.hero.title2')}</span>
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-xl">
              {t('landing.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/cadastro?tipo=contratante" className="btn-primary">
                {t('landing.hero.ctaHire')}
              </Link>
              <Link to="/cadastro?tipo=profissional" className="btn-secondary">
                {t('landing.hero.ctaPro')}
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" /> {t('landing.hero.featureVerified')}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-serenity-500 rounded-full" /> {t('landing.hero.featurePayment')}
              </div>
            </div>
          </div>

          {/* Card ilustrativo */}
          <div className="relative">
            <div className="card relative z-10 max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-serenity-400 to-emerald-400 flex items-center justify-center text-white text-xl">
                  👵
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{t('landing.exampleCard.name')}</h3>
                  <p className="text-xs text-slate-500">{t('landing.exampleCard.registro')}</p>
                </div>
                <span className="ml-auto badge-green">{t('landing.exampleCard.verified')}</span>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                {t('landing.exampleCard.quote')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="badge-blue">{t('landing.exampleCard.tagAlzheimer')}</span>
                <span className="badge-blue">{t('landing.exampleCard.tagPalliative')}</span>
                <span className="badge-blue">{t('landing.exampleCard.tagElderly')}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">{t('landing.exampleCard.from')}</p>
                  <p className="text-lg font-bold text-serenity-600">
                    {t('landing.exampleCard.price', { value: '35' })}
                    <span className="text-xs text-slate-400 font-normal">{t('landing.exampleCard.priceUnit')}</span>
                  </p>
                </div>
                <button className="btn-primary text-xs py-2">{t('landing.exampleCard.viewProfile')}</button>
              </div>
            </div>
            {/* Card flutuante */}
            <div className="hidden md:block absolute -bottom-6 -left-6 card p-4 z-20 max-w-[200px]">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="text-xs font-semibold">{t('landing.floatingCard.title')}</p>
                  <p className="text-[10px] text-slate-500">{t('landing.floatingCard.subtitle')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">{t('landing.howItWorks.title')}</h2>
            <p className="mt-3 text-slate-600">
              {t('landing.howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Para famílias */}
            <div className="card border-t-4 border-serenity-500">
              <span className="badge-blue mb-3">{t('landing.howItWorks.familiesTitle')}</span>
              <h3 className="text-xl font-semibold mb-6">{t('landing.howItWorks.familiesCta')}</h3>
              <ol className="space-y-4">
                {stepsFamiles.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-serenity-100 text-serenity-700 font-bold flex items-center justify-center text-sm">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{s.title}</p>
                      <p className="text-sm text-slate-500">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to="/cadastro?tipo=contratante" className="btn-primary w-full mt-6">
                {t('landing.howItWorks.familiesCtaButton')}
              </Link>
            </div>

            {/* Para profissionais */}
            <div className="card border-t-4 border-emerald-500">
              <span className="badge-green mb-3">{t('landing.howItWorks.proTitle')}</span>
              <h3 className="text-xl font-semibold mb-6">{t('landing.howItWorks.proCta')}</h3>
              <ol className="space-y-4">
                {stepsProfessionals.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{s.title}</p>
                      <p className="text-sm text-slate-500">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to="/cadastro?tipo=profissional" className="btn-secondary w-full mt-6">
                {t('landing.howItWorks.proCtaButton')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* SEGURANÇA */}
      <section className="py-20 bg-gradient-to-br from-serenity-50 to-emerald-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="badge-green mb-3">{t('landing.security.badge')}</span>
            <h2 className="text-3xl md:text-4xl font-bold">{t('landing.security.title')}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {securityItems.map((c, i) => (
              <div key={i} className="card text-center">
                <div className="text-3xl mb-3">{['🔐', '📄', '💬', '⚠️'][i]}</div>
                <h4 className="font-semibold mb-1">{c.title}</h4>
                <p className="text-sm text-slate-500">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl p-8 md:p-12 bg-gradient-to-br from-serenity-500 to-emerald-500 text-white text-center shadow-card">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">{t('landing.finalCta.title')}</h2>
            <p className="text-white/90 mb-8 max-w-xl mx-auto">
              {t('landing.finalCta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/cadastro?tipo=contratante" className="bg-white text-serenity-600 hover:bg-slate-50 font-medium px-6 py-3 rounded-xl">
                {t('landing.finalCta.hire')}
              </Link>
              <Link to="/cadastro?tipo=profissional" className="bg-serenity-700 hover:bg-serenity-800 text-white font-medium px-6 py-3 rounded-xl">
                {t('landing.finalCta.pro')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
