import { Link } from 'react-router-dom';

const WHATSAPP_URL = 'https://wa.me/5519988322428';
const WHATSAPP_DISPLAY = '(19) 98832-2428';
const INSTAGRAM_URL = 'https://instagram.com/jeane_silva1208';
const INSTAGRAM_HANDLE = '@jeane_silva1208';

export default function Landing() {
  return (
    <div className="fade-in">
      {/* HERO — usa a capa "Como trabalhamos" como background */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            src="/img/capa-trabalhamos.jpg"
            alt=""
            className="w-full h-full object-cover opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-serenity-50/95 via-white/90 to-emerald-50/95" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 badge-blue mb-4">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Cuidado humanizado, profissional e atencioso
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-slate-900">
              Cuidar de quem você ama,
              <span className="block text-serenity-500">com quem entende.</span>
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-xl">
              Plataforma da <strong>Essência do Cuidar</strong> — por Jeane Silva.
              Conectamos famílias a profissionais de saúde verificados para
              cuidado domiciliar de idosos e pacientes de baixa e média complexidade.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/cadastro?tipo=contratante" className="btn-primary">
                🏠 Busco profissional
              </Link>
              <Link to="/cadastro?tipo=profissional" className="btn-secondary">
                🩺 Sou profissional
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
              <span>📍 Campinas e região</span>
              <span>•</span>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener" className="hover:text-emerald-600 font-medium">
                {WHATSAPP_DISPLAY}
              </a>
            </div>
          </div>

          {/* Card ilustrativo com logo + Jeane */}
          <div className="relative">
            <div className="card relative z-10 max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <img src="/img/logo.jpg" className="w-14 h-14 rounded-full" alt="logo" />
                <div>
                  <h3 className="font-semibold text-slate-900">Essência do Cuidar</h3>
                  <p className="text-xs text-slate-500">por Jeane Silva</p>
                </div>
                <span className="ml-auto badge-green">✓ Verificada</span>
              </div>
              <p className="text-sm text-slate-600 italic mb-4">
                "Cuidar com amor é a nossa essência. Cuidado, Acolhimento e Respeito em cada detalhe."
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {['Cuidado', 'Acolhimento', 'Respeito'].map((p) => (
                  <div key={p} className="bg-emerald-50 text-emerald-800 rounded-xl py-2 text-xs font-semibold">
                    {p}
                  </div>
                ))}
              </div>
              <a
                href={WHATSAPP_URL}
                target="_blank" rel="noopener"
                className="btn-primary w-full mt-4 text-sm"
              >
                💬 Falar com a Jeane no WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* SOBRE — Nasceu a Essência do Cuidar */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="badge-green mb-3">💚 Nossa história</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Nasceu a Essência do Cuidar</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              A Essência do Cuidar nasceu do propósito de oferecer cuidado
              humanizado, com profissionalismo e amor — para que famílias
              possam contar com apoio de confiança no cuidado de quem amam.
            </p>
            <p className="text-slate-600 leading-relaxed mb-6">
              Em Campinas e região, conectamos famílias, clínicas e instituições
              a profissionais de saúde qualificados para atendimento domiciliar
              de baixa e média complexidade.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Cuidado humanizado', 'Profissionalismo', 'Atendimento próximo', 'Confiança'].map((t) => (
                <span key={t} className="badge-blue">{t}</span>
              ))}
            </div>
          </div>
          <div className="relative">
            <img
              src="/img/sobre-nasceu.jpg"
              alt="Cuidadora segurando a mão de uma idosa"
              className="rounded-3xl shadow-card w-full h-auto"
              loading="lazy"
            />
            <div className="absolute -bottom-4 -right-4 bg-amber-500 text-white px-4 py-2 rounded-xl shadow-card text-sm font-semibold">
              Cuidado • Acolhimento • Respeito
            </div>
          </div>
        </div>
      </section>

      {/* SERVIÇOS — 5 plantões */}
      <section className="py-20 bg-gradient-to-br from-slate-50 to-emerald-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="badge-blue mb-3">🩺 Nossos serviços</span>
            <h2 className="text-3xl md:text-4xl font-bold">5 tipos de plantão</h2>
            <p className="mt-3 text-slate-600">
              Cobertura completa para todas as necessidades da sua família,
              com qualidade e tranquilidade.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { i: '🌙', t: 'Plantão 12h', d: 'Diurno ou noturno. Cuidado contínuo, dia ou noite.' },
              { i: '🤲', t: 'Plantão 24h', d: 'Com revezamento. Atenção total sem interrupções.' },
              { i: '📅', t: 'Plantão Folguista', d: 'Fim de semana. Seu descanso garantido.' },
              { i: '🏥', t: 'Acompanhamento Hospitalar', d: 'Segurança em internações e pós-cirúrgico.' },
              { i: '🩺', t: 'Consultas e Exames', d: 'Levamos, anotamos e cuidamos de tudo.' }
            ].map((s, i) => (
              <div key={i} className="card hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-2">{s.i}</div>
                <h3 className="font-semibold mb-1">{s.t}</h3>
                <p className="text-sm text-slate-500">{s.d}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link to="/vagas" className="btn-primary">Ver vagas disponíveis →</Link>
          </div>

          {/* Material de marca: os slides originais da Essência */}
          <details className="mt-8 group">
            <summary className="cursor-pointer text-center text-sm text-slate-500 hover:text-serenity-600 select-none">
              📄 Ver material institucional da Essência do Cuidar
            </summary>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {[
                { src: '/img/servicos.jpg', t: 'Nossos Serviços' },
                { src: '/img/processo.jpg', t: 'Nosso Processo' },
                { src: '/img/cta-cuidado.jpg', t: 'Cuidado que acolhe e protege' }
              ].map((d) => (
                <a
                  key={d.src}
                  href={d.src}
                  target="_blank"
                  rel="noopener"
                  className="group/card block rounded-xl overflow-hidden shadow-card hover:shadow-lg transition"
                >
                  <img src={d.src} alt={d.t} className="w-full h-auto" loading="lazy" />
                  <div className="p-3 bg-white dark:bg-slate-800 text-center text-xs font-medium text-slate-700 dark:text-slate-300">
                    {d.t} ↗
                  </div>
                </a>
              ))}
            </div>
          </details>
        </div>
      </section>

      {/* COMO TRABALHAMOS — Processo em 3 passos */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="badge-green mb-3">✨ Como trabalhamos</span>
            <h2 className="text-3xl md:text-4xl font-bold">Nosso processo</h2>
            <p className="mt-3 text-slate-600">
              Rigor em cada etapa — cuidado humanizado, confiança e excelência.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: '01', i: '🔍',
                t: 'Seleção rigorosa',
                d: 'Avaliação cuidadosa de perfil, experiência e referência de cada profissional antes de entrar na plataforma.'
              },
              {
                n: '02', i: '🎓',
                t: 'Treinamento técnico',
                d: 'Capacitação prática e protocolos de cuidado padronizados para garantir qualidade em todo atendimento.'
              },
              {
                n: '03', i: '👨‍👩‍👧',
                t: 'Acompanhamento da família',
                d: 'Suporte contínuo, comunicação transparente e ajustes sempre que a família precisar.'
              }
            ].map((s, i) => (
              <div key={i} className="card relative">
                <span className="absolute -top-3 -left-3 w-10 h-10 rounded-full bg-serenity-500 text-white flex items-center justify-center font-bold text-sm shadow-soft">
                  {s.n}
                </span>
                <div className="text-3xl mb-2 mt-2">{s.i}</div>
                <h3 className="font-semibold text-lg mb-2">{s.t}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEGURANÇA */}
      <section className="py-16 bg-gradient-to-br from-serenity-50 to-emerald-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="badge-green mb-3">🛡️ Segurança em primeiro lugar</span>
            <h2 className="text-2xl md:text-3xl font-bold">Por que confiar na Essência</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { i: '🔐', t: 'Registro verificado', d: 'Validamos CRM, COREN, CREFITO, CRP e CRN.' },
              { i: '📄', t: 'Diploma anexado', d: 'Profissionais sobem PDF/foto do diploma.' },
              { i: '💬', t: 'Chat transparente', d: 'Toda negociação fica registrada na plataforma.' },
              { i: '⚠️', t: 'Sem alta complexidade', d: 'Não aceitamos vagas de UTI. Foco em baixa/média.' }
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

      {/* AGENDA ABERTA — CTA com Jeane */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
          <div className="relative order-2 md:order-1">
            <img
              src="/img/agenda-aberta.jpg"
              alt="Jeane Silva, fundadora da Essência do Cuidar"
              className="rounded-3xl shadow-card w-full h-auto"
              loading="lazy"
            />
          </div>
          <div className="order-1 md:order-2">
            <span className="badge-green mb-3">📅 Agenda aberta</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              Fale diretamente com a Jeane
            </h2>
            <p className="text-slate-600 leading-relaxed mb-6">
              Estamos com agenda aberta para novos atendimentos em
              <strong> Campinas e região</strong>. Agende uma visita gratuita
              e conheça o cuidado que faz a diferença.
            </p>

            <div className="space-y-3 mb-8">
              <a
                href={WHATSAPP_URL}
                target="_blank" rel="noopener"
                className="flex items-center gap-3 p-3 rounded-xl border-2 border-emerald-200 hover:bg-emerald-50 transition"
              >
                <span className="text-2xl">💬</span>
                <div>
                  <p className="text-xs text-slate-500">WhatsApp</p>
                  <p className="font-semibold text-slate-900">{WHATSAPP_DISPLAY}</p>
                </div>
              </a>
              <a
                href={INSTAGRAM_URL}
                target="_blank" rel="noopener"
                className="flex items-center gap-3 p-3 rounded-xl border-2 border-pink-200 hover:bg-pink-50 transition"
              >
                <span className="text-2xl">📸</span>
                <div>
                  <p className="text-xs text-slate-500">Instagram</p>
                  <p className="font-semibold text-slate-900">{INSTAGRAM_HANDLE}</p>
                </div>
              </a>
              <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-serenity-200">
                <span className="text-2xl">📍</span>
                <div>
                  <p className="text-xs text-slate-500">Atendimento</p>
                  <p className="font-semibold text-slate-900">Campinas e região</p>
                </div>
              </div>
            </div>

            <a href={WHATSAPP_URL} target="_blank" rel="noopener" className="btn-primary text-base">
              📲 Agendar visita gratuita
            </a>
          </div>
        </div>
      </section>

      {/* CTA FINAL — "Cuidado que acolhe e protege" */}
      <section className="py-20 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Cuidado que acolhe e protege
          </h2>
          <p className="text-xl text-slate-300 mb-3 max-w-2xl mx-auto">
            Sua família merece tranquilidade.
          </p>
          <p className="text-lg text-slate-400 mb-8 max-w-2xl mx-auto">
            Nós garantimos profissionalismo e amor em cada detalhe.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cadastro?tipo=contratante" className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium px-6 py-3 rounded-xl">
              Quero contratar
            </Link>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener" className="bg-white text-slate-900 hover:bg-slate-100 font-medium px-6 py-3 rounded-xl">
              📲 Falar no WhatsApp
            </a>
          </div>
          <p className="text-xs text-slate-500 mt-8 italic">"Cuidar com amor é a nossa essência"</p>
        </div>
      </section>
    </div>
  );
}
