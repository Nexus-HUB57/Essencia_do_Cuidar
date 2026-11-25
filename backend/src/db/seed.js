/**
 * Seed inicial com dados de demonstração.
 * Uso: npm run seed
 *
 * Idempotente: limpa e re-popula.
 */
import bcrypt from 'bcryptjs';
import db from './driver.js';
import { initSchema } from './driver.js';

await initSchema();

async function seed() {
  await db.exec(`
    DELETE FROM mensagens;
    DELETE FROM candidaturas;
    DELETE FROM vagas;
    DELETE FROM profissionais_detalhes;
    DELETE FROM users;
  `);

  const hash = (s) => bcrypt.hashSync(s, 10);

/**
 * Zera os contadores de id de todas as tabelas.
 *
 * SQLite: `sqlite_sequence` guarda o último AUTOINCREMENT por tabela.
 * Postgres: as sequences são `*_id_seq` e precisam de `setval`.
 *
 * O objetivo é simples: `npm run seed` sempre entrega os mesmos ids, para
 * que demos, tutoriais e testes de smoke possam referenciar ids fixos.
 */
async function resetSequences() {
  if (db.driver === 'sqlite') {
    try {
      await db.run('DELETE FROM sqlite_sequence');
    } catch {
      // tabela pode não existir (nenhuma coluna AUTOINCREMENT) — sem problema
    }
    return;
  }

  // Postgres
  try {
    const rows = await db.all(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    for (const { tablename } of rows) {
      try {
        await db.run(
          `SELECT setval(pg_get_serial_sequence(?, 'id'), 1, false)`,
          [tablename]
        );
      } catch {
        // tabela sem sequence — ignora
      }
    }
  } catch {
    // sem permissão para ler pg_tables — segue sem reset
  }
}

  // Reseta os contadores de id para que o seed seja DETERMINÍSTICO.
  // Sem isso, rodar o seed duas vezes deixava os ids pulando (o DELETE não
  // zera o AUTOINCREMENT do SQLite nem as sequences do Postgres) e qualquer
  // teste ou demo que dependesse de um id fixo quebrava.
  await resetSequences();

  // Contratante
  const contratante = await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
    ['contratante', 'Maria Silva', 'maria@demo.com', hash('demo1234'), '11999990001']
  );
  // Admin
  await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone, is_admin) VALUES (?, ?, ?, ?, ?, 1)`,
    ['contratante', 'Admin da Plataforma', 'admin@demo.com', hash('admin1234'), '11999990000']
  );

  const prof1 = await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
    ['profissional', 'Ana Carolina Souza', 'ana@demo.com', hash('demo1234'), '11999990002']
  );
  const prof2 = await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
    ['profissional', 'João Pedro Lima', 'joao@demo.com', hash('demo1234'), '11999990003']
  );
  const prof3 = await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
    ['profissional', 'Beatriz Mendes', 'bia@demo.com', hash('demo1234'), '11999990004']
  );

  // Detalhes profissionais — com cidade (matching simplificado)
  //
  // `profissao` e `regiao` alimentam o motor de matching (services/matching.js).
  // `cidade` alimenta o fallback geográfico quando não há região textual.
  // O seed cobre os três casos que interessam:
  //   Ana      → match exato de profissão (vaga "Cuidador de Idosos"), mesma região
  //   João     → match exato de profissão (vaga "Fisioterapeuta"), mesma região
  //   Beatriz  → profession sem vaga correspondente + região diferente (demo do caso "sem match")
  const insertProf = async (id, args) => {
    return db.run(
      `INSERT INTO profissionais_detalhes
        (id_user, diploma_url, diploma_nome_original, diploma_verificado,
         registro_conselho, tipo_registro, registro_verificado,
         profissao, regiao, especialidades, disponibilidade, bio, cidade)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args
    );
  };
  await insertProf(prof1.lastInsertRowid, [
    prof1.lastInsertRowid, '/uploads/diploma-demo-ana.pdf', 'diploma-ana.pdf', 1,
    'COREN-SP 123456', 'COREN', 1,
    'cuidador', 'Zona Sul - SP',
    JSON.stringify(['Idosos', 'Alzheimer', 'Cuidados Paliativos']),
    JSON.stringify(['manha', 'tarde', '12h']),
    'Cuidadora de idosos há 8 anos, especializada em Alzheimer e cuidados paliativos.',
    'São Paulo'
  ]);
  await insertProf(prof2.lastInsertRowid, [
    prof2.lastInsertRowid, '/uploads/diploma-demo-joao.pdf', 'diploma-joao.pdf', 1,
    'CREFITO-12345-F', 'CREFITO', 1,
    'fisioterapeuta', 'Zona Oeste - SP',
    JSON.stringify(['Fisioterapia', 'Pós-operatório', 'Geriatria']),
    JSON.stringify(['manha', 'tarde']),
    'Fisioterapeuta com foco em reabilitação pós-cirúrgica e geriátrica.',
    'São Paulo'
  ]);
  await insertProf(prof3.lastInsertRowid, [
    prof3.lastInsertRowid, '/uploads/diploma-demo-bia.pdf', 'diploma-bia.pdf', 0,
    '06/12345', 'CRP', 0,
    'psicologo', 'Centro - SP',
    JSON.stringify(['Psicologia', 'Idosos', 'Acompanhamento Familiar']),
    JSON.stringify(['tarde', 'noite']),
    'Psicóloga clínica com 5 anos de experiência em saúde do idoso.',
    'São Paulo'
  ]);

  // Vagas — com cidade + carga_horaria (matching simplificado: 2 filtros)
  const insertVaga = async (args) => {
    return db.run(
      `INSERT INTO vagas
        (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
         complexidade, servico_descricao, profissional_desejado,
         jornada_horario, jornada_escala, tipo_contrato, remuneracao_tipo,
         remuneracao_valor, regiao, cidade, carga_horaria, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args
    );
  };
  const vMaria1 = (await insertVaga([
    contratante.lastInsertRowid, 'F', 82, 'Alzheimer moderado',
    'media', 'Acompanhante diurno para idosa com Alzheimer. Auxílio em medicação, alimentação e mobilidade.',
    'Cuidador de Idosos', '08h às 18h', 'Segunda a Sexta', 'CLT', 'hora', 35, 'Zona Sul - SP',
    'São Paulo', '08h às 18h - Segunda a Sexta', 'ativa'
  ])).lastInsertRowid;
  const vMaria2 = (await insertVaga([
    contratante.lastInsertRowid, 'M', 70, 'Pós-operatório de quadril',
    'media', 'Sessões de fisioterapia domiciliar, 3x por semana, foco em mobilidade.',
    'Fisioterapeuta', '14h às 16h', 'Seg/Qua/Sex', 'PJ', 'hora', 80, 'Zona Oeste - SP',
    'São Paulo', '14h às 16h - Seg/Qua/Sex', 'ativa'
  ])).lastInsertRowid;
  const vMaria3 = (await insertVaga([
    contratante.lastInsertRowid, 'F', 75, 'Hipertensão e mobilidade reduzida',
    'baixa', 'Cuidador noturno para idosa independente que precisa de companhia e supervisão.',
    'Cuidador de Idosos', '20h às 08h', '12x36', 'CLT', 'plantao', 220, 'Centro - SP',
    'São Paulo', 'Plantão noturno 12x36', 'ativa'
  ])).lastInsertRowid;

  // Vagas extras da Maria, usadas pelos protocolos de demonstracao.
  //
  // Ficam SEPARADAS de vMaria1..vMaria3 de proposito: o smoke test de
  // matching depende de a vaga 1 ("Cuidador de Idosos") continuar sem
  // candidatura da Ana, senao o matcher a exclui da recomendacao — que e o
  // comportamento correto, mas quebraria a vitrine do matching.
  const vMaria4 = (await insertVaga([
    contratante.lastInsertRowid, 'F', 78, 'Demencia em evolucao',
    'media', 'Cuidador noturno para idosa com demencia. Acompanhamento noturno, medicacao e mobilidade.',
    'Cuidador de Idosos', '20h às 08h', '12x36', 'CLT', 'plantao', 220, 'Centro - SP',
    'São Paulo', 'Plantão noturno 12x36', 'ativa'
  ])).lastInsertRowid;
  const vMaria5 = (await insertVaga([
    contratante.lastInsertRowid, 'F', 34, 'Ansiedade e luto',
    'baixa', 'Acompanhamento psicologico semanal para mulher em processo de luto.',
    'Psicólogo', '17h às 18h', 'Quarta', 'PJ', 'hora', 120, 'Zona Sul - SP',
    'São Paulo', 'Sessão semanal', 'ativa'
  ])).lastInsertRowid;

  // Avaliações demo (de "contratantes" fictícios para popular o perfil)
  // Cria 2 contratantes extras só pra popular avaliações.
  // NOTA: o resto do seed usa `await db.run()` (driver unificado); esta parte
  // ainda usava o estilo síncrono antigo (`insertUser.run`/`insertVaga.run`),
  // que quebra em runtime. Migrado para `await` na mesma linha abaixo.
  const c2 = (await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
    ['contratante', 'Família Oliveira', 'oliveira@demo.com', hash('demo1234'), '11999990010']
  )).lastInsertRowid;
  const c3 = (await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
    ['contratante', 'Família Santos', 'santos@demo.com', hash('demo1234'), '11999990011']
  )).lastInsertRowid;
  const c4 = (await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
    ['contratante', 'Clínica Vida Plus', 'vidaplus@demo.com', hash('demo1234'), '11999990012']
  )).lastInsertRowid;

  // Cria vagas para os outros contratantes (todas fechadas para permitir avaliações)
  const vf1 = (await db.run(
    `INSERT INTO vagas (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
      complexidade, servico_descricao, profissional_desejado, jornada_horario,
      jornada_escala, tipo_contrato, remuneracao_tipo, remuneracao_valor, regiao, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c2, 'M', 80, 'AVC', 'media', 'Fisioterapia pós-AVC.', 'Fisioterapeuta', '10h-12h', 'Seg a Sex', 'PJ', 'hora', 90, 'Zona Norte', 'fechada']
  )).lastInsertRowid;
  const vf2 = (await db.run(
    `INSERT INTO vagas (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
      complexidade, servico_descricao, profissional_desejado, jornada_horario,
      jornada_escala, tipo_contrato, remuneracao_tipo, remuneracao_valor, regiao, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c3, 'F', 70, 'Diabetes', 'baixa', 'Acompanhante para idosa com diabetes controlada.', 'Cuidador de Idosos', '14h-18h', 'Segunda a Sexta', 'CLT', 'hora', 30, 'Zona Leste', 'fechada']
  )).lastInsertRowid;
  const vf3 = (await db.run(
    `INSERT INTO vagas (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
      complexidade, servico_descricao, profissional_desejado, jornada_horario,
      jornada_escala, tipo_contrato, remuneracao_tipo, remuneracao_valor, regiao, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c4, 'M', 65, 'Pós-cirúrgico', 'media', 'Acompanhamento pós-cirurgia cardíaca.', 'Técnico de Enfermagem', '07h-19h', '12x36', 'CLT', 'plantao', 280, 'Zona Oeste', 'fechada']
  )).lastInsertRowid;

  // Candidaturas + aceite (1 por profissional nas vagas recém-criadas)
  const candAna2 = (await db.run(
    `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`,
    [vf1, prof1.lastInsertRowid, 'Experiência com AVC']
  )).lastInsertRowid;
  const candJoao2 = (await db.run(
    `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`,
    [vf2, prof2.lastInsertRowid, 'Disponível para início imediato']
  )).lastInsertRowid;
  const candBia2 = (await db.run(
    `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`,
    [vf3, prof3.lastInsertRowid, 'Boa referência profissional']
  )).lastInsertRowid;

  // Avaliações
  const insertAv = (args) => db.run(
    `INSERT INTO avaliacoes (id_contratante, id_profissional, id_vaga, nota, comentario) VALUES (?, ?, ?, ?, ?)`,
    args
  );
  await insertAv([c2, prof1.lastInsertRowid, vf1, 5, 'Excelente profissional! Cuidou do meu pai com muito carinho e atenção. Recomendo demais.']);
  await insertAv([c3, prof2.lastInsertRowid, vf2, 5, 'Pontual, educado e muito competente. A minha mãe adorou.']);
  await insertAv([c4, prof3.lastInsertRowid, vf3, 4, 'Boa profissional. Um pouco tímida mas muito atenciosa.']);

  // Mais 2 avaliações pra Ana pra dar destaque
  const c5 = (await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
    ['contratante', 'Família Pereira', 'pereira@demo.com', hash('demo1234'), '11999990013']
  )).lastInsertRowid;
  const c6 = (await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
    ['contratante', 'Família Costa', 'costa@demo.com', hash('demo1234'), '11999990014']
  )).lastInsertRowid;
  const v5 = (await db.run(
    `INSERT INTO vagas (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
      complexidade, servico_descricao, profissional_desejado, jornada_horario,
      jornada_escala, tipo_contrato, remuneracao_tipo, remuneracao_valor, regiao, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c5, 'F', 88, 'Alzheimer avançado', 'media', 'Cuidado integral a idosa acamada.', 'Cuidador de Idosos', '08h-20h', '12x36', 'CLT', 'plantao', 250, 'Zona Sul', 'fechada']
  )).lastInsertRowid;
  const v6 = (await db.run(
    `INSERT INTO vagas (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
      complexidade, servico_descricao, profissional_desejado, jornada_horario,
      jornada_escala, tipo_contrato, remuneracao_tipo, remuneracao_valor, regiao, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c6, 'M', 72, 'Parkinson', 'media', 'Acompanhamento diurno.', 'Cuidador de Idosos', '09h-17h', 'Seg a Sex', 'PJ', 'hora', 45, 'Zona Oeste', 'fechada']
  )).lastInsertRowid;
  await db.run(
    `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`,
    [v5, prof1.lastInsertRowid, 'Atendimento 24h']
  );
  await db.run(
    `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`,
    [v6, prof1.lastInsertRowid, 'Acompanhamento Parkinson']
  );
  await insertAv([c5, prof1.lastInsertRowid, v5, 5, null]);
  await insertAv([c6, prof1.lastInsertRowid, v6, 4, 'Muito atenciosa com paciente difícil.']);


  // ─────────────────────────────────────────────────────────────────────────
  // Protocolos de plantão + custódia + check-in/check-out
  //
  // Sem isto o painel de protocolos abre VAZIO na demonstração: as
  // funcionalidades existem e estão testadas (smoke-test-custodia.py cobre a
  // jornada inteira), mas ninguem consegue ver sem criar o fluxo do zero.
  // Cada protocolo abaixo fica num estagio diferente da jornada, para que o
  // painel mostre os botoes/selos correspondentes.
  //
  // ATENCAO: um protocolo referencia sempre uma candidatura. E o matcher
  // nao recomenda quem ja se candidatou a vaga. Por isso os protocolos usam
  // vMaria4/vMaria5 (vagas criadas so para a demo) e as vagas do showcase de
  // matching (vMaria1..vMaria3) ficam limpas.
  // ─────────────────────────────────────────────────────────────────────────
  const insertProtocolo = (args) => db.run(
    `INSERT INTO protocolos
       (tipo, id_vaga, id_candidatura, id_contratante, id_profissional, status,
        valor_plantao_centavos, valor_taxa_centavos, valor_total_centavos, moeda,
        criado_em, enviado_em, respondido_em, pago_em,
        checkout_profissional_em, checkout_contratante_em, liberado_em, expira_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'brl',
             datetime('now', ?), datetime('now', ?), datetime('now', ?), datetime('now', ?),
             datetime('now', ?), datetime('now', ?), datetime('now', ?), datetime('now', ?))`,
    args
  );
  const insertCustodia = (args) => db.run(
    `INSERT INTO pagamentos_custodia (id_protocolo, valor_centavos, status, criado_em, pago_em, liberado_em)
     VALUES (?, ?, ?, datetime('now', ?), datetime('now', ?), datetime('now', ?))`,
    args
  );
  const insertCheckin = (args) => db.run(
    `INSERT INTO protocolo_checkins (id_protocolo, id_user, tipo_user, confirmado_em, observacao)
     VALUES (?, ?, ?, datetime('now', ?), ?)`,
    args
  );
  const insertCheckout = (args) => db.run(
    `INSERT INTO protocolo_checkouts (id_protocolo, id_user, tipo_user, confirmado_em, nota, comentario)
     VALUES (?, ?, ?, datetime('now', ?), ?, ?)`,
    args
  );

  const candM1 = (await db.run(
    `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`,
    [vMaria4, prof1.lastInsertRowid, 'Posso iniciar na segunda.']
  )).lastInsertRowid;
  const candM2 = (await db.run(
    `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`,
    [vMaria5, prof3.lastInsertRowid, 'Atendimento semanal,boa disponibilidade.']
  )).lastInsertRowid;

  const candM3 = (await db.run(
    `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`,
    [vMaria4, prof2.lastInsertRowid, 'Tenho disponibilidade para o plantao noturno.']
  )).lastInsertRowid;

  // 1) Plantao EM CUSTODIA — o contratante pagou, o dinheiro esta retido
  //    aguardando o profissional fazer o check-in.
  const pdc1 = (await insertProtocolo([
    'PDC', vMaria4, candM1, contratante.lastInsertRowid, prof1.lastInsertRowid, 'em_custodia',
    35000, 3500, 38500,
    '-2 days', '-2 days', '-2 days', '-1 day',
    null, null, null, null
  ])).lastInsertRowid;
  await insertCustodia([pdc1, 38500, 'em_custodia', '-1 day', '-1 day', null]);

  // 2) Plantao com CHECK-IN feito — o botao "Finalizar plantao" aparece.
  const pdc2 = (await insertProtocolo([
    'PDC', vMaria5, candM2, contratante.lastInsertRowid, prof3.lastInsertRowid, 'checkout_pendente',
    28000, 2800, 30800,
    '-1 day', '-1 day', '-1 day', '-6 hours',
    null, null, null, null
  ])).lastInsertRowid;
  await insertCustodia([pdc2, 30800, 'em_custodia', '-6 hours', '-6 hours', null]);
  await insertCheckin([pdc2, prof3.lastInsertRowid, 'profissional', '-2 hours', 'Cheguei as 17h, tudo em ordem.']);

  // 3) Plantao com CHECK-OUT dos dois lados — aguardando a liberacao em 72h
  //    (e o que o cron processa).
  const pdc3 = (await insertProtocolo([
    'PDC', vMaria4, candM1, contratante.lastInsertRowid, prof1.lastInsertRowid, 'checkout_completo',
    22000, 2200, 24200,
    '-5 days', '-5 days', '-5 days', '-4 days',
    '-1 day', '-1 day', null, null
  ])).lastInsertRowid;
  await insertCustodia([pdc3, 24200, 'em_custodia', '-4 days', '-4 days', null]);
  await insertCheckin([pdc3, prof1.lastInsertRowid, 'profissional', '-2 days', 'Inicio do plantao.']);
  await insertCheckin([pdc3, contratante.lastInsertRowid, 'contratante', '-1 day', 'Presenca confirmada.']);
  await insertCheckout([pdc3, prof1.lastInsertRowid, 'profissional', '-1 day', 5, 'Plantao concluido sem intercorrencias.']);
  await insertCheckout([pdc3, contratante.lastInsertRowid, 'contratante', '-1 day', 5, 'Atendimento excelente.']);

  // 4) Plantao LIBERADO — a jornada completa, com a custodia transferida ao
  //    profissional. E o que da reputacao (atendimentos concluidos).
  const pdc4 = (await insertProtocolo([
    'PDC', vMaria4, candM1, contratante.lastInsertRowid, prof1.lastInsertRowid, 'liberado',
    40000, 4000, 44000,
    '-12 days', '-12 days', '-12 days', '-11 days',
    '-10 days', '-10 days', '-9 days', null
  ])).lastInsertRowid;
  await insertCustodia([pdc4, 44000, 'liberado_profissional', '-11 days', '-11 days', '-9 days']);
  await insertCheckin([pdc4, prof1.lastInsertRowid, 'profissional', '-10 days', null]);
  await insertCheckout([pdc4, prof1.lastInsertRowid, 'profissional', '-10 days', 5, 'Excelente atendimento.']);
  await insertCheckout([pdc4, contratante.lastInsertRowid, 'contratante', '-10 days', 5, 'Muito atenciosa.']);

  // 5) PCM aguardando aceite do profissional — a primeira etapa do fluxo.
  const pcm1 = (await insertProtocolo([
    'PCM', vMaria4, candM3, contratante.lastInsertRowid, prof2.lastInsertRowid, 'enviado',
    22000, 2200, 24200,
    '-1 day', '-1 day', null, null,
    null, null, null, '+1 day'
  ])).lastInsertRowid;

  console.log('[seed] protocolos de plantao: PDC', pdc1, pdc2, pdc3, pdc4, '| PCM', pcm1);

  console.log('[seed] dados demo criados:');
  console.log('   - contratante: maria@demo.com / demo1234');
  console.log('   - contratante: oliveira@demo.com / demo1234');
  console.log('   - contratante: santos@demo.com / demo1234');
  console.log('   - contratante: vidaplus@demo.com / demo1234');
  console.log('   - profissional: ana@demo.com / demo1234');
  console.log('   - profissional: joao@demo.com / demo1234');
  console.log('   - profissional: bia@demo.com / demo1234');
  console.log('   - admin:       admin@demo.com / admin1234');
}

await seed();

// Sai APENAS quando executado como script (npm run seed). Quando importado
// pelo boot do servidor (SEED_ON_BOOT=true no Render), process.exit() matava
// o processo inteiro antes do listen() — a instância morria logo após o
// seed e o deploy ia para update_failed (incidente de 25/11/2026).
import { pathToFileURL } from 'url';
const executadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDireto) process.exit(0);
