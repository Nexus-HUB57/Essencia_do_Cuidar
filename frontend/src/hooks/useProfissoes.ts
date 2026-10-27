import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import type { Profissao, ProfissaoId } from '../types';

/**
 * hooks/useProfissoes.ts
 *
 * Carrega a taxonomia canônica de profissões do backend
 * (`GET /api/profissionais/profissoes`) para que o seletor do cadastro e
 * da edição de perfil gravem sempre um id que o motor de matching reconhece.
 *
 * O rótulo exibido vem do i18n (`matching.profissoes.<id>`), com o `rotulo`
 * do backend como fallback.
 */
export function useProfissoes() {
  const { t } = useTranslation();
  const [profissoes, setProfissoes] = useState<Profissao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data } = await api.get('/profissionais/profissoes');
        if (!cancelado) setProfissoes(data.profissoes || []);
      } catch {
        // Falha de rede não pode travar o cadastro — o seletor fica vazio e
        // o usuário ainda consegue enviar o resto do formulário.
        if (!cancelado) setProfissoes([]);
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
    label: rotulo(p.id, p.rotulo)
  }));

  return { profissoes, opcoes, loading, rotulo };
}

export default useProfissoes;
