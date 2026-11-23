/**
 * Feature 3 — Modal de pagamento.
 *
 * Usa o caminho canônico de custódia: o `POST /api/pagamentos` delega ao
 * protocolo (PDC) quando existe, de modo que o dinheiro entre sempre pela
 * custódia — que é o que habilita check-in/check-out e a liberação do
 * pagamento ao profissional.
 *
 * Mostra o QR Code Pix (em mock, confirma na hora) e permite confirmar o
 * pagamento.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import { getErrorMessage } from '../context/AuthContext';

interface Props {
  idVaga: number;
  onClose: () => void;
  onPaid?: () => void;
}

interface RespostaPagamento {
  via?: 'protocolo' | 'stripe';
  pix_flow?: boolean;
  protocolo_id?: number;
  payment_id?: string;
  txid?: string;
  qr_code_base64?: string;
  qr_code_texto?: string;
  pix_qr_code?: string;
  pix_txid?: string;
  valor_total_centavos?: number;
  valor_profissional_centavos?: number;
  pix_flow_ativo?: boolean;
  mensagem?: string;
  pagamento?: { id: number; status: string; valor_centavos: number };
}

export default function PaymentModal({ idVaga, onClose, onPaid }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RespostaPagamento | null>(null);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<{ mock: boolean; platform_fee_pct: number } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.get('/pagamentos/config');
        setConfig(cfg.data);
        const { data: d } = await api.post('/pagamentos', { id_vaga: idVaga, metodo: 'pix' });
        setData(d);
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [idVaga]);

  /**
   * Confirma o pagamento. O caminho da custódia usa `confirmar-pix`
   * (consulta o Mercado Pago); o caminho legado usa `/pagamentos/:id/confirmar`.
   */
  async function confirmar() {
    if (!data) return;
    setConfirming(true);
    try {
      if (data.via === 'protocolo' && data.protocolo_id) {
        await api.post(`/protocolos/${data.protocolo_id}/confirmar-pix`);
      } else if (data.pagamento?.id) {
        await api.post(`/pagamentos/${data.pagamento.id}/confirmar`);
      }
      onPaid?.();
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setConfirming(false);
    }
  }

  const qrCode = data?.qr_code_base64 || data?.pix_qr_code;
  const txid = data?.txid || data?.pix_txid;
  const valorCentavos = data?.valor_total_centavos ?? data?.pagamento?.valor_centavos ?? 0;
  const precisaConfirmar = data?.pix_flow === true || data?.pagamento?.status === 'pendente';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-2xl shadow-card w-full sm:max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('pagamento.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        {config?.mock && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 rounded-lg mb-3">
            ⚠️ {t('pagamento.mockMode')} — {config.platform_fee_pct}% fica com a plataforma
          </div>
        )}

        {loading && <p className="text-center text-slate-400 py-8">{t('common.loading')}</p>}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm mb-3">{error}</div>
        )}

        {data && (
          <>
            {data.via === 'protocolo' && (
              <div className="bg-serenity-50 border border-serenity-200 text-serenity-700 text-xs p-2 rounded-lg mb-3">
                🔒 {t('pagamento.custodyNotice')}
              </div>
            )}

            {data.pix_flow === true && qrCode ? (
              <p className="text-sm text-slate-500 mb-2">{t('pagamento.scanQrCode')}</p>
            ) : null}

            {qrCode?.startsWith('data:image') ? (
              <div className="bg-slate-100 rounded-xl p-3 flex items-center justify-center">
                <img src={qrCode} alt="QR Code Pix" className="w-48 h-48 bg-white object-contain" />
              </div>
            ) : null}

            <div className="mt-3 text-xs space-y-1">
              {txid && (
                <p><span className="text-slate-500">{t('pagamento.txid')}:</span> <span className="font-mono break-all">{txid}</span></p>
              )}
              <p><span className="text-slate-500">{t('pagamento.amount')}:</span> R$ {(valorCentavos / 100).toFixed(2)}</p>
              {data.valor_profissional_centavos != null && (
                <p><span className="text-slate-500">Profissional recebe:</span> R$ {(data.valor_profissional_centavos / 100).toFixed(2)}</p>
              )}
            </div>

            {precisaConfirmar && (
              <button onClick={confirmar} disabled={confirming}
                className="btn-primary w-full mt-4">
                {confirming ? t('common.loading') : t('pagamento.confirmMock')}
              </button>
            )}

            {data.pix_flow !== true && data.pagamento?.status === 'pago' && (
              <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm text-center">
                ✓ {t('pagamento.paid')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
