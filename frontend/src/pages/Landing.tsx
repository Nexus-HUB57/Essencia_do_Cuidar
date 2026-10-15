import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Landing() {
  const { t } = useTranslation();
  return (
    <div className="fade-in">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-serenity-50 via-white to-emerald-50 -z-10" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-200 rounded-full blur-3xl opacity-30 -z-10" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-serenity-200 rounded-full blur-3xl opacity-40 -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="badge-blue mb-4">🩺 {t('home.subtitle')}</span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-slate-900">
              {t('home.hero').split(',')[0]},
              <span className="block text-serenity-500">{t('home.hero').split(',').slice(1).join(',')}</span>
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-xl">{t('home.subtitle')}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/cadastro?tipo=contratante" className="btn-primary">🏠 {t('home.ctaContractor')}</Link>
              <Link to="/cadastro?tipo=profissional" className="btn-secondary">🩺 {t('home.ctaProfessional')}</Link>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full" /> CRM/COREN/CREFITO</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 bg-serenity-500 rounded-full" /> Pix + Stripe</div>
            </div>
          </div>

          {/* Card ilustrativo */}
          <div className="relative">
            <div className="card relative z-10 max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-serenity-400 to-emerald-400 flex items-center justify-center text-white text-xl">👵</div>
                <div>
                  <h3 className="font-semibold text-slate-900">Cuidadora Ana C.</h3>
                  <p className="text-xs text-slate-500">COREN-SP • {t('perfil.verified')}</p>
                </div>
                <span className="ml-auto badge-green">✓ {t('perfil.verified')}</span>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                "8 anos cuidando de idosos com Alzheimer e cuidados paliativos.
                Disponível para turnos diurnos e 12h."
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="badge-blue">Alzheimer</span>
                <span className="badge-blue">Cuidados Paliativos</span>
                <span className="badge-blue">Idosos</span>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">A partir de</p>
                  <p className="text-lg font-bold text-serenity-600">R$ 35<span className="text-xs text-slate-400 font-normal">/hora</span></p>
                </div>
                <button className="btn-primary text-xs py-2">Ver perfil</button>
              </div>
            </div>
            <div className="hidden md:block absolute -bottom-6 -left-6 card p-4 z-20 max-w-[200px]">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="text-xs font-semibold">{t('perfil.verified')} diploma</p>
                  <p className="text-[10px] text-slate-500">Última checagem hoje</p>
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
            <h2 className="text-3xl md:text-4xl font-bold">{t('home.howItWorks')}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-12">
            <div className="card border-t-4 border-serenity-500">
              <span className="badge-blue mb-3">{t('auth.contractor')}</span>
              <h3 className="text-xl font-semibold mb-6">3 passos</h3>
              <ol className="space-y-4">
                {[
                  { t: 'Crie sua conta +Saúde', d: 'Cadastro rápido com nome, e-mail e telefone.' },
                  { t: 'Publique a vaga', d: 'Descreva o paciente, a jornada e o profissional desejado.' },
                  { t: 'Pague via Pix', d: 'Split automático: 90% profissional, 10% plataforma.' }
                ].map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-serenity-100 text-serenity-700 font-bold flex items-center justify-center text-sm">{i + 1}</span>
                    <div><p className="font-medium">{s.t}</p><p className="text-sm text-slate-500">{s.d}</p></div>
                  </li>
                ))}
              </ol>
              <Link to="/cadastro?tipo=contratante" className="btn-primary w-full mt-6">{t('home.ctaContractor')}</Link>
            </div>
            <div className="card border-t-4 border-emerald-500">
              <span className="badge-green mb-3">{t('auth.professional')}</span>
              <h3 className="text-xl font-semibold mb-6">3 passos</h3>
              <ol className="space-y-4">
                {[
                  { t: 'Cadastre-se + diploma', d: 'Validação do seu registro (CRM/COREN/CREFITO).' },
                  { t: 'Conecte sua conta Stripe', d: 'Receba pagamentos via Pix com split.' },
                  { t: 'Candidate-se e ative push', d: 'Notificações em tempo real no celular.' }
                ].map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">{i + 1}</span>
                    <div><p className="font-medium">{s.t}</p><p className="text-sm text-slate-500">{s.d}</p></div>
                  </li>
                ))}
              </ol>
              <Link to="/cadastro?tipo=profissional" className="btn-secondary w-full mt-6">{t('home.ctaProfessional')}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* SEGURANÇA */}
      <section className="py-20 bg-gradient-to-br from-serenity-50 to-emerald-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="badge-green mb-3">🛡️ Segurança em primeiro lugar</span>
            <h2 className="text-3xl md:text-4xl font-bold">Por que confiar na {t('common.appName')}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { i: '🔐', t: t('perfil.verified') + ' de registro', d: 'Validamos CRM, COREN, CREFITO, CRP e CRN.' },
              { i: '📄', t: t('perfil.diploma'), d: 'Profissionais sobem PDF/foto do diploma.' },
              { i: '💰', t: 'Pix + Stripe Connect', d: 'Pagamento seguro com split automático.' },
              { i: '🔔', t: 'Notificações push', d: 'Aviso em tempo real de mensagens e vagas.' }
            ].map((c, i) => (
              <div key={i} className="card text-center">
                <div className="text-3xl mb-3">{c.i}</div>
                <h4 className="font-semibold mb-1">{c.t}</h4>
                <p className="text-sm text-slate-500">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl p-8 md:p-12 bg-gradient-to-br from-serenity-500 to-emerald-500 text-white text-center shadow-card">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Pronto para começar?</h2>
            <p className="text-white/90 mb-8 max-w-xl mx-auto">
              Crie sua conta gratuitamente e dê o primeiro passo para um cuidado com mais
              confiança e tranquilidade.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/cadastro?tipo=contratante" className="bg-white text-serenity-600 hover:bg-slate-50 font-medium px-6 py-3 rounded-xl">
                Quero contratar
              </Link>
              <Link to="/cadastro?tipo=profissional" className="bg-serenity-700 hover:bg-serenity-800 text-white font-medium px-6 py-3 rounded-xl">
                {t('home.ctaProfessional')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
