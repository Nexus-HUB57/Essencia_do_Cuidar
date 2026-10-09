export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <img src="/favicon.svg" className="w-7 h-7" alt="logo" />
            <span className="text-white font-semibold">Essência do Cuidar</span>
          </div>
          <p className="text-sm text-slate-400">
            Conectando famílias a profissionais de saúde qualificados para cuidado domiciliar
            com segurança e empatia.
          </p>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Para Famílias</h4>
          <ul className="space-y-2 text-sm">
            <li>Buscar profissionais</li>
            <li>Publicar vaga</li>
            <li>Como funciona</li>
            <li>Selos de verificação</li>
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Para Profissionais</h4>
          <ul className="space-y-2 text-sm">
            <li>Cadastrar currículo</li>
            <li>Encontrar vagas</li>
            <li>Upload de diploma</li>
            <li>Verificação de registro</li>
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Segurança</h4>
          <p className="text-sm text-slate-400">
            Verificamos registros profissionais e recomendamos sempre confirmar a identidade
            do prestador antes de iniciar o atendimento.
          </p>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Essência do Cuidar. Construído com cuidado.
      </div>
    </footer>
  );
}
