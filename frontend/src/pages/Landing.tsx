import { Link } from 'react-router-dom';

export default function Landing() {
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
              🩺 Cuidado domiciliar com confiança
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-slate-900">
              Cuidar de quem você ama,
              <span className="block text-serenity-500">com quem entende.</span>
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-xl">
              Conectamos famílias a profissionais de saúde verificados para atendimento
              domiciliar de idosos e pacientes de baixa e média complexidade.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/cadastro?tipo=contratante" className="btn-primary">
                🏠 Busco profissional
              </Link>
              <Link to="/cadastro?tipo=profissional" className="btn-secondary">
                🩺 Sou profissional
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" /> Verificação de registro
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-serenity-500 rounded-full" /> Pagamento seguro
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
                  <h3 className="font-semibold text-slate-900">Cuidadora Ana C.</h3>
                  <p className="text-xs text-slate-500">COREN-SP • Verificada</p>
                </div>
                <span className="ml-auto badge-green">✓ Verificada</span>
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
            {/* Card flutuante */}
            <div className="hidden md:block absolute -bottom-6 -left-6 card p-4 z-20 max-w-[200px]">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="text-xs font-semibold">Diploma verificado</p>
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
            <h2 className="text-3xl md:text-4xl font-bold">Como funciona</h2>
            <p className="mt-3 text-slate-600">
              Em poucos passos, você conecta quem precisa de cuidado a quem pode oferecer.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Para famílias */}
            <div className="card border-t-4 border-serenity-500">
              <span className="badge-blue mb-3">Para famílias e clínicas</span>
              <h3 className="text-xl font-semibold mb-6">Contrate em 3 passos</h3>
              <ol className="space-y-4">
                {[
                  { t: 'Crie sua conta +Saúde', d: 'Cadastro rápido com nome, e-mail e telefone.' },
                  { t: 'Publique a vaga', d: 'Descreva o paciente, a jornada e o profissional desejado.' },
                  { t: 'Escolha candidatos', d: 'Receba perfis verificados, converse no chat e feche.' }
                ].map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-serenity-100 text-serenity-700 font-bold flex items-center justify-center text-sm">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{s.t}</p>
                      <p className="text-sm text-slate-500">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to="/cadastro?tipo=contratante" className="btn-primary w-full mt-6">
                Buscar profissional
              </Link>
            </div>

            {/* Para profissionais */}
            <div className="card border-t-4 border-emerald-500">
              <span className="badge-green mb-3">Para profissionais</span>
              <h3 className="text-xl font-semibold mb-6">Trabalhe em 3 passos</h3>
              <ol className="space-y-4">
                {[
                  { t: 'Cadastre-se', d: 'Envie diploma, registro e suas especialidades.' },
                  { t: 'Encontre vagas', d: 'Filtre por região, complexidade e remuneração.' },
                  { t: 'Candidate-se', d: 'Demonstre interesse e converse direto pelo chat.' }
                ].map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{s.t}</p>
                      <p className="text-sm text-slate-500">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to="/cadastro?tipo=profissional" className="btn-secondary w-full mt-6">
                Sou profissional
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* SEGURANÇA */}
      <section className="py-20 bg-gradient-to-br from-serenity-50 to-emerald-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="badge-green mb-3">🛡️ Segurança em primeiro lugar</span>
            <h2 className="text-3xl md:text-4xl font-bold">Por que confiar na Essência</h2>
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
                Sou profissional
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
