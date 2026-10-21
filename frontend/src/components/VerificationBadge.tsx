import { useTranslation } from 'react-i18next';

/**
 * Selo visual do status de verificação de conselho profissional.
 *
 * Vocabulário principal (tabela `verificacao_registros`, ver backend/src/db/sqlite.js):
 *   'pendente' | 'aprovado' | 'rejeitado'
 *
 * Estados estendidos de `conselhos/` (verificação automática best-effort) também
 * são aceitos para uso futuro — mas o fluxo atual do admin grava os 3 acima.
 */
export type VerificationStatus =
  | 'pendente'
  | 'aprovado'
  | 'rejeitado'
  // estendidos (conselhos/) — mapeados para os mesmos visuais
  | 'verificado_auto'
  | 'verificado_manual'
  | 'inativo';

interface Props {
  status: VerificationStatus | null | undefined;
  size?: 'sm' | 'md';
}

export default function VerificationBadge({ status, size = 'md' }: Props) {
  const { t } = useTranslation();

  const map: Record<VerificationStatus, { labelKey: string; cls: string; icon: string }> = {
    pendente: {
      labelKey: 'verification.status.pending',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: '⏳'
    },
    // status do fluxo atual do admin
    aprovado: {
      labelKey: 'verification.status.approved',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: '✓'
    },
    rejeitado: {
      labelKey: 'verification.status.rejected',
      cls: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: '✕'
    },
    // estendidos (conselhos/) — mesmos visuais do fluxo principal
    verificado_auto: {
      labelKey: 'verification.status.approved',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: '✓'
    },
    verificado_manual: {
      labelKey: 'verification.status.approved',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: '✓'
    },
    inativo: {
      labelKey: 'verification.status.inactive',
      cls: 'bg-slate-50 text-slate-500 border-slate-200',
      icon: '—'
    }
  };

  const s = status && map[status] ? map[status] : map.pendente;
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${pad} ${s.cls}`}
      title={t(s.labelKey)}
    >
      <span aria-hidden="true">{s.icon}</span>
      <span>{t(s.labelKey)}</span>
    </span>
  );
}