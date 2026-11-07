/**
 * RAG — Indexação e base de conhecimento.
 *
 * Fontes indexadas:
 *   - vagas        (dinâmico, do banco)
 *   - profissionais(dinâmico, do banco)
 *   - conhecimento (estático: regras do negócio, FAQ, conselhos)
 */
import db from '../../db/driver.js';
import { embedMany, chunkText, initEmbeddings, embeddingInfo } from './embeddings.js';

/**
 * Base de conhecimento estática — regras de negócio, FAQ, explicação dos
 * conselhos. É o que permite responder perguntas sobre como a plataforma
 * funciona, mesmo sem LLM configurado.
 */
export const CONHECIMENTO = [
  {
    doc_id: 'kb-regras-complexidade',
    tipo: 'conhecimento',
    titulo: 'Regra de complexidade (baixa e média apenas)',
    fonte: 'README.md',
    conteudo: `A plataforma Essência do Cuidar aceita SOMENTE vagas de baixa e média complexidade.
Alta complexidade, UTI, ventilação mecânica e cuidadoICU são recusados na validação da API e na interface.
Isso é uma regra de negócio central: o marketplace é para atendimento domiciliar de idosos e pacientes
de baixa e média complexidade, com profissionais como cuidadores, enfermeiros, fisioterapeutas,
psicólogos, terapeutas ocupacionais, nutricionistas e médicos.`
  },
  {
    doc_id: 'kb-tipos-profissional',
    tipo: 'conhecimento',
    titulo: 'Tipos de profissional aceitos',
    fonte: 'README.md',
    conteudo: `Perfis de profissional suportados: Cuidador de Idosos, Enfermeiro, Técnico de Enfermagem,
Fisioterapeuta, Psicólogo, Terapeuta Ocupacional, Nutricionista e Médico.
A validação do registro profissional usa formato de conselho: CRM (medicina), COREN (enfermagem),
CREFITO (fisioterapia), CRP (psicologia) e CRN (nutrição).`
  },
  {
    doc_id: 'kb-formatos-conselho',
    tipo: 'conhecimento',
    titulo: 'Formato do número de registro por conselho',
    fonte: 'backend/src/services/registros.js',
    conteudo: `Formatos aceitos na verificação de registro:
CRM e COREN e CRN: número seguido de hífen e UF. Exemplo: 123456-SP.
CREFITO: número, barra, UF e opcionalmente o número do conselho. Exemplo: 123456/SP-3.
CRP: dois dígitos, barra, até seis dígitos. Exemplo: 06/12345.
A UF é validada contra as 27 unidades federativas. O registro só recebe o selo "Verificado"
após aprovação no painel administrativo.`
  },
  {
    doc_id: 'kb-fluxo-contratante',
    tipo: 'conhecimento',
    titulo: 'Como funciona o fluxo do +Saúde (contratante)',
    fonte: 'README.md',
    conteudo: `O contratante (família, clínica ou instituição) cadastra conta, publica uma vaga descrevendo
o paciente (sexo, idade, diagnóstico, complexidade), o serviço desejado, a jornada de trabalho
(horário e escala), o formato de contratação (PJ ou CLT) e a remuneração (por hora ou por plantão).
Depois recebe as candidaturas, vê o perfil verificado de cada profissional, conversa por chat
interno, aceita um candidato e realiza o pagamento via Pix com split automático:
90% para o profissional e 10% de taxa da plataforma (configurável em PLATFORM_FEE_PCT).`
  },
  {
    doc_id: 'kb-fluxo-profissional',
    tipo: 'conhecimento',
    titulo: 'Como funciona o fluxo do profissional',
    fonte: 'README.md',
    conteudo: `O profissional se cadastra, envia o diploma (PDF, JPG ou PNG, até 5 MB), informa o registro
do conselho, marca as especialidades e a disponibilidade (manhã, tarde, noite, 12h, 24h) e escreve uma bio.
Depois busca vagas com filtros por tipo de profissional, complexidade, região e remuneração,
candida-se, conversa pelo chat e, quando aceito, conecta sua conta Stripe para receber por Pix.
Também pode ativar notificações push do navegador para saber de novas candidaturas e mensagens.`
  },
  {
    doc_id: 'kb-pagamento-split',
    tipo: 'conhecimento',
    titulo: 'Pagamento via Pix e split Stripe Connect',
    fonte: 'DEPLOY.md',
    conteudo: `O pagamento usa o padrão marketplace do Stripe Connect. O profissional cria uma conta
Connect Express e completa o onboarding. O contratante paga via Pix ou cartão; o Stripe retém o valor
e transfere a parcela do profissional, cobrando a taxa da plataforma via application_fee_amount.
A taxa padrão é de 10% (PLATFORM_FEE_PCT), com mínimo de R$ 1,00 por transação.
Em ambiente de demonstração, STRIPE_MOCK=true simula todo o fluxo sem cobrar nada de verdade.`
  },
  {
    doc_id: 'kb-seguranca',
    tipo: 'conhecimento',
    titulo: 'Segurança e verificação de credenciais',
    fonte: 'README.md',
    conteudo: `Senhas com bcrypt (10 rounds), JWT com expiração configurável de 7 dias,
headers de segurança via helmet, rate limiting contra brute-force nos endpoints de autenticação,
CORS restrito ao FRONTEND_URL e SQL sempre parametrizado (prepared statements).
Uploads de diploma aceitam apenas PDF, JPG e PNG até 5 MB, com filtro de MIME e pasta isolada.
A flag "Verificado" no perfil profissional só é aplicada após revisão humana no painel administrativo —
a plataforma exibe o selo, mas recomenda checagem independente no site do conselho.`
  },
  {
    doc_id: 'kb-pwa-offline',
    tipo: 'conhecimento',
    titulo: 'PWA e funcionamento offline',
    fonte: 'README.md',
    conteudo: `O frontend é uma Progressive Web App instalável, com manifest e service worker gerados
pelo vite-plugin-pwa em modo autoUpdate. O service worker faz precache dos assets do build,
permitindo carregamento rápido e alguma resiliency offline. As notificações push usam o
Web Push com chaves VAPID,-functionando no navegador sem depender de FCM do Google.`
  },
  {
    doc_id: 'kb-internacionalizacao',
    tipo: 'conhecimento',
    titulo: 'Idiomas disponíveis',
    fonte: 'README.md',
    conteudo: `A plataforma está disponível em três idiomas: português do Brasil (pt-BR), espanhol (es)
e inglês (en). O idioma é detectado automaticamente no navegador e a escolha do usuário é persistida
no localStorage. A troca pode ser feita pelo seletor na barra de navegação.`
  },
  {
    doc_id: 'kb-banco-postgres',
    tipo: 'conhecimento',
    titulo: 'Banco de dados SQLite e PostgreSQL',
    fonte: 'DEPLOY.md',
    conteudo: `O backend usa um driver de banco unificado. Sem a variável DATABASE_URL, ele roda em SQLite
(ideal para desenvolvimento, arquivo local em backend/data). Com DATABASE_URL, roda em PostgreSQL
(ideal para produção e serverless). O esquema é o mesmo nos dois: tabelas de usuários, profissionais,
vagas, candidaturas, mensagens, avaliações, favoritos, notificações, pagamentos, verificação de
registros e as tabelas do RAG. A migração de schema para PostgreSQL é feita pelo comando
npm run migrate:pg.`
  }
];

/**
 * Constrói a lista de documentos a partir do estado atual do banco +
 * base de conhecimento estática.
 */
export async function coletarDocumentos() {
  const docs = [];

  // Conhecimento estático
  for (const k of CONHECIMENTO) {
    docs.push({
      doc_id: k.doc_id,
      tipo: k.tipo,
      titulo: k.titulo,
      fonte: k.fonte,
      ref_id: null,
      conteudo: k.conteudo
    });
  }

  // Vagas
  const vagas = await db.all(
    `SELECT v.*, u.nome AS contratante_nome
       FROM vagas v JOIN users u ON u.id = v.id_contratante
      ORDER BY v.criado_em DESC LIMIT 300`
  );
  for (const v of vagas) {
    const partes = [
      `Vaga: ${v.profissional_desejado}`,
      `Paciente: ${v.paciente_sexo || 'não informado'}, ${v.paciente_idade ? v.paciente_idade + ' anos' : 'idade não informada'}`,
      v.paciente_diagnostico ? `Diagnóstico: ${v.paciente_diagnostico}` : null,
      `Complexidade: ${v.complexidade}`,
      `Serviço: ${v.servico_descricao}`,
      v.jornada_horario ? `Horário: ${v.jornada_horario}` : null,
      v.jornada_escala ? `Escala: ${v.jornada_escala}` : null,
      v.tipo_contrato ? `Contrato: ${v.tipo_contrato}` : null,
      v.remuneracao_valor ? `Remuneração: R$ ${v.remuneracao_valor} por ${v.remuneracao_tipo === 'hora' ? 'hora' : 'plantão'}` : null,
      v.regiao ? `Região: ${v.regiao}` : null,
      `Status: ${v.status}`,
      `Publicada por: ${v.contratante_nome}`
    ].filter(Boolean);
    docs.push({
      doc_id: `vaga:${v.id}`,
      tipo: 'vaga',
      titulo: `Vaga — ${v.profissional_desejado}${v.regiao ? ` (${v.regiao})` : ''}`,
      fonte: 'vagas',
      ref_id: v.id,
      conteudo: partes.join('\n')
    });
  }

  // Profissionais
  const pross = await db.all(
    `SELECT u.id, u.nome, u.telefone, u.criado_em,
            d.registro_conselho, d.tipo_registro, d.registro_verificado,
            d.diploma_verificado, d.especialidades, d.disponibilidade, d.bio
       FROM users u
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE u.tipo_usuario = 'profissional'
      LIMIT 300`
  );
  for (const p of pross) {
    const esp = safeJson(p.especialidades);
    const disp = safeJson(p.disponibilidade);
    const partes = [
      `Profissional: ${p.nome}`,
      p.tipo_registro ? `Registro: ${p.tipo_registro} ${p.registro_conselho || ''}`.trim() : null,
      p.registro_verificado ? 'Registro verificado pela plataforma' : null,
      p.diploma_verificado ? 'Diploma verificado' : null,
      esp.length ? `Especialidades: ${esp.join(', ')}` : null,
      disp.length ? `Disponibilidade: ${disp.join(', ')}` : null,
      p.bio ? `Bio: ${p.bio}` : null
    ].filter(Boolean);
    docs.push({
      doc_id: `profissional:${p.id}`,
      tipo: 'profissional',
      titulo: `Profissional — ${p.nome}`,
      fonte: 'profissionais',
      ref_id: p.id,
      conteudo: partes.join('\n')
    });
  }

  return docs;
}

function safeJson(v) {
  if (Array.isArray(v)) return v;
  try {
    const p = JSON.parse(v || '[]');
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

/**
 * Reindexa tudo: apaga chunks anteriores e recria.
 */
export async function reindexar({ verbose = true } = {}) {
  await initEmbeddings();

  const docs = await coletarDocumentos();
  if (verbose) console.log(`[rag] indexando ${docs.length} documentos...`);

  // limpa índice anterior
  await db.run('DELETE FROM rag_chunks');
  await db.run('DELETE FROM rag_documentos');

  // gera chunks + embeddings em lote
  const chunksPorDoc = [];
  for (const d of docs) {
    const partes = chunkText(d.conteudo);
    partes.forEach((conteudo, i) => {
      chunksPorDoc.push({ doc: d, chunk_index: i, conteudo });
    });
  }

  const embeddings = await embedMany(chunksPorDoc.map((c) => c.conteudo), 'passage');

  // O driver expõe apenas run(sql, params) — executa imediatamente.
  const upsertDocSql = `
    INSERT INTO rag_documentos (doc_id, tipo, titulo, fonte, ref_id, conteudo)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (doc_id) DO UPDATE SET
      tipo = excluded.tipo, titulo = excluded.titulo, fonte = excluded.fonte,
      ref_id = excluded.ref_id, conteudo = excluded.conteudo`;
  const upsertChunkSql = `
    INSERT INTO rag_chunks (doc_id, chunk_index, conteudo, embedding, tokens)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (doc_id, chunk_index) DO UPDATE SET
      conteudo = excluded.conteudo, embedding = excluded.embedding, tokens = excluded.tokens`;

  const docsInseridos = new Set();
  for (let i = 0; i < chunksPorDoc.length; i++) {
    const c = chunksPorDoc[i];
    if (!docsInseridos.has(c.doc.doc_id)) {
      docsInseridos.add(c.doc.doc_id);
      await db.run(upsertDocSql, [
        c.doc.doc_id, c.doc.tipo, c.doc.titulo, c.doc.fonte, c.doc.ref_id, c.doc.conteudo
      ]);
    }
    const emb = embeddings[i];
    await db.run(upsertChunkSql, [
      c.doc.doc_id, c.chunk_index, c.conteudo, JSON.stringify(emb), c.conteudo.length
    ]);
  }

  const stats = {
    documentos: docsInseridos.size,
    chunks: chunksPorDoc.length,
    embeddings: embeddingInfo()
  };
  if (verbose) {
    console.log(`[rag] indexado: ${stats.documentos} docs, ${stats.chunks} chunks`);
  }
  return stats;
}
