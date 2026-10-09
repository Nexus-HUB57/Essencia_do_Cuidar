export default function ComoFunciona() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 fade-in">
      <h1 className="text-3xl md:text-4xl font-bold text-center mb-3">Como funciona</h1>
      <p className="text-center text-slate-500 mb-12 max-w-xl mx-auto">
        Dois caminhos simples, uma plataforma segura.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-serenity-600 mb-6">🏠 Para quem busca profissional</h2>
        <ol className="space-y-4">
          {[
            ['Cadastre-se como +Saúde', 'Crie sua conta gratuita com nome, e-mail e telefone.'],
            ['Publique a vaga', 'Detalhe o paciente, jornada desejada e tipo de profissional.'],
            ['Receba candidatos verificados', 'Profissionais com diploma e registro aparecem primeiro.'],
            ['Converse e feche', 'Use o chat interno para combinar detalhes com segurança.'],
            ['Acompanhe o atendimento', 'A vaga fica ativa até você pausar ou fechar.']
          ].map(([t, d], i) => (
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
        <h2 className="text-2xl font-bold text-emerald-600 mb-6">🩺 Para profissionais</h2>
        <ol className="space-y-4">
          {[
            ['Cadastre-se gratuitamente', 'Preencha seus dados pessoais, especialidade e disponibilidade.'],
            ['Suba seu diploma', 'PDF ou imagem do diploma/registro para ganhar o selo de verificado.'],
            ['Filtre e candidate-se', 'Busque vagas por região, complexidade e remuneração.'],
            ['Converse com a família', 'Chat interno para combinar tudo antes de começar.'],
            ['Receba o contato', 'Ao ser aceito, você recebe o telefone do contratante para alinhar a chegada.']
          ].map(([t, d], i) => (
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
        <h3 className="font-semibold text-amber-900">⚠️ Importante sobre segurança</h3>
        <ul className="text-sm text-amber-800 mt-2 space-y-1 list-disc list-inside">
          <li>Verifique sempre o número de registro (COREN, CRM, etc.) no site do conselho.</li>
          <li>Combine o primeiro encontro em local público ou com a família presente.</li>
          <li>Esta plataforma <strong>não</strong> atende casos de alta complexidade / UTI.</li>
        </ul>
      </div>
    </div>
  );
}
