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
  const insertProf = async (id, args) => {
    return db.run(
      `INSERT INTO profissionais_detalhes
        (id_user, diploma_url, diploma_nome_original, diploma_verificado,
         registro_conselho, tipo_registro, registro_verificado,
         especialidades, disponibilidade, bio, cidade)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args
    );
  };
  await insertProf(prof1.lastInsertRowid, [
    prof1.lastInsertRowid, '/uploads/diploma-demo-ana.pdf', 'diploma-ana.pdf', 1,
    'COREN-SP 123456', 'COREN', 1,
    JSON.stringify(['Idosos', 'Alzheimer', 'Cuidados Paliativos']),
    JSON.stringify(['manha', 'tarde', '12h']),
    'Cuidadora de idosos há 8 anos, especializada em Alzheimer e cuidados paliativos.',
    'São Paulo'
  ]);
  await insertProf(prof2.lastInsertRowid, [
    prof2.lastInsertRowid, '/uploads/diploma-demo-joao.pdf', 'diploma-joao.pdf', 1,
    'CREFITO-3/98765', 'CREFITO', 1,
    JSON.stringify(['Fisioterapia', 'Pós-operatório', 'Geriatria']),
    JSON.stringify(['manha', 'tarde']),
    'Fisioterapeuta com foco em reabilitação pós-cirúrgica e geriátrica.',
    'São Paulo'
  ]);
  await insertProf(prof3.lastInsertRowid, [
    prof3.lastInsertRowid, '/uploads/diploma-demo-bia.pdf', 'diploma-bia.pdf', 0,
    'CRP-06/54321', 'CRP', 0,
    JSON.stringify(['Psicologia', 'Idosos', 'Acompanhamento Familiar']),
    JSON.stringify(['tarde', 'noite']),
    'Psicóloga clínica com 5 anos de experiência em saúde do idoso.',
    'Campinas'
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
  await insertVaga([
    contratante.lastInsertRowid, 'F', 82, 'Alzheimer moderado',
    'media', 'Acompanhante diurno para idosa com Alzheimer. Auxílio em medicação, alimentação e mobilidade.',
    'Cuidador de Idosos', '08h às 18h', 'Segunda a Sexta', 'CLT', 'hora', 35, 'Zona Sul - SP',
    'São Paulo', '08h às 18h - Segunda a Sexta', 'ativa'
  ]);
  await insertVaga([
    contratante.lastInsertRowid, 'M', 70, 'Pós-operatório de quadril',
    'media', 'Sessões de fisioterapia domiciliar, 3x por semana, foco em mobilidade.',
    'Fisioterapeuta', '14h às 16h', 'Seg/Qua/Sex', 'PJ', 'hora', 80, 'Zona Oeste - SP',
    'São Paulo', '14h às 16h - Seg/Qua/Sex', 'ativa'
  ]);
  await insertVaga([
    contratante.lastInsertRowid, 'F', 75, 'Hipertensão e mobilidade reduzida',
    'baixa', 'Cuidador noturno para idosa independente que precisa de companhia e supervisão.',
    'Cuidador de Idosos', '20h às 08h', '12x36', 'CLT', 'plantao', 220, 'Centro - SP',
    'São Paulo', 'Plantão noturno 12x36', 'ativa'
  ]);

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
process.exit(0);
