import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../utils/api';
import type { Vaga } from '../types';
import FavoritarBotao from '../components/FavoritarBotao';

export default function VagasPublicas() {
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtros, setFiltros] = useState({
    profissional: '',
    complexidade: '',
    regiao: '',
    remMin: ''
  });

  async function carregar() {
    setLoading(true);
    setErro('');
    try {
      const params: any = {};
      if (filtros.profissional) params.profissional = filtros.profissional;
      if (filtros.complexidade) params.complexidade = filtros.complexidade;
      if (filtros.regiao)       params.regiao = filtros.regiao;
      if (filtros.remMin)       params.remuneracaoMin = filtros.remMin;
      const { data } = await api.get('/vagas', { params });
      setVagas(data.vagas);
    } catch (err) {
      setErro(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 fade-in">
      <h1 className="text-2xl md:text-3xl font-bold mb-1">Vagas abertas</h1>
      <p className="text-slate-500 mb-6">Encontre oportunidades de cuidado domiciliar</p>

      {/* Filtros */}
      <div className="card mb-6">
        <div className="grid sm:grid-cols-4 gap-3">
          <input className="input" placeholder="Profissional (ex: Cuidador)"
            value={filtros.profissional} onChange={(e) => setFiltros({ ...filtros, profissional: e.target.value })} />
          <select className="input" value={filtros.complexidade} onChange={(e) => setFiltros({ ...filtros, complexidade: e.target.value })}>
            <option value="">Complexidade</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
          </select>
          <input className="input" placeholder="Região (ex: Zona Sul)"
            value={filtros.regiao} onChange={(e) => setFiltros({ ...filtros, regiao: e.target.value })} />
          <div className="flex gap-2">
            <input className="input" type="number" placeholder="R$ mín." value={filtros.remMin}
              onChange={(e) => setFiltros({ ...filtros, remMin: e.target.value })} />
            <button onClick={carregar} className="btn-primary shrink-0">Filtrar</button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 text-center py-12">Carregando vagas...</p>
      ) : erro ? (
        <p className="text-rose-500 text-center py-12">{erro}</p>
      ) : vagas.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          Nenhuma vaga ativa no momento.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {vagas.map((v) => (
            <div key={v.id} className="relative card hover:shadow-lg transition-shadow group">
              <Link to={`/vagas/${v.id}`} className="block">
                <div className="flex items-start justify-between mb-2 pr-8">
                  <h3 className="font-semibold text-slate-900 group-hover:text-serenity-600 transition">
                    {v.profissional_desejado}
                  </h3>
                  <span className={v.complexidade === 'media' ? 'badge-amber' : 'badge-green'}>
                    {v.complexidade === 'media' ? 'Média' : 'Baixa'}
                  </span>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2 mb-3">{v.servico_descricao}</p>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {v.regiao && <span>📍 {v.regiao}</span>}
                  {v.jornada_horario && <span>🕐 {v.jornada_horario}</span>}
                  {v.tipo_contrato && <span>📄 {v.tipo_contrato}</span>}
                  {v.remuneracao_valor && (
                    <span className="font-semibold text-emerald-600">
                      💰 R$ {v.remuneracao_valor}/{v.remuneracao_tipo === 'hora' ? 'h' : 'plantão'}
                    </span>
                  )}
                </div>
              </Link>
              <div className="absolute top-3 right-3">
                <FavoritarBotao tipo="vaga" id={v.id} size="sm" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
