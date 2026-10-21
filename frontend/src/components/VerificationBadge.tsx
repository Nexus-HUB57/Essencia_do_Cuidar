import { useTranslation } from 'react-i18next';

export type VerificationStatus =
  | 'pendente'
  | 'verificado_auto'
  | 'verificado_manual'
  | 'rejeitado'
  | 'inativo';

interface Props {
  status: VerificationStatus | null | undefined;
  size?: 'sm' | 'md';
}

/**
 * Selo visual do status de verificação de conselho profissional.
 * Mapeia cada estado para cor + ícone + texto traduzido.
 */
export default function VerificationBadge({ status, size = 'md' }: Props) {
  const { t } = useTranslation();
  const map: Record<VerificationStatus, { labelKey: string; cls: string; icon: string }> = {
    pendente: {
      labelKey: 'verification.status.pending',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: '⏳'
    },
    verificado_auto: {
      labelKey: 'verification.status.verified_auto',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: '✓'
    },
    verificado_manual: {
      labelKey: 'verification.status.verified_manual',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: '✓'
    },
    rejeitado: {
      labelKey: 'verification.status.rejected',
      cls: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: '✕'
    },
    inativo: {
      labelKey: 'verification.status.inactive',
      cls: 'bg-slate-50 text-slate-500 border-slate-200',
      icon: '—'
    }
  };
  const s = (status && map[status]) ? map[status] : map.pendente;
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
