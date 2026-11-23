/**
 * pages/Plantoes.tsx
 *
 * Catálogo de plantões avulsos (Mercado Pago Payment Links).
 *
 * O preço aparece antes de qualquer cadastro — quem decide paga o valor
 * publicado. "Contratar" registra a intenção no backend (pendente) e abre o
 * checkout hospedado no Mercado Pago em nova aba (cartão, Pix etc.). A página
 * acompanha o status pela external_reference até a confirmação do webhook.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import { useAuth, getErrorMessage } from '../context/AuthContext';

interface Plantao {
  id: string;
  titulo: string;
  familia: 'enfermagem' | 'cuidador';
  horas: number;
  preco_centavos: number;
  preco_formatado: string;
}

interface Pagamento {
  id: number;
  external_reference: string;
  id_plantao: string;
  titulo: string;
  valor_centavos: number;
  status: 'pendente' | 'pago' | 'cancelado';
  criado_em: string;
  pago_em: string | null;
}

type Familia = 'todas' | 'enfermagem' | 'cuidador';

const FAMILIAS: Familia[] = ['todas', 'enfermagem', 'cuidador'];

export default function Plantoes() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [familia, setFamilia] = useState<Familia>('todas');
  const [plantoes, setPlantoes] = useState<Plantao[]>([]);
  const [meus, setMeus] = useState<Pagamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aguardando, setAguardando] = useState<string | null>(null); // external_reference em polling
  const [erro, setErro] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await api.get('/plantoes');
      setPlantoes(data.plantoes);
      if (user) {
        const meus = await api.get('/plantoes/meus');
        setMeus(meus.data.pagamentos);
      }
    } catch (err) {
      setErro(getErrorMessage(err));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [user]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const visiveis = useMemo(
    () => (familia === 'todas' ? plantoes : plantoes.filter(p => p.familia === familia)),
    [plantoes, familia]
  );

  // Abre o checkout do MP e acompanha o pagamento até confirmar (ou desistir).
  async function contratar(plantao: Plantao) {
    if (!user) {
      alert(t('plantoes.loginRequired'));
      return;
    }
    setErro(null);
    try {
      const { data } = await api.post(`/plantoes/${plantao.id}/checkout`);
      window.open(data.checkout_url, '_blank', 'noopener');

      // Polling do status: o webhook do Mercado Pago confirma; o endpoint
      // /confirmar só existe no modo mock do backend.
      setAguardando(data.external_reference);
      if (pollRef.current) clearInterval(pollRef.current);
      let tentativas = 0;
      pollRef.current = setInterval(async () => {
        tentativas += 1;
        try {
          const st = await api.get(`/plantoes/status/${data.external_reference}`);
          if (st.data.pagamento.status === 'pago') {
            if (pollRef.current) clearInterval(pollRef.current);
            setAguardando(null);
            alert(t('plantoes.pagamentoConfirmado'));
            carregar();
          }
        } catch {
          /* mantém o polling; rede instável não cancela a compra */
        }
        // ~2 minutos de espera; usuário pode acompanhar pelo histórico
        if (tentativas > 40) {
          if (pollRef.current) clearInterval(pollRef.current);
          setAguardando(null);
        }
      }, 3000);
    } catch (err) {
      setErro(getErrorMessage(err));
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 fade-in">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('plantoes.title')}</h1>
      <p className="text-slate-600 dark:text-slate-300 mt-2 max-w-2xl">{t('plantoes.subtitle')}</p>

      {/* Filtro por família */}
      <div className="flex gap-2 mt-6 flex-wrap">
        {FAMILIAS.map((f) => (
          <button
            key={f}
            onClick={() => setFamilia(f)}
            className={familia === f ? 'btn-primary text-sm' : 'btn-ghost text-sm'}
          >
            {t(`plantoes.familia.${f}`)}
          </button>
        ))}
      </div>

      {erro && <p className="text-rose-600 text-sm mt-4">{erro}</p>}
      {carregando ? (
        <p className="text-center text-slate-400 py-12">{t('common.loading')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
          {visiveis.map((p) => (
            <div key={p.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-snug">{p.titulo}</h3>
                <span className={p.familia === 'enfermagem' ? 'badge-blue' : 'badge-green'}>
                  {t(`plantoes.familia.${p.familia}`)}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('plantoes.duracao', { horas: p.horas })}
              </p>
              <div className="mt-auto flex items-end justify-between gap-2">
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{p.preco_formatado}</p>
                  <p className="text-xs text-slate-400">{t('plantoes.pagamentoUnico')}</p>
                </div>
                <button
                  onClick={() => contratar(p)}
                  disabled={aguardando !== null}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {aguardando !== null ? t('plantoes.aguardando') : t('plantoes.contratar')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {aguardando && (
        <div className="card mt-6 border-2 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t('plantoes.aguardandoPagamento')}
          </p>
        </div>
      )}

      {/* Histórico do usuário */}
      {user && meus.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
            {t('plantoes.meusPagamentos')}
          </h2>
          <div className="space-y-3">
            {meus.map((pg) => (
              <div key={pg.id} className="card flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-semibold">{pg.titulo}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(pg.criado_em + 'Z').toLocaleString()} • ref {pg.external_reference.slice(0, 24)}…
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold">
                    {t('plantoes.precoValor', { valor: (pg.valor_centavos / 100).toFixed(2).replace('.', ',') })}
                  </span>
                  {pg.status === 'pendente' && <span className="badge-amber">{t('plantoes.statusPendente')}</span>}
                  {pg.status === 'pago' && <span className="badge-green">{t('plantoes.statusPago')}</span>}
                  {pg.status === 'cancelado' && <span className="badge-slate">{t('plantoes.statusCancelado')}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
