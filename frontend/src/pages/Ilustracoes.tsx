/**
 * pages/Ilustracoes.tsx
 *
 * Galeria viva do sistema de ilustrações "Essência do Cuidar".
 * Documentação visual em produto: fauna, flora, avatares, cenários e a
 * paleta — tudo renderizado dos componentes reais (não de imagens), então
 * qualquer ajuste no sistema aparece aqui automaticamente.
 *
 * Rota: /ilustracoes (pública, leve — SVG inline).
 */
import { AvatarCuidadora, AvatarEnfermeira, AvatarMedico, AvatarIdoso, AvatarIdosa, AvatarFamilia } from '../components/ilustracoes/Avatares';
import { BeijaFlor, Borboleta, Passarinho } from '../components/ilustracoes/Fauna';
import { RamoBotanico, DivisorBotanico, VinhaCanto, CoracaoMaos, FolhaSolta } from '../components/ilustracoes/Flora';
import { CenarioDomiciliar, CenarioHospitalar, CenarioConsulta, CenarioJardim, CenarioVazio } from '../components/ilustracoes/Cenarios';
import { ESS } from '../components/ilustracoes/paleta';

const AVATARES: { nome: string; el: React.ReactNode }[] = [
  { nome: 'Cuidadora', el: <AvatarCuidadora titulo="Avatar: cuidadora" /> },
  { nome: 'Enfermeira', el: <AvatarEnfermeira titulo="Avatar: enfermeira" /> },
  { nome: 'Médico', el: <AvatarMedico titulo="Avatar: médico" /> },
  { nome: 'Idoso', el: <AvatarIdoso titulo="Avatar: idoso" /> },
  { nome: 'Idosa', el: <AvatarIdosa titulo="Avatar: idosa" /> },
  { nome: 'Família', el: <AvatarFamilia titulo="Avatar: família" /> }
];

const CENARIOS: { nome: string; desc: string; el: React.ReactNode }[] = [
  { nome: 'Cenário domiciliar', desc: 'Sala de casa — cuidadora oferecendo chá à idosa.', el: <CenarioDomiciliar titulo="Cenário domiciliar" /> },
  { nome: 'Cenário hospitalar', desc: 'Quarto de enfermaria — enfermeira, leito e monitor.', el: <CenarioHospitalar titulo="Cenário hospitalar" /> },
  { nome: 'Cenário consultas', desc: 'Caminhada acompanhada até a unidade de saúde.', el: <CenarioConsulta titulo="Cenário consultas" /> },
  { nome: 'Cenário jardim', desc: 'O jardim da essência — beija-flor entre as flores.', el: <CenarioJardim titulo="Cenário jardim" /> },
  { nome: 'Cenário vazio', desc: 'Sala quieta para estados sem registro nos painéis.', el: <CenarioVazio titulo="Cenário vazio" /> }
];

const PALETA: { nome: string; hex: string }[] = [
  { nome: 'floresta', hex: ESS.floresta },
  { nome: 'salvia 500', hex: ESS.salvia500 },
  { nome: 'salvia 300', hex: ESS.salvia300 },
  { nome: 'dourado 400', hex: ESS.dourado400 },
  { nome: 'dourado 200', hex: ESS.dourado200 },
  { nome: 'creme 100', hex: ESS.creme100 },
  { nome: 'terracota', hex: ESS.terracota },
  { nome: 'serenity', hex: ESS.lapisLazuli }
];

export default function Ilustracoes() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 fade-in">
      <h1 className="text-3xl md:text-4xl font-bold text-center">
        Ilustrações — Essência do Cuidar
      </h1>
      <p className="text-center text-slate-500 mt-2 max-w-xl mx-auto">
        Sistema vetorial em SVG inline: fauna, flora, avatares e cenários da
        identidade dos roteiros. Animações desligam em prefers-reduced-motion.
      </p>
      <DivisorBotanico className="w-full max-w-md mx-auto my-8 opacity-80" titulo="Divisor botânico da marca" />

      {/* Cenários */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold mb-1">Cenários</h2>
        <p className="text-sm text-slate-500 mb-5">Cenas 320×200 em camadas, paleta única.</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CENARIOS.map((c) => (
            <figure key={c.nome} className="card !p-0 overflow-hidden">
              <div className="moldura-cenario [&>svg]:w-full [&>svg]:h-auto [&>svg]:block">{c.el}</div>
              <figcaption className="px-5 py-3">
                <p className="font-semibold text-sm">{c.nome}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.desc}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Avatares */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold mb-1">Avatares</h2>
        <p className="text-sm text-slate-500 mb-5">
          Busto circular 120×120 com recorte comum; dois tons de pele por prop.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {AVATARES.map((a) => (
            <figure key={a.nome} className="text-center">
              <div className="w-full max-w-[110px] mx-auto [&>div>svg]:w-full [&>div>svg]:h-auto">{a.el}</div>
              <figcaption className="text-xs text-slate-500 mt-2">{a.nome}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Fauna */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold mb-1">Fauna</h2>
        <p className="text-sm text-slate-500 mb-5">Asas com batida sutil; corpo pode planar (ilustracao-planar).</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <figure className="card text-center"><BeijaFlor className="w-40 mx-auto h-auto ilustracao-animada" titulo="Beija-flor" /><figcaption className="text-xs text-slate-500 mt-2">Beija-flor</figcaption></figure>
          <figure className="card text-center"><Borboleta className="w-32 mx-auto h-auto ilustracao-animada" titulo="Borboleta" /><figcaption className="text-xs text-slate-500 mt-2">Borboleta</figcaption></figure>
          <figure className="card text-center"><Passarinho className="w-32 mx-auto h-auto ilustracao-animada" titulo="Passarinho" /><figcaption className="text-xs text-slate-500 mt-2">Passarinho</figcaption></figure>
        </div>
      </section>

      {/* Flora */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold mb-1">Flora</h2>
        <p className="text-sm text-slate-500 mb-5">Ramos dourados dos roteiros, divisores e o emblema da marca.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 items-center">
          <figure className="card text-center"><RamoBotanico className="w-36 mx-auto h-auto ilustracao-oscilar" titulo="Ramo botânico" /><figcaption className="text-xs text-slate-500 mt-2">RamoBotanico</figcaption></figure>
          <figure className="card text-center"><RamoBotanico flip className="w-36 mx-auto h-auto ilustracao-oscilar" titulo="Ramo botânico espelhado" /><figcaption className="text-xs text-slate-500 mt-2">RamoBotanico flip</figcaption></figure>
          <figure className="card text-center"><VinhaCanto className="w-32 mx-auto h-auto" titulo="Vinha de canto" /><figcaption className="text-xs text-slate-500 mt-2">VinhaCanto</figcaption></figure>
          <figure className="card text-center"><FolhaSolta className="w-10 mx-auto h-auto" titulo="Folha solta" /><figcaption className="text-xs text-slate-500 mt-2">FolhaSolta</figcaption></figure>
          <figure className="card text-center"><CoracaoMaos className="w-20 mx-auto h-auto" titulo="Emblema mãos e coração" /><figcaption className="text-xs text-slate-500 mt-2">CoracaoMaos</figcaption></figure>
          <figure className="card text-center"><DivisorBotanico className="w-full h-auto" titulo="Divisor botânico" /><figcaption className="text-xs text-slate-500 mt-2">DivisorBotanico</figcaption></figure>
        </div>
      </section>

      {/* Paleta */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-1">Paleta</h2>
        <p className="text-sm text-slate-500 mb-5">
          Fonte única em <code className="text-xs bg-slate-100 rounded px-1">ilustracoes/paleta.ts</code>,
          espelhada no Tailwind como <code className="text-xs bg-slate-100 rounded px-1">essencia.*</code>.
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {PALETA.map((c) => (
            <figure key={c.nome} className="text-center">
              <div className="h-14 rounded-xl shadow-card border border-slate-100" style={{ backgroundColor: c.hex }} />
              <figcaption className="text-[11px] text-slate-500 mt-1.5 leading-tight">
                {c.nome}
                <span className="block text-slate-400">{c.hex}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
