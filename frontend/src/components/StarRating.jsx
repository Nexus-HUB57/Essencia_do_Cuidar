import { useState } from 'react';

/**
 * StarRating
 * - display (readOnly=true): mostra estrelas "preenchidas" até a nota. Aceita size.
 * - input (readOnly=false):    cinco estrelas clicáveis. Controlado (value + onChange)
 *   ou não-controlado (defaultValue + onChange).
 *
 * props:
 *   value: 0-5 (quando controlado)
 *   defaultValue: 0-5
 *   onChange(nota)
 *   readOnly: boolean
 *   size: 'sm' | 'md' | 'lg'  (default 'md')
 *   showNumber: mostra "4.5" ao lado (default false)
 *   count: número total de reviews (opcional, ao lado)
 *   className: classes extras
 */
export default function StarRating({
  value, defaultValue = 0, onChange,
  readOnly = false, size = 'md', showNumber = false, count, className = '',
}) {
  const isControlled = value != null;
  const [internal, setInternal] = useState(defaultValue);
  const [hover, setHover] = useState(0);
  const current = isControlled ? value : internal;

  const dim = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';

  function set(n) {
    if (readOnly) return;
    if (!isControlled) setInternal(n);
    onChange && onChange(n);
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} role="img" aria-label={`Nota ${current} de 5`}>
      <span className={`inline-flex ${readOnly ? '' : 'gap-0.5'}`}>
        {[1, 2, 3, 4, 5].map(n => {
          const filled = (hover || current) >= n;
          return (
            <button
              key={n}
              type="button"
              tabIndex={readOnly ? -1 : 0}
              disabled={readOnly}
              onMouseEnter={() => !readOnly && setHover(n)}
              onMouseLeave={() => !readOnly && setHover(0)}
              onClick={() => set(n)}
              aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
              className={`${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'} ${dim} p-0 bg-transparent border-0 leading-none`}
            >
              <Star filled={filled} />
            </button>
          );
        })}
      </span>
      {showNumber && (
        <span className="text-sm font-semibold text-brand-ink">
          {Number(current || 0).toFixed(1)}
        </span>
      )}
      {typeof count === 'number' && (
        <span className="text-xs text-brand-slate">({count})</span>
      )}
    </span>
  );
}

function Star({ filled }) {
  return (
    <svg viewBox="0 0 20 20" className={`${filled ? 'text-amber-400' : 'text-slate-300'}`} fill="currentColor" aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.447a1 1 0 00-.364 1.118l1.287 3.957c.299.921-.756 1.688-1.539 1.118l-3.366-2.447a1 1 0 00-1.176 0l-3.366 2.447c-.783.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.067 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
    </svg>
  );
}
