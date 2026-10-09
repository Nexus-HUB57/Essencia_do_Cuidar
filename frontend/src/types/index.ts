export type TipoUsuario = 'profissional' | 'contratante';

export interface User {
  id: number;
  tipo_usuario: TipoUsuario;
  nome: string;
  email: string;
  telefone?: string | null;
}

export interface ProfissionalDetalhes {
  id?: number;
  id_user: number;
  diploma_url?: string | null;
  diploma_nome_original?: string | null;
  diploma_verificado: 0 | 1;
  registro_conselho?: string | null;
  tipo_registro?: string | null;
  registro_verificado: 0 | 1;
  especialidades: string[];
  disponibilidade: string[];
  bio?: string | null;
}

export interface Vaga {
  id: number;
  id_contratante: number;
  paciente_sexo?: 'M' | 'F' | 'Outro' | null;
  paciente_idade?: number | null;
  paciente_diagnostico?: string | null;
  complexidade: 'baixa' | 'media';
  servico_descricao: string;
  profissional_desejado: string;
  jornada_horario?: string | null;
  jornada_escala?: string | null;
  tipo_contrato?: 'PJ' | 'CLT' | null;
  remuneracao_tipo?: 'plantao' | 'hora' | null;
  remuneracao_valor?: number | null;
  regiao?: string | null;
  status: 'ativa' | 'pausada' | 'fechada';
  criado_em: string;
  contratante_nome?: string;
  total_candidatos?: number;
}

export interface Candidatura {
  id: number;
  id_vaga: number;
  id_profissional: number;
  mensagem?: string | null;
  status_candidatura: 'pendente' | 'visualizada' | 'aceita' | 'recusada';
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
