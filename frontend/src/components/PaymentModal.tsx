/**
 * Feature 3 — Modal de pagamento.
 * Mostra o QR Code Pix (em mock, mostra um placeholder) e permite
 * confirmar pagamento (apenas em modo mock).
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

export default function PaymentModal({ idVaga, onClose, onPaid }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<{ mock: boolean; platform_fee_pct: number } | null>(null);

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

  async function confirmar() {
    if (!data?.pagamento?.id) return;
    try {
      const { data: d } = await api.post(`/pagamentos/${data.pagamento.id}/confirmar`);
      if (d.pagamento.status === 'pago') {
        onPaid?.();
        onClose();
      }
    } catch (e) {
      alert(getErrorMessage(e));
    }
  }

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
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">{error}</div>
        )}

        {data && (
          <>
            <p className="text-sm text-slate-500 mb-2">{t('pagamento.scanQrCode')}</p>
            {data.pix_qr_code?.startsWith('data:image') ? (
              <div className="bg-slate-100 rounded-xl p-3 flex items-center justify-center">
                <div className="w-48 h-48 bg-white flex items-center justify-center text-slate-300 text-xs border">
                  [QR Code mock]
                </div>
              </div>
            ) : null}
            <div className="mt-3 text-xs space-y-1">
              <p><span className="text-slate-500">{t('pagamento.txid')}:</span> <span className="font-mono">{data.pix_txid}</span></p>
              <p><span className="text-slate-500">{t('pagamento.amount')}:</span> R$ {(data.pagamento.valor_centavos / 100).toFixed(2)}</p>
              <p><span className="text-slate-500">Profissional recebe:</span> R$ {(data.valor_profissional_centavos / 100).toFixed(2)}</p>
            </div>

            {config?.mock && data.pagamento.status === 'pendente' && (
              <button onClick={confirmar}
                className="btn-primary w-full mt-4">
                {t('pagamento.confirmMock')}
              </button>
            )}

            {data.pagamento.status === 'pago' && (
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
