import { useState } from 'react';
import Modal from './Modal';
import StarRating from './StarRating';
import { useToast } from './Toast';
import api, { getErrorMessage } from '../utils/api';

interface Pendente {
  candidatura_id: number;
  vaga_id: number;
  profissional_desejado: string;
  regiao: string | null;
  outro_nome: string;
}

interface Props {
  pendente: Pendente | null;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Modal para registrar avaliação pós-atendimento. Mostra contexto
 * da vaga/candidatura, pede 1-5 estrelas + comentário opcional.
 */
export default function AvaliacaoModal({ pendente, onClose, onSuccess }: Props) {
  const toast = useToast();
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [loading, setLoading] = useState(false);

  if (!pendente) return null;

  async function enviar() {
    if (nota < 1) {
      toast.error('Selecione ao menos 1 estrela');
      return;
    }
    setLoading(true);
    try {
      await api.post('/avaliacoes', {
        id_candidatura: pendente!.candidatura_id,
        nota,
        comentario: comentario.trim() || undefined
      });
      toast.success('Avaliação enviada! Obrigado pelo feedback.');
      setNota(0);
      setComentario('');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={!!pendente} onClose={onClose} title="Avaliar atendimento" size="md">
      <div className="space-y-4">
        <div className="bg-serenity-50 rounded-xl p-3 text-sm">
          <p className="text-slate-500 text-xs">Vaga</p>
          <p className="font-medium text-slate-800">{pendente.profissional_desejado}</p>
          {pendente.regiao && <p className="text-xs text-slate-500 mt-0.5">📍 {pendente.regiao}</p>}
          <p className="text-xs text-slate-500 mt-1">
            Com <strong>{pendente.outro_nome}</strong>
          </p>
        </div>

        <div>
          <label className="label">Sua nota</label>
          <div className="flex items-center gap-2">
            <StarRating value={nota} mode="input" onChange={setNota} size="lg" showNumber={false} />
            {nota > 0 && (
              <span className="text-sm text-slate-600">
                {nota === 5 ? 'Excelente!' : nota === 4 ? 'Muito bom' : nota === 3 ? 'Bom' : nota === 2 ? 'Regular' : 'Ruim'}
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="label">Comentário (opcional)</label>
          <textarea
            className="input min-h-[100px]"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={1000}
            placeholder="Conte como foi a experiência..."
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{comentario.length}/1000</p>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="btn-ghost" disabled={loading}>Cancelar</button>
          <button onClick={enviar} disabled={loading || nota < 1} className="btn-primary">
            {loading ? 'Enviando...' : 'Enviar avaliação'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
