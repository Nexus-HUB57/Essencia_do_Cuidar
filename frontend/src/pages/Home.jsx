import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-mist via-white to-brand-green/10">
        <div className="container-page py-16 sm:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="badge-blue">Cuidado domiciliar com confiança</span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
              Conectamos famílias a <span className="text-brand-blue">profissionais de saúde</span> qualificados para o cuidado em casa.
            </h1>
            <p className="mt-4 text-lg text-brand-slate max-w-xl">
              O Essência do Cuidar é o marketplace de contratação de enfermeiros, técnicos, cuidadores e terapeutas para atendimento domiciliar de <b>baixa e média complexidade</b>.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/cadastro?tipo=profissional" className="btn-primary">
                Sou Profissional
              </Link>
              <Link to="/cadastro?tipo=contratante" className="btn-secondary">
                Busco Profissional (+Saúde)
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-brand-slate">
              <span className="flex items-center gap-2"><ShieldIcon/> Documentos verificados</span>
              <span className="flex items-center gap-2"><ClockIcon/> Resposta rápida</span>
              <span className="flex items-center gap-2"><HeartIcon/> Acolhimento real</span>
            </div>
          </div>
          <div className="relative">
            <div className="card max-w-md mx-auto">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-brand-green/30 grid place-items-center text-brand-blue font-semibold">EM</div>
                <div>
                  <p className="font-medium">Dona Elena, 78 anos</p>
                  <p className="text-xs text-brand-slate">Alzheimer leve · São Paulo</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-brand-ink/80">
                "A equipe do Essência do Cuidar me ajudou a encontrar uma técnica de enfermagem cuidadosa e muito competente. Hoje tenho tranquilidade no dia a dia."
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-brand-slate">
                <span className="badge-green">COREN verificado</span>
                <span className="badge-blue">Avaliação 5.0</span>
              </div>
            </div>
            <div className="absolute -z-10 inset-0 bg-gradient-to-tr from-brand-blue/10 via-transparent to-brand-green/20 blur-2xl" />
          </div>
        </div>
      </section>

      {/* Categorias */}
      <section className="container-page py-14 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">Profissionais para cada necessidade</h2>
        <p className="mt-2 text-center text-brand-slate">Selecione a especialidade que combina com o cuidado do seu ente.</p>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { t: 'Cuidador de Idosos', d: 'Acompanhamento, rotina e companhia.' },
            { t: 'Técnico de Enfermagem', d: 'Curativos, medicação, sinais vitais.' },
            { t: 'Enfermeiro', d: 'Cuidados complexos e supervisão.' },
            { t: 'Fisioterapeuta', d: 'Reabilitação motora e respiratória.' },
            { t: 'Psicólogo', d: 'Saúde mental do paciente e família.' },
            { t: 'Nutricionista', d: 'Plano alimentar individualizado.' },
            { t: 'Terapeuta Ocupacional', d: 'Autonomia e atividades diárias.' },
            { t: 'Médico', d: 'Visitas e acompanhamento clínico.' },
          ].map(c => (
            <div key={c.t} className="card hover:shadow-md transition">
              <h3 className="font-semibold text-brand-ink">{c.t}</h3>
              <p className="mt-1 text-sm text-brand-slate">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Como Funciona */}
      <section className="bg-brand-mist">
        <div className="container-page py-14 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">Como Funciona</h2>
          <div className="mt-10 grid md:grid-cols-2 gap-8">
            <div className="card">
              <h3 className="font-semibold text-brand-blue">Para quem busca profissional (+Saúde)</h3>
              <ol className="mt-4 space-y-3 text-sm text-brand-ink/80">
                <li><b>1.</b> Cadastre-se como contratante.</li>
                <li><b>2.</b> Publique a vaga com perfil do paciente e jornada.</li>
                <li><b>3.</b> Receba candidatos, converse pelo chat e escolha.</li>
              </ol>
            </div>
            <div className="card">
              <h3 className="font-semibold text-brand-blue">Para o profissional</h3>
              <ol className="mt-4 space-y-3 text-sm text-brand-ink/80">
                <li><b>1.</b> Cadastre seu perfil, especialização e disponibilidade.</li>
                <li><b>2.</b> Encontre vagas compatíveis com filtros.</li>
                <li><b>3.</b> Candidate-se e converse direto com a família.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Segurança */}
      <section className="container-page py-14 sm:py-20">
        <div className="card max-w-3xl mx-auto text-center">
          <ShieldIcon className="mx-auto h-10 w-10 text-brand-blue" />
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">Segurança em primeiro lugar</h2>
          <p className="mt-2 text-brand-slate">
            Verificamos documentos e registros profissionais (CRM, COREN, CREFITO, CRP e outros). Ainda assim, <b>recomendamos sempre conferir o registro no conselho da classe</b> antes de fechar a contratação.
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="container-page pb-16">
        <div className="card bg-brand-blue text-white text-center max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold">Pronto para começar?</h2>
          <p className="mt-2 text-white/90">Crie sua conta em menos de 2 minutos.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cadastro?tipo=profissional" className="btn bg-white text-brand-blue hover:bg-brand-mist">Sou Profissional</Link>
            <Link to="/cadastro?tipo=contratante" className="btn bg-brand-green/30 text-white hover:bg-brand-green/40">Busco Profissional</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function ShieldIcon({ className = 'h-4 w-4 text-brand-blue' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function ClockIcon({ className = 'h-4 w-4 text-brand-blue' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
}
function HeartIcon({ className = 'h-4 w-4 text-brand-blue' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
}
