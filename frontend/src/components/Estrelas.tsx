interface Props {
  value: number;          // 0-5
  total?: number;         // número de avaliações (exibido se fornecido)
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;   // mostra o número (4.7) ao lado
  interactive?: boolean;  // permite clicar para avaliar
  onChange?: (v: number) => void;
}

const SIZE_CLASS = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl'
};

export default function Estrelas({
  value, total, size = 'md', showNumber = true, interactive = false, onChange
}: Props) {
  const v = Math.round(value * 2) / 2; // arredonda pra .0 ou .5

  return (
    <div className="inline-flex items-center gap-1">
      <div className={`flex ${SIZE_CLASS[size]} ${interactive ? 'gap-0.5' : ''}`}>
        {[1, 2, 3, 4, 5].map((n) => {
          const cheia = v >= n;
          const meia = v >= n - 0.5 && v < n;
          return (
            <button
              key={n}
              type="button"
              disabled={!interactive}
              onClick={() => interactive && onChange?.(n)}
              className={`${interactive ? 'cursor-pointer hover:scale-110 transition' : 'cursor-default'} ${
                interactive ? 'px-0.5' : ''
              }`}
              aria-label={`${n} estrelas`}
            >
              {cheia ? '★' : meia ? '⯨' : '☆'}
            </button>
          );
        })}
      </div>
      {showNumber && (
        <span className="text-sm font-semibold text-slate-700 ml-1">
          {value > 0 ? value.toFixed(1) : '—'}
        </span>
      )}
      {typeof total === 'number' && (
        <span className="text-xs text-slate-400 ml-1">
          ({total} {total === 1 ? 'avaliação' : 'avaliações'})
        </span>
      )}
    </div>
  );
}
