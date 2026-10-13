import { Link } from 'react-router-dom';

export default function ComoFunciona() {
  return (
    <section className="container-page py-12 sm:py-16">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-center">Como Funciona</h1>
      <p className="mt-3 text-center text-brand-slate max-w-2xl mx-auto">
        Entenda o passo a passo de cada lado da plataforma.
      </p>

      <div className="mt-12 grid lg:grid-cols-2 gap-8">
        <article className="card">
          <h2 className="text-xl font-semibold text-brand-blue">Para o +Saúde (contratante)</h2>
          <ol className="mt-4 space-y-4 text-brand-ink/80">
            <Step n={1} t="Crie sua conta" d="Nome, e-mail e telefone. Leva menos de 1 minuto." />
            <Step n={2} t="Publique a vaga" d="Conte sobre o paciente (idade, diagnóstico, complexidade baixa/média) e o serviço desejado. Não aceitamos alta complexidade/UTI." />
            <Step n={3} t="Receba candidatos" d="Profissionais qualificados se candidatam. Você vê perfil, registro profissional e disponibilidade." />
            <Step n={4} t="Converse e contrate" d="Use o chat interno para alinhar detalhes, valores e formatos (PJ/CLT, hora ou plantão)." />
          </ol>
          <Link to="/cadastro?tipo=contratante" className="btn-primary mt-6">Quero contratar</Link>
        </article>

        <article className="card">
          <h2 className="text-xl font-semibold text-brand-blue">Para o Profissional</h2>
          <ol className="mt-4 space-y-4 text-brand-ink/80">
            <Step n={1} t="Crie seu perfil" d="Dados pessoais, conselho profissional (COREN, CRM, CREFITO etc.) e especialidades." />
            <Step n={2} t="Suba seu diploma" d="Anexe PDF/JPG do diploma. Vamos validar a formatação e o número de registro." />
            <Step n={3} t="Defina disponibilidade" d="Períodos (manhã, tarde, noite, 12h, 24h) e dias da semana." />
            <Step n={4} t="Candidate-se às vagas" d="Use filtros por tipo, complexidade, região e remuneração. Candidate-se com uma mensagem." />
          </ol>
          <Link to="/cadastro?tipo=profissional" className="btn-primary mt-6">Quero trabalhar</Link>
        </article>
      </div>

      <div className="mt-12 card max-w-3xl mx-auto">
        <h3 className="text-lg font-semibold">Importante sobre segurança</h3>
        <p className="mt-2 text-sm text-brand-slate">
          A plataforma exibe selos de verificação de documentos. Mesmo assim, sempre confira o número de registro do profissional no site do respectivo conselho antes de fechar a contratação.
        </p>
      </div>
    </section>
  );
}

function Step({ n, t, d }) {
  return (
    <li className="flex gap-4">
      <div className="h-9 w-9 shrink-0 rounded-full bg-brand-blue text-white grid place-items-center font-semibold">{n}</div>
      <div>
        <p className="font-medium">{t}</p>
        <p className="text-sm text-brand-slate">{d}</p>
      </div>
    </li>
  );
}
