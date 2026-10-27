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
 * O endpoint é o mesmo que já servia o autocomplete legado — não existe uma
 * segunda rota de taxonomia, para não haver dois formatos de resposta.
 *
 * O rótulo exibido vem do i18n (`matching.profissoes.<id>`), com o `rotulo`
 * do backend como fallback.
 */

/** UFs válidas — fallback local caso o backend não responda. */
const UFS_FALLBACK = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export function useProfissoes() {
  const { t } = useTranslation();
  const [profissoes, setProfissoes] = useState<Profissao[]>([]);
  const [ufs, setUfs] = useState<string[]>(UFS_FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data } = await api.get('/profissoes');
        if (cancelado) return;
        setProfissoes(data.profissoes || []);
        if (data.ufs?.length) setUfs(data.ufs);
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

  return { profissoes, opcoes, ufs, loading, rotulo };
}

export default useProfissoes;
