import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import type { Profissao, ProfissaoId } from '../types';

/**
 * hooks/useProfissoes.ts
 *
 * Carrega a taxonomia canônica de profissões do backend
 * (`GET /api/profissoes`) para que o seletor do cadastro e da edição de
 * perfil gravem sempre um id que o motor de matching reconhece.
 *
 * O rótulo exibido vem do i18n (`matching.profissoes.<id>`), com o `label`
 * do backend como fallback.
 *
 * A lista local abaixo é usada só se o endpoint não responder (dev sem
 * backend) — o id continua sendo o canônico, então nada quebra.
 */
const FALLBACK: Profissao[] = [
  { id: 'cuidador_idosos', label: 'Cuidador de Idosos', conselho: null, sinonimos: ['cuidador', 'cuidadora', 'acompanhante'] },
  { id: 'enfermeiro', label: 'Enfermeiro(a)', conselho: 'COREN', sinonimos: ['enfermeiro', 'enfermeira'] },
  { id: 'tecnico_enfermagem', label: 'Técnico de Enfermagem', conselho: 'COREN', sinonimos: ['tecnico_enfermagem'] },
  { id: 'fisioterapeuta', label: 'Fisioterapeuta', conselho: 'CREFITO', sinonimos: ['fisioterapeuta', 'fisio'] },
  { id: 'psicologo', label: 'Psicólogo(a)', conselho: 'CRP', sinonimos: ['psicologo', 'psicologa'] },
  { id: 'terapeuta_ocupacional', label: 'Terapeuta Ocupacional', conselho: 'CREFITO', sinonimos: ['terapeuta ocupacional'] },
  { id: 'nutricionista', label: 'Nutricionista', conselho: 'CRN', sinonimos: ['nutricionista'] },
  { id: 'medico', label: 'Médico(a)', conselho: 'CRM', sinonimos: ['medico', 'medica'] },
  { id: 'fonoaudiologo', label: 'Fonoaudiólogo(a)', conselho: 'CRP', sinonimos: ['fonoaudiologo'] },
  { id: 'dentista', label: 'Dentista', conselho: 'CRO', sinonimos: ['dentista'] }
];

export function useProfissoes() {
  const { t } = useTranslation();
  const [profissoes, setProfissoes] = useState<Profissao[]>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data } = await api.get('/profissoes');
        if (!cancelado && data.profissoes?.length) setProfissoes(data.profissoes);
      } catch {
        // Falha de rede não pode travar o cadastro — o fallback local serve.
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  /** Rótulo traduzido de uma profissão (fallback: rótulo do backend). */
  const rotulo = (id?: string | null, fallback?: string) => {
    if (!id) return fallback || '';
    const traduzido = t(`matching.profissoes.${id}`);
    return traduzido === `matching.profissoes.${id}` ? (fallback || id) : traduzido;
  };

  /** Opções prontas para um <select>. */
  const opcoes = profissoes.map((p) => ({
    value: p.id as ProfissaoId,
    label: rotulo(p.id, p.label)
  }));

  return { profissoes, opcoes, loading, rotulo };
}

export default useProfissoes;
