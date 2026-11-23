/**
 * Componente ProtocolosPanel
 *
 * Lista os protocolos PCP/PCM/PDC do usuário logado (contratante ou profissional)
 * com ações contextuais conforme o status:
 *
 *   - Profissional:
 *     * PCM em 'enviado' → botões Aceitar / Recusar
 *     * PDC em 'checkout_pendente' sem check-in → botão Fazer check-in
 *     * PDC em 'checkout_pendente' com check-in → botão Finalizar plantão (check-out)
 *     * PDC em 'em_custodia' → badge "Aguardando checkout"
 *
 *   - Contratante:
 *     * PDC em 'enviado' → botão Pagar custódia (chama /pagar)
 *     * PDC em 'checkout_pendente' com check-in do profissional → botão Confirmar presença
 *     * PDC em 'checkout_profissional' → botão Confirmar execução (com avaliação)
 *     * PDC em 'checkout_profissional' → botão Recusar pagamento (PNP — abre modal com 5 critérios)
 *     * PDC em 'checkout_completo' → badge "Liberando em até 72h"
 *
 *   - Ambos:
 *     * Histórico de transições (clique para expandir)
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Estrelas from './Estrelas';
import api from '../utils/api';

interface Protocolo {
  id: number;
  tipo: 'PCP' | 'PCM' | 'PDC' | 'CHECKOUT';
  id_vaga: number;
  id_candidatura: number;
  id_contratante: number;
  id_profissional: number;
  status: string;
  valor_plantao_centavos: number;
  valor_taxa_centavos: number;
  valor_total_centavos: number;
  criado_em: string;
  enviado_em: string | null;
  respondido_em: string | null;
  pago_em: string | null;
  checkin_profissional_em: string | null;
  checkin_contratante_em: string | null;
  checkout_profissional_em: string | null;
  checkout_contratante_em: string | null;
  liberado_em: string | null;
  expira_em: string | null;
  motivo_rejeicao: string | null;
  observacoes: string | null;
  // JOINs:
  vaga_titulo?: string;
  vaga_descricao?: string;
  vaga_regiao?: string;
  vaga_horario?: string;
  vaga_uf?: string;
  vaga_escala?: string;
  vaga_complexidade?: string;
  vaga_remuneracao_tipo?: string;
  contratante_nome?: string;
  profissional_nome?: string;
  total_checkins?: number;
}

interface Checkout {
  id: number;
  id_protocolo: number;
  tipo_user: string;
  nota: number | null;
  comentario: string | null;
  confirmado_em: string;
}

interface Checkin {
  id: number;
  id_protocolo: number;
  id_user: number;
  tipo_user: string;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
  implicito: number;
  confirmado_em: string;
  user_nome?: string;
}

interface HistoricoItem {
  id: number;
  status_anterior: string | null;
  status_novo: string;
  alterado_por: number | null;
  motivo: string | null;
  criado_em: string;
}

const BRL = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  enviado: 'Aguardando resposta',
  aceito: 'Aceito',
  recusado: 'Recusado',
  pago: 'Pago',
  em_custodia: 'Em custódia',
  checkout_pendente: 'Aguardando checkout',
  checkout_profissional: 'Profissional confirmou',
  checkout_contratante: 'Contratante confirmou',
  checkout_completo: 'Checkout completo',
  liberado: 'Liberado',
  liberado_parcial: 'Liberado parcial',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
  reembolsado: 'Reembolsado',
  recusado_pnp: 'Recusado (PNP)',
  em_analise_pnp: 'Em análise admin'
};

const STATUS_BADGE: Record<string, string> = {
  pendente: 'badge-slate',
  enviado: 'badge-blue',
  aceito: 'badge-amber',
  recusado: 'badge-rose',
  pago: 'badge-purple',
  em_custodia: 'badge-purple',
  checkout_pendente: 'badge-amber',
  checkout_profissional: 'badge-amber',
  checkout_contratante: 'badge-amber',
  checkout_completo: 'badge-green',
  liberado: 'badge-green',
  liberado_parcial: 'badge-green',
  cancelado: 'badge-slate',
  expirado: 'badge-slate',
  reembolsado: 'badge-slate',
  recusado_pnp: 'badge-rose',
  em_analise_pnp: 'badge-amber'
};

const PN_CRITERIOS = [
  { value: 'nao_compareceu', label: 'Não compareceu', desc: 'Profissional não compareceu (sem aviso 6h antes)' },
  { value: 'abandono_plantao', label: 'Abandono de plantão', desc: 'Não cumpriu horário integral' },
  { value: 'irregularidade', label: 'Irregularidade técnica', desc: 'Irregularidade técnica durante o plantão' },
  { value: 'imprevisto', label: 'Imprevisto', desc: 'Pagamento parcial pelas horas trabalhadas' },
  { value: 'recusa_titular', label: 'Recusa do titular', desc: 'Qualificação/competência/perfil inadequados' }
];

export default function ProtocolosPanel() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [pixData, setPixData] = useState<{ protocoloId: number; qr_code_base64: string; qr_code_texto: string; valor_total_centavos: number } | null>(null);
  const [pnpModal, setPnpModal] = useState<number | null>(null);
  const [pnpForm, setPnpForm] = useState({ criterio: '', descricao: '', horas_trabalhadas: 0 });
  const [checkoutModal, setCheckoutModal] = useState<number | null>(null);
  const [checkoutForm, setCheckoutForm] = useState({ nota: 0, comentario: '' });
  const [buscandoGeo, setBuscandoGeo] = useState(false);

  const isProfissional = user?.tipo_usuario === 'profissional';
  const isContratante = user?.tipo_usuario === 'contratante';

  /**
   * Rótulo e cor do badge de status.
   *
   * `checkout_pendente` cobre DUAS fases: antes do check-in (o profissional
   * ainda não chegou) e depois (está em plantão). O badge precisa mostrar a
   * fase real — com o mapa estático, o profissional que já tinha feito o
   * check-in continuava vendo "Aguardando checkout", como se nada tivesse
   * acontecido.
   */
  function badgeDe(p: Protocolo): { label: string; classe: string } {
    if (p.status === 'checkout_pendente') {
      return p.checkin_profissional_em
        ? { label: t('protocolos.inShift'), classe: 'badge-green' }
        : { label: t('protocolos.awaitingCheckInShort'), classe: 'badge-amber' };
    }
    return {
      label: STATUS_LABEL[p.status] || p.status,
      classe: STATUS_BADGE[p.status] || 'badge-slate'
    };
  }

  useEffect(() => {
    loadProtocolos();
  }, []);

  async function loadProtocolos() {
    setLoading(true);
    try {
      const { data } = await api.get('/protocolos?limite=50');
      setProtocolos(data.protocolos || []);
    } catch (e) {
      console.error(e);
      toast.error(getErrorMessage(e));
    } finally { setLoading(false); }
  }

  async function loadDetalhes(protocoloId: number) {
    try {
      const [h, c, ci] = await Promise.all([
        api.get(`/protocolos/${protocoloId}/historico-status`),
        api.get(`/protocolos/${protocoloId}/checkouts`),
        api.get(`/protocolos/${protocoloId}/checkins`)
      ]);
      setHistorico(h.data.historico || []);
      setCheckouts(c.data.checkouts || []);
      setCheckins(ci.data.checkins || []);
    } catch (e) { console.error(e); }
  }

  function toggleExpand(id: number) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadDetalhes(id);
  }

  async function aceitarPCM(pcmId: number) {
    if (!confirm(t('protocolos.confirmAccept'))) return;
    try {
      const { data } = await api.post(`/protocolos/${pcmId}/aceitar`);
      toast.success('✓ Matching aceito! Aguardando pagamento da custódia pelo contratante.');
      loadProtocolos();
    } catch (e) { toast.error(getErrorMessage(e)); }
  }

  async function recusarPCM(pcmId: number) {
    const motivo = prompt('Motivo da recusa (opcional):') || '';
    try {
      await api.post(`/protocolos/${pcmId}/recusar`, { motivo });
      toast.success('Matching recusado. Vaga reaberta.');
      loadProtocolos();
    } catch (e) { toast.error(getErrorMessage(e)); }
  }

  async function pagarPDC(pdcId: number) {
    try {
      const { data } = await api.post(`/protocolos/${pdcId}/pagar`);
      if (data.pix_flow) {
        // Live MP — mostra QR code
        setPixData({
          protocoloId: pdcId,
          qr_code_base64: data.qr_code_base64,
          qr_code_texto: data.qr_code_texto,
          valor_total_centavos: data.valor_total_centavos
        });
        toast.info('Pix gerado! Escaneie o QR code para pagar.');
      } else {
        // Mock — confirma imediato
        toast.success('✓ Pagamento em custódia confirmado! Profissional notificado com a garantia.');
        loadProtocolos();
      }
    } catch (e) { toast.error(getErrorMessage(e)); }
  }

  async function confirmarPix(pdcId: number) {
    try {
      const { data } = await api.post(`/protocolos/${pdcId}/confirmar-pix`);
      toast.success('✓ Pix confirmado! Custódia ativa.');
      setPixData(null);
      loadProtocolos();
    } catch (e) { toast.error(getErrorMessage(e)); }
  }

  /**
   * Captura a geolocalização do usuário (opcional).
   *
   * O check-in funciona sem ela — a localização é um plus, não um requisito.
   * Se o browser negar a permissão, ou demorar, o check-in segue sem
   * coordenadas em vez de falhar.
   */
  function capturarLocalizacao(): Promise<{ latitude?: number; longitude?: number }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      let done = false;
      const finish = (v: { latitude?: number; longitude?: number }) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      // Uma requisição de geolocalização travada não pode segurar o check-in.
      const timer = setTimeout(() => finish({}), 5000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          finish({});
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    });
  }

  /**
   * Registra o check-in (chegada ao plantão).
   *
   * O profissional registra a própria chegada; o contratante confirma a
   * presença depois que o profissional já fez o check-in dele.
   */
  async function fazerCheckin(pdcId: number) {
    setBuscandoGeo(true);
    try {
      const coords = await capturarLocalizacao();
      const { data } = await api.post(`/protocolos/${pdcId}/checkin`, coords);
      if (data.ja_feito) {
        toast.info(t('protocolos.checkInAlready'));
      } else {
        toast.success(t('protocolos.checkInSuccess'));
        if (!coords.latitude) toast.info(t('protocolos.locationUnavailable'));
      }
      loadProtocolos();
      if (expanded === pdcId) loadDetalhes(pdcId);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBuscandoGeo(false);
    }
  }

  function abrirCheckout(pdcId: number) {
    setCheckoutModal(pdcId);
    setCheckoutForm({ nota: 0, comentario: '' });
  }

  async function confirmarCheckout(pdcId: number) {
    try {
      const payload: { nota?: number; comentario?: string } = { comentario: checkoutForm.comentario };
      if (checkoutForm.nota > 0) payload.nota = checkoutForm.nota;
      const { data } = await api.post(`/protocolos/${pdcId}/checkout`, payload);
      setCheckoutModal(null);
      if (data.checkout_completo) {
        toast.success(t('protocolos.checkOutSuccess') + ' ' + t('protocolos.checkoutComplete'));
      } else {
        toast.success(t('protocolos.checkOutSuccess') + ' ' + t('protocolos.waitOther'));
      }
      loadProtocolos();
      if (expanded === pdcId) loadDetalhes(pdcId);
    } catch (e) { toast.error(getErrorMessage(e)); }
  }

  async function abrirPNP(pdcId: number) {
    setPnpModal(pdcId);
    setPnpForm({ criterio: '', descricao: '', horas_trabalhadas: 0 });
  }

  async function enviarPNP(pdcId: number) {
    if (!pnpForm.criterio) { toast.error('Escolha um critério'); return; }
    if (!pnpForm.descricao) { toast.error('Descreva o motivo'); return; }
    if (pnpForm.criterio === 'imprevisto' && (!pnpForm.horas_trabalhadas || pnpForm.horas_trabalhadas <= 0)) {
      toast.error('Informe as horas trabalhadas para o critério "Imprevisto"');
      return;
    }
    try {
      const { data } = await api.post(`/protocolos/${pdcId}/recusar-pagamento`, pnpForm);
      if (data.tipo === 'reembolso_total') {
        toast.success(`✓ Reembolso total processado: ${BRL(data.valor_reembolsado_centavos || 0)}`);
      } else if (data.tipo === 'pagamento_parcial') {
        toast.success(`✓ Pagamento parcial: ${BRL(data.valor_parcial_centavos)} ao profissional, ${BRL(data.valor_reembolso_centavos)} reembolsado`);
      } else if (data.tipo === 'em_analise') {
        toast.info('Caso enviado para análise administrativa. Admin decidirá.');
      } else {
        toast.success('Recusa registrada.');
      }
      setPnpModal(null);
      loadProtocolos();
    } catch (e) { toast.error(getErrorMessage(e)); }
  }

  if (loading) return <p className="text-center text-slate-400 py-8">Carregando protocolos...</p>;

  if (protocolos.length === 0) {
    return (
      <div className="card text-center py-8 text-slate-500">
        {isProfissional ? t('protocolos.emptyProfissional') : t('protocolos.emptyContratante')}
      </div>
    );
  }

  // Filtra protocolos relevantes para mostrar (PDC para ambos, PCM para prof, PCP não mostra)
  //
  // O PCM some quando o PDC do mesmo plantão já existe: PCP, PCM e PDC são
  // três linhas do MESMO plantão, e mostrá-las juntas fazia o cards
  // contradizerem (um dizia "Em plantão" e o outro "Aguardando checkout"
  // para o mesmo turno). O PCM só aparece enquanto não há PDC — ou seja,
  // na fase em que o profissional ainda tem o que decidir (aceitar/recusar).
  const relevantes = protocolos.filter(p => {
    if (p.tipo === 'PDC') return true;
    if (isProfissional && p.tipo === 'PCM') {
      const temPdc = protocolos.some(
        (o) => o.tipo === 'PDC' &&
          o.id_vaga === p.id_vaga &&
          o.id_candidatura === p.id_candidatura
      );
      return !temPdc;
    }
    return false;
  });

  return (
    <div className="space-y-3">
      {pixData && (
        <div className="card p-4 bg-serenity-50 border-serenity-200">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-semibold text-sm"> pagamento via Pix — Protocolo #{pixData.protocoloId}</p>
              <p className="text-xs text-slate-600">Valor: <strong>{BRL(pixData.valor_total_centavos)}</strong></p>
              <p className="text-xs text-slate-500 mt-1">Escaneie o QR code abaixo com seu app de banco para pagar.</p>
            </div>
            <button onClick={() => setPixData(null)} className="text-xs text-slate-500 hover:text-rose-500">✕ Fechar</button>
          </div>
          <div className="flex flex-col items-center gap-3">
            <img src={pixData.qr_code_base64} alt="QR Code Pix" className="w-48 h-48 bg-white p-2 rounded-lg border" />
            <p className="text-[10px] text-slate-500 font-mono break-all text-center max-w-md">{pixData.qr_code_texto}</p>
            <button onClick={() => confirmarPix(pixData.protocoloId)}
              className="btn-primary text-xs">
              ✓ Já paguei — confirmar
            </button>
          </div>
        </div>
      )}

      {checkoutModal && (
        <div className="card p-4 bg-serenity-50 border-serenity-200">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-semibold text-sm">✓ Confirmar execução — Protocolo #{checkoutModal}</p>
              <p className="text-xs text-slate-600">
                {isContratante
                  ? 'Avalie o profissional. A nota alimenta a reputação dele no sistema de matching.'
                  : 'Confirme que o plantão foi concluído.'}
              </p>
            </div>
            <button onClick={() => setCheckoutModal(null)} className="text-xs text-slate-500 hover:text-rose-500">✕ Fechar</button>
          </div>
          <div className="space-y-3">
            {isContratante && (
              <div>
                <label className="text-xs text-slate-600 font-medium">Sua avaliação:</label>
                <div className="mt-1">
                  <Estrelas value={checkoutForm.nota} size="lg" showNumber={false} interactive onChange={(v) => setCheckoutForm(f => ({ ...f, nota: v }))} />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-600 font-medium">Comentário (opcional):</label>
              <textarea
                value={checkoutForm.comentario}
                onChange={e => setCheckoutForm(f => ({ ...f, comentario: e.target.value }))}
                rows={3}
                className="input text-sm w-full mt-1"
                placeholder={isContratante ? 'Como foi o atendimento?' : 'Observações sobre o plantão (opcional)...'}
              />
            </div>
            <button onClick={() => confirmarCheckout(checkoutModal)} className="btn-primary text-xs">
              ✓ {t('protocolos.checkOut')}
            </button>
          </div>
        </div>
      )}

      {pnpModal && (
        <div className="card p-4 bg-rose-50 border-rose-200">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-semibold text-sm text-rose-700">⚠️ Recusar pagamento — Protocolo #{pnpModal}</p>
              <p className="text-xs text-slate-600">Escolha o motivo da recusa (Protocolo de Não Pagamento):</p>
            </div>
            <button onClick={() => setPnpModal(null)} className="text-xs text-slate-500 hover:text-rose-500">✕ Fechar</button>
          </div>
          <div className="space-y-2">
            {PN_CRITERIOS.map(c => (
              <label key={c.value} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="criterio"
                  value={c.value}
                  checked={pnpForm.criterio === c.value}
                  onChange={e => setPnpForm({ ...pnpForm, criterio: e.target.value })}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-slate-500">{c.desc}</p>
                </div>
              </label>
            ))}
            {pnpForm.criterio === 'imprevisto' && (
              <div>
                <label className="text-xs text-slate-600 font-medium">Horas trabalhadas (para cálculo proporcional):</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={pnpForm.horas_trabalhadas || ''}
                  onChange={e => setPnpForm({ ...pnpForm, horas_trabalhadas: Number(e.target.value) })}
                  className="input text-sm w-32 mt-1"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-slate-600 font-medium">Descrição do ocorrido:</label>
              <textarea
                value={pnpForm.descricao}
                onChange={e => setPnpForm({ ...pnpForm, descricao: e.target.value })}
                rows={3}
                className="input text-sm w-full mt-1"
                placeholder="Descreva o que aconteceu..."
              />
            </div>
            <button onClick={() => enviarPNP(pnpModal)} className="btn-primary text-xs">Enviar recusa</button>
          </div>
        </div>
      )}

      {relevantes.length === 0 ? (
        <div className="card text-center py-6 text-slate-500 text-sm">
          {t('protocolos.noProtocolActive')}
        </div>
      ) : relevantes.map(p => (
        <div key={p.id} className="card p-3">
          <div
            className="flex items-center justify-between gap-3 cursor-pointer"
            onClick={() => toggleExpand(p.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                #{p.id} — {p.tipo} • {p.vaga_titulo || `Vaga ${p.id_vaga}`}
              </p>
              <p className="text-xs text-slate-500">
                {isProfissional && p.contratante_nome && `Contratante: ${p.contratante_nome}`}
                {isContratante && p.profissional_nome && `Profissional: ${p.profissional_nome}`}
                {' • '}
                {new Date(p.criado_em + 'Z').toLocaleDateString('pt-BR')}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Valor: <strong>{BRL(p.valor_plantao_centavos)}</strong> + taxa {BRL(p.valor_taxa_centavos)} = <strong>{BRL(p.valor_total_centavos)}</strong>
              </p>
              {p.checkin_profissional_em && (
                <p className="text-xs text-emerald-600 mt-1">
                  📍 {t('protocolos.checkedInAt')}: {new Date(p.checkin_profissional_em + 'Z').toLocaleString('pt-BR')}
                  {p.checkin_contratante_em && ` · ✓ ${t('protocolos.presenceConfirmedAt')}`}
                </p>
              )}
            </div>
            <span className={`${badgeDe(p).classe} text-[10px]`}>
              {badgeDe(p).label}
            </span>
          </div>

          {/* Ações contextuais */}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Profissional: PCM enviado → Aceitar / Recusar */}
            {isProfissional && p.tipo === 'PCM' && p.status === 'enviado' && (
              <>
                <button onClick={() => aceitarPCM(p.id)} className="btn-primary text-xs">{t('protocolos.acceptMatching')}</button>
                <button onClick={() => recusarPCM(p.id)} className="btn-ghost text-xs">Recusar</button>
                {p.expira_em && (
                  <span className="text-[10px] text-slate-500 self-center ml-2">
                    Expira em {new Date(p.expira_em + 'Z').toLocaleString('pt-BR')}
                  </span>
                )}
              </>
            )}

            {/* Contratante: PDC enviado → Pagar */}
            {isContratante && p.tipo === 'PDC' && p.status === 'enviado' && (
              <button onClick={() => pagarPDC(p.id)} className="btn-primary text-xs">
                💰 Pagar custódia ({BRL(p.valor_total_centavos)})
              </button>
            )}
            {isContratante && p.tipo === 'PDC' && p.status === 'enviado' && p.expira_em && (
              <span className="text-[10px] text-slate-500 self-center ml-2">
                ⏰ Expira em {new Date(p.expira_em + 'Z').toLocaleString('pt-BR')}
              </span>
            )}

            {/* ── Check-in / Check-out ─────────────────────────────────── */}
            {/* Profissional: chegou ao plantão? Ainda não fez check-in. */}
            {isProfissional && p.tipo === 'PDC' && p.status === 'checkout_pendente' && !p.checkin_profissional_em && (
              <button onClick={() => fazerCheckin(p.id)} disabled={buscandoGeo} className="btn-primary text-xs">
                📍 {t('protocolos.checkIn')}
              </button>
            )}

            {/* Profissional: já fez check-in → pode finalizar o plantão. */}
            {isProfissional && p.tipo === 'PDC' && p.status === 'checkout_pendente' && p.checkin_profissional_em && (
              <button onClick={() => abrirCheckout(p.id)} className="btn-primary text-xs">
                {t('protocolos.checkOut')}
              </button>
            )}

            {/* Contratante: o profissional já chegou → confirmar presença. */}
            {isContratante && p.tipo === 'PDC' && p.status === 'checkout_pendente'
              && p.checkin_profissional_em && !p.checkin_contratante_em && (
              <button onClick={() => fazerCheckin(p.id)} disabled={buscandoGeo} className="btn-ghost text-xs">
                📍 {t('protocolos.checkInConfirm')}
              </button>
            )}

            {/* Contratante: o profissional já finalizou → confirmar execução e avaliar. */}
            {isContratante && p.tipo === 'PDC' && p.status === 'checkout_profissional' && (
              <button onClick={() => abrirCheckout(p.id)} className="btn-primary text-xs">
                ✓ {t('protocolos.checkOut')}
              </button>
            )}

            {/* Contratante: aguardando o profissional fechar o plantão. */}
            {isContratante && p.tipo === 'PDC' && p.status === 'checkout_pendente' && !p.checkin_profissional_em && (
              <span className="text-xs text-slate-500 self-center">
                ⏳ {t('protocolos.awaitingCheckIn')}
              </span>
            )}

            {/* Profissional: check-in feito, aguardando o contratante. */}
            {isProfissional && p.tipo === 'PDC' && p.status === 'checkout_profissional' && (
              <span className="text-xs text-slate-500 self-center">
                ✓ {t('protocolos.waitOther')}
              </span>
            )}

            {/* Contratante: PDC em checkout_profissional → pode recusar (PNP) */}
            {isContratante && p.tipo === 'PDC' && ['checkout_profissional', 'checkout_pendente', 'checkout_completo'].includes(p.status) && (
              <button onClick={() => abrirPNP(p.id)} className="btn-ghost text-xs text-rose-600">
                ⚠️ Recusar pagamento (PNP)
              </button>
            )}

            {/* Profissional: PDC em checkout_completo → "aguardando liberação" */}
            {isProfissional && p.tipo === 'PDC' && p.status === 'checkout_completo' && (
              <span className="text-xs text-emerald-600 self-center">
                ✓ Checkout completo. Liberação em até 72h (CGPP).
              </span>
            )}

            {/* Liberado */}
            {p.tipo === 'PDC' && p.status === 'liberado' && (
              <span className="text-xs text-emerald-700 font-semibold self-center">
                💰 Pagamento liberado!
              </span>
            )}
            {p.tipo === 'PDC' && p.status === 'liberado_parcial' && (
              <span className="text-xs text-emerald-700 font-semibold self-center">
                💰 Pagamento parcial liberado
              </span>
            )}

            {/* Em análise PNP */}
            {p.status === 'em_analise_pnp' && (
              <span className="text-xs text-amber-600 font-semibold self-center">
                ⚖️ Em análise administrativa
              </span>
            )}
            {p.status === 'reembolsado' && (
              <span className="text-xs text-slate-500 self-center">💰 Reembolsado</span>
            )}
            {p.status === 'expirado' && (
              <span className="text-xs text-slate-500 self-center">⏰ Expirado</span>
            )}
          </div>

          {/* Detalhes expandíveis */}
          {expanded === p.id && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
              {/* Info do plantão (apenas se pago — intermediação) */}
              {p.tipo === 'PDC' && ['em_custodia', 'checkout_pendente', 'checkout_profissional', 'checkout_contratante', 'checkout_completo', 'liberado', 'liberado_parcial'].includes(p.status) && (
                <div className="bg-serenity-50 p-2 rounded text-xs">
                  <p className="font-semibold text-serenity-700 mb-1">📋 Plantão</p>
                  <p className="text-slate-600">
                    {p.vaga_regiao || '—'} • {p.vaga_horario || '—'} • {p.vaga_escala || '—'}
                  </p>
                </div>
              )}

              {/* Check-ins (chegada ao plantão) */}
              {checkins.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1">{t('protocolos.checkinsTitle')}:</p>
                  {checkins.map(ci => (
                    <div key={ci.id} className="text-xs text-slate-600 ml-2">
                      • {ci.tipo_user === 'profissional' ? (p.profissional_nome || 'Profissional') : (p.contratante_nome || 'Contratante')}
                      <span className="text-slate-400 ml-1">({new Date(ci.confirmado_em + 'Z').toLocaleString('pt-BR')})</span>
                      {ci.implicito === 1 && (
                        <span className="text-amber-600 ml-1">· check-in implícito</span>
                      )}
                      {ci.latitude != null && ci.longitude != null && (
                        <span className="text-slate-400 ml-1">· 📍 {ci.latitude.toFixed(4)}, {ci.longitude.toFixed(4)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Checkouts */}
              {checkouts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1">{t('protocolos.checkoutsTitle')}:</p>
                  {checkouts.map(c => (
                    <div key={c.id} className="text-xs text-slate-600 ml-2">
                      • {c.tipo_user}: nota {c.nota || '—'}/5
                      {c.comentario && ` — "${c.comentario}"`}
                      <span className="text-slate-400 ml-1">({new Date(c.confirmado_em + 'Z').toLocaleString('pt-BR')})</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Histórico de transições */}
              {historico.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1">Histórico (auditoria):</p>
                  <div className="text-xs text-slate-600 max-h-32 overflow-y-auto">
                    {historico.map(h => (
                      <div key={h.id} className="ml-2 flex items-start gap-1">
                        <span className="text-slate-400">•</span>
                        <div className="flex-1">
                          <span className="font-mono text-[10px]">{h.status_anterior || '∅'} → {h.status_novo}</span>
                          {h.motivo && <span className="text-slate-500"> — {h.motivo}</span>}
                          <span className="text-slate-400 ml-1">({new Date(h.criado_em + 'Z').toLocaleString('pt-BR')})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {p.motivo_rejeicao && (
                <p className="text-xs text-rose-600">Motivo: {p.motivo_rejeicao}</p>
              )}
              {p.observacoes && (
                <p className="text-xs text-slate-500 italic">Obs: {p.observacoes}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
