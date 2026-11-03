/**
 * Feature 3 — Onboarding Stripe Connect (mock em dev).
 * Mostra status da conta Connect do profissional e link para onboarding.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import { getErrorMessage } from '../context/AuthContext';

export default function OnboardingConnectModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/pagamentos/connect/status');
      setStatus(data);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  }

  async function onboarding() {
    try {
      const { data } = await api.post('/pagamentos/connect/onboarding');
      // Em mock, é só um link; em prod, é o Stripe-hosted onboarding
      window.open(data.url, '_blank');
      // Re-checar status após alguns segundos (em mock, sempre retorna ok)
      setTimeout(load, 2000);
    } catch (e) { alert(getErrorMessage(e)); }
  }

  const connect = status?.connect;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-2xl shadow-card w-full sm:max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Stripe Connect</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        {status?.mock && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 rounded-lg mb-3">
            ⚠️ Stripe em modo mock — fluxos simulados
          </div>
        )}

        {loading && <p className="text-center text-slate-400 py-4">{t('common.loading')}</p>}

        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">{error}</div>}

        {connect && (
          <>
            <p className="text-xs text-slate-500 mb-2">Conta: <span className="font-mono">{connect.stripe_account_id}</span></p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Detalhes submetidos</span>
                <span className={connect.detalhes_submetidos ? 'text-emerald-600' : 'text-amber-600'}>
                  {connect.detalhes_submetidos ? '✓' : 'pendente'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Pagamentos habilitados</span>
                <span className={connect.charges_enabled ? 'text-emerald-600' : 'text-amber-600'}>
                  {connect.charges_enabled ? '✓' : 'pendente'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Repasses habilitados</span>
                <span className={connect.payouts_enabled ? 'text-emerald-600' : 'text-amber-600'}>
                  {connect.payouts_enabled ? '✓' : 'pendente'}
                </span>
              </div>
            </div>
            <button onClick={onboarding} className="btn-primary w-full mt-4">
              {connect.detalhes_submetidos ? 'Reabrir onboarding' : 'Completar onboarding'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
