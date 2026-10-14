import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  steps: { label: string; sublabel?: string }[];
  current: number;          // índice do step atual
  children: ReactNode;
}

export default function Wizard({ steps, current, children }: Props) {
  const { t } = useTranslation();
  return (
    <div>
      {/* Header do wizard */}
      <ol className="flex items-center w-full mb-8">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={i}
              className={`flex items-center ${i < steps.length - 1 ? 'w-full' : ''}`}
            >
              <div className="flex flex-col items-center min-w-0">
                <span
                  className={[
                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all',
                    done
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : active
                        ? 'bg-serenity-500 border-serenity-500 text-white shadow-soft'
                        : 'bg-white border-slate-200 text-slate-400'
                  ].join(' ')}
                >
                  {done ? t('wizard.done') : i + 1}
                </span>
                <span className={`mt-1.5 text-[11px] font-medium text-center ${active ? 'text-serenity-600' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mb-5 transition-all ${
                    done ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
      {/* Conteúdo do step atual */}
      <div className="fade-in">{children}</div>
    </div>
  );
}
