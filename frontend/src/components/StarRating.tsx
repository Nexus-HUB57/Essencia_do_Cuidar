/**
 * Star rating display + input component.
 *
 * Modos:
 *  - `mode="display"`: read-only, mostra estrelas preenchidas + número (opcional)
 *  - `mode="input"`: clicável, com hover, chama onChange(nota)
 */
import { useState } from 'react';

interface Props {
  value: number;                          // 0-5
  mode?: 'display' | 'input';
  onChange?: (nota: number) => void;
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;                   // exibe "4.5" ao lado
  count?: number;                         // total de ratings (badge)
  className?: string;
}

const SIZE_PX: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl'
};

export default function StarRating({
  value,
  mode = 'display',
  onChange,
  size = 'md',
  showNumber = true,
  count,
  className = ''
}: Props) {
  const [hover, setHover] = useState(0);
  const display = mode === 'input' && hover ? hover : value;
  const sizeCls = SIZE_PX[size];

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        className={`inline-flex ${sizeCls}`}
        onMouseLeave={() => mode === 'input' && setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = display >= n;
          const half = !filled && display >= n - 0.5;
          return (
            <button
              type="button"
              key={n}
              disabled={mode !== 'input'}
              onMouseEnter={() => mode === 'input' && setHover(n)}
              onClick={() => mode === 'input' && onChange?.(n)}
              className={[
                'leading-none transition',
                mode === 'input' ? 'cursor-pointer hover:scale-110' : 'cursor-default',
                filled ? 'text-amber-400' : half ? 'text-amber-300' : 'text-slate-300'
              ].join(' ')}
              aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            >
              {filled || half ? '★' : '☆'}
            </button>
          );
        })}
      </span>
      {showNumber && (
        <span className="text-sm font-semibold text-slate-700">
          {value > 0 ? value.toFixed(1) : '—'}
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span className="text-xs text-slate-500">({count})</span>
      )}
    </span>
  );
}
