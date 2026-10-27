export type TipoUsuario = "profissional" | "contratante";

// Estado do registro profissional:
//   0 = nao validado (selo cinza, default)
//   1 = validado estruturalmente (selo verde)
//   2 = pendente de analise manual (selo amarelo)
export type RegistroVerificadoEstado = 0 | 1 | 2;

export interface User {
  id: number;
  tipo_usuario: TipoUsuario;
  nome: string;
  email: string;
  telefone?: string | null;
  /**
   * Enviado pelo backend em POST /auth/login e GET /auth/me.
   * SQLite devolve 0|1; Postgres pode devolver boolean — ambos aceitos.
   */
  is_admin?: 0 | 1 | boolean | null;
}

/** Ids canônicos de profissão — espelham `PROFISSOES` em backend/src/services/matching.js */
export type ProfissaoId =
  | "cuidador"
  | "tecnico_enfermagem"
  | "enfermeiro"
  | "fisioterapeuta"
  | "terapeuta_ocupacional"
  | "psicologo"
  | "fonoaudiologo"
  | "nutricionista"
  | "medico"
  | "dentista";

export interface Profissao {
  id: ProfissaoId;
  rotulo: string;
  conselhos: string[];
}

export interface ProfissionalDetalhes {
  id?: number;
  id_user: number;
  diploma_url?: string | null;
  diploma_nome_original?: string | null;
  diploma_verificado: 0 | 1;
  registro_conselho?: string | null;
  tipo_registro?: string | null;
  registro_verificado: RegistroVerificadoEstado;
  registro_verificado_em?: string | null;
  /** Profissão canônica — usada pelo motor de matching. */
  profissao?: ProfissaoId | null;
  /** Região de atuação (texto livre, ex.: "Zona Sul - SP"). */
  regiao?: string | null;
  especialidades: string[];
  disponibilidade: string[];
  bio?: string | null;
}

/**
 * Resposta do endpoint POST /api/profissionais/me/verificar-registro
 */
export interface RegistroVerificacaoResultado {
  verificado: boolean;
  estado: RegistroVerificadoEstado;
  motivo: string;
  selo: string;
  detalhe?: string | null;
}

export interface Vaga {
  id: number;
  id_contratante: number;
  paciente_sexo?: "M" | "F" | "Outro" | null;
  paciente_idade?: number | null;
  paciente_diagnostico?: string | null;
  complexidade: "baixa" | "media";
  servico_descricao: string;
  profissional_desejado: string;
  jornada_horario?: string | null;
  jornada_escala?: string | null;
  tipo_contrato?: "PJ" | "CLT" | null;
  remuneracao_tipo?: "plantao" | "hora" | null;
  remuneracao_valor?: number | null;
  regiao?: string | null;
  status: "ativa" | "pausada" | "fechada";
  criado_em: string;
  contratante_nome?: string;
  total_candidatos?: number;
}

export interface Candidatura {
  id: number;
  id_vaga: number;
  id_profissional: number;
  mensagem?: string | null;
  status_candidatura: "pendente" | "visualizada" | "aceita" | "recusada";
  criado_em: string;
  profissional_desejado?: string;
  complexidade?: string;
  regiao?: string;
  remuneracao_valor?: number;
  remuneracao_tipo?: string;
  vaga_status?: string;
  servico_descricao?: string;
  contratante_nome?: string;
  id_contratante?: number;
}

export interface Mensagem {
  id: number;
  id_remetente: number;
  id_destinatario: number;
  id_vaga?: number | null;
  conteudo: string;
  lida: 0 | 1;
  criado_em: string;
}

export interface Avaliacao {
  id: number;
  id_candidatura: number;
  id_avaliador: number;
  id_avaliado: number;
  avaliador_tipo: "contratante" | "profissional";
  nota: 1 | 2 | 3 | 4 | 5;
  comentario: string | null;
  criado_em: string;
  avaliador_nome?: string;
}

export interface AvaliacaoPendente {
  candidatura_id: number;
  vaga_id: number;
  profissional_desejado: string;
  servico_descricao: string;
  regiao: string | null;
  candidatura_criado_em: string;
  vaga_criado_em: string;
  outro_id: number;
  outro_nome: string;
  registro_conselho?: string | null;
  tipo_registro?: string | null;
}

export interface AvaliacaoStats {
  total: number;
  media: number;
}

export interface Conversa {
  outro_id: number;
  outro_nome: string;
  ultima_mensagem: string;
  ultima_em: string;
  nao_lidas: number;
}

/* ══════════════════════ Sistema de matching ══════════════════════ */

/** Nível de compatibilidade de um match. */
export type MatchingNivel = "alto" | "medio" | "baixo";

/**
 * Motivo estruturado do matching.
 * `codigo` é estável e traduzido pelo frontend via `matching.reasons.<codigo>`.
 * `detalhe` carrega os parâmetros de interpolação.
 */
export interface MatchingMotivo {
  codigo: string;
  peso: number;
  pontos: number | null;
  detalhe: {
    profissao?: string;
    turnos?: number;
    total?: number;
    media?: number;
    concluidas?: number;
    especialidade?: string;
    regiao?: string;
    regiaoVaga?: string;
    regiaoProf?: string;
  };
}

export interface MatchingProfissionalRecomendado {
  id: number;
  nome: string;
  telefone?: string | null;
  profissao?: ProfissaoId | null;
  regiao?: string | null;
  registro_conselho?: string | null;
  tipo_registro?: string | null;
  registro_verificado: RegistroVerificadoEstado;
  diploma_verificado: 0 | 1;
  especialidades: string[];
  disponibilidade: string[];
  bio?: string | null;
  media_avaliacao: number;
  total_avaliacoes: number;
}

export interface MatchingVagaRecomendada {
  id: number;
  profissional_desejado: string;
  complexidade: "baixa" | "media";
  regiao?: string | null;
  remuneracao_valor?: number | null;
  remuneracao_tipo?: "plantao" | "hora" | null;
  tipo_contrato?: "PJ" | "CLT" | null;
  servico_descricao: string;
  jornada_horario?: string | null;
  jornada_escala?: string | null;
  criado_em: string;
}

export interface MatchingProfissionaisResponse {
  vaga_id: number;
  total: number;
  pesos: Record<string, number>;
  recomendacoes: Array<{
    profissional: MatchingProfissionalRecomendado;
    score: number;
    nivel: MatchingNivel;
    motivos: string[];
    motivosDetalhados: MatchingMotivo[];
  }>;
}

export interface MatchingVagasResponse {
  profissional_id: number;
  total: number;
  pesos: Record<string, number>;
  recomendacoes: Array<{
    vaga: MatchingVagaRecomendada;
    score: number;
    nivel: MatchingNivel;
    motivos: string[];
    motivosDetalhados: MatchingMotivo[];
  }>;
}
