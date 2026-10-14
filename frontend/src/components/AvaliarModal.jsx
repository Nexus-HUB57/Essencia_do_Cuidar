import { useEffect, useState } from 'react';
import { api } from '../api.js';
import StarRating from './StarRating.jsx';

/**
 * Modal de avaliação. Aberto pelo pai.
 * props:
 *   open: boolean
 *   onClose(): fecha
 *   onSuccess(): chamado após salvar (pai recarrega dados)
 *   pendente: { id_vaga, id_profissional, profissional_nome, servico_descricao, regiao }
 */
export default function AvaliarModal({ open, onClose, onSuccess, pendente }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (open) { setNota(0); setComentario(''); setErro(''); }
  }, [open, pendente?.id_vaga, pendente?.id_profissional]);

  if (!open || !pendente) return null;

  async function salvar(e) {
    e.preventDefault();
    if (nota < 1) { setErro('Escolha pelo menos 1 estrela.'); return; }
    setSaving(true); setErro('');
    try {
      await api.criarAvaliacao({
        id_vaga: pendente.id_vaga,
        id_profissional: pendente.id_profissional,
        nota,
        comentario: comentario.trim() || undefined,
      });
      onSuccess && onSuccess();
      onClose();
    } catch (e2) {
      setErro(e2.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Avaliar profissional</h2>
            <p className="mt-1 text-sm text-brand-slate">
              Sua avaliação ajuda outras famílias a contratar com mais confiança.
            </p>
          </div>
          <button onClick={onClose} className="text-brand-slate hover:text-brand-ink" aria-label="Fechar">✕</button>
        </div>

        <div className="mt-4 rounded-xl bg-brand-mist p-3 text-sm">
          <p className="font-medium text-brand-ink">{pendente.profissional_nome}</p>
          <p className="text-xs text-brand-slate">{pendente.servico_descricao}</p>
          {pendente.regiao && <p className="text-xs text-brand-slate">📍 {pendente.regiao}</p>}
        </div>

        <form onSubmit={salvar} className="mt-4 space-y-4">
          <div>
            <label className="label">Sua nota</label>
            <div className="flex items-center gap-3">
              <StarRating value={nota} onChange={setNota} size="lg" />
              <span className="text-sm text-brand-slate">
                {nota ? labelDaNota(nota) : 'Selecione'}
              </span>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="avaliacao-comentario">Comentário (opcional)</label>
            <textarea
              id="avaliacao-comentario"
              className="input min-h-[90px]"
              placeholder="Conte como foi a experiência (até 1000 caracteres)"
              maxLength={1000}
              value={comentario}
              onChange={e => setComentario(e.target.value)}
            />
            <p className="mt-1 text-xs text-brand-slate text-right">{comentario.length}/1000</p>
          </div>

          {erro && <p className="text-sm text-rose-600">{erro}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost" disabled={saving}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving || !nota}>
              {saving ? 'Enviando…' : 'Enviar avaliação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function labelDaNota(n) {
  return ['Péssimo', 'Ruim', 'Ok', 'Bom', 'Excelente'][n - 1] || '';
}
