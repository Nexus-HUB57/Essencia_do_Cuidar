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
    DELETE FROM avaliacoes;
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

  // Detalhes profissionais
  const insertProf = async (id, args) => {
    return db.run(
      `INSERT INTO profissionais_detalhes
        (id_user, diploma_url, diploma_nome_original, diploma_verificado,
         registro_conselho, tipo_registro, registro_verificado,
         especialidades, disponibilidade, bio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args
    );
  };
  await insertProf(prof1.lastInsertRowid, [
    prof1.lastInsertRowid, '/uploads/diploma-demo-ana.pdf', 'diploma-ana.pdf', 1,
    'COREN-SP 123456', 'COREN', 1,
    JSON.stringify(['Idosos', 'Alzheimer', 'Cuidados Paliativos']),
    JSON.stringify(['manha', 'tarde', '12h']),
    'Cuidadora de idosos há 8 anos, especializada em Alzheimer e cuidados paliativos.'
  ]);
  await insertProf(prof2.lastInsertRowid, [
    prof2.lastInsertRowid, '/uploads/diploma-demo-joao.pdf', 'diploma-joao.pdf', 1,
    'CREFITO-3/98765', 'CREFITO', 1,
    JSON.stringify(['Fisioterapia', 'Pós-operatório', 'Geriatria']),
    JSON.stringify(['manha', 'tarde']),
    'Fisioterapeuta com foco em reabilitação pós-cirúrgica e geriátrica.'
  ]);
  await insertProf(prof3.lastInsertRowid, [
    prof3.lastInsertRowid, '/uploads/diploma-demo-bia.pdf', 'diploma-bia.pdf', 0,
    'CRP-06/54321', 'CRP', 0,
    JSON.stringify(['Psicologia', 'Idosos', 'Acompanhamento Familiar']),
    JSON.stringify(['tarde', 'noite']),
    'Psicóloga clínica com 5 anos de experiência em saúde do idoso.'
  ]);

  // Vagas
  const insertVaga = async (args) => {
    return db.run(
      `INSERT INTO vagas
        (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
         complexidade, servico_descricao, profissional_desejado,
         jornada_horario, jornada_escala, tipo_contrato, remuneracao_tipo,
         remuneracao_valor, regiao, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args
    );
  };
  await insertVaga([
    contratante.lastInsertRowid, 'F', 82, 'Alzheimer moderado',
    'media', 'Acompanhante diurno para idosa com Alzheimer. Auxílio em medicação, alimentação e mobilidade.',
    'Cuidador de Idosos', '08h às 18h', 'Segunda a Sexta', 'CLT', 'hora', 35, 'Zona Sul - SP', 'ativa'
  ]);
  await insertVaga([
    contratante.lastInsertRowid, 'M', 70, 'Pós-operatório de quadril',
    'media', 'Sessões de fisioterapia domiciliar, 3x por semana, foco em mobilidade.',
    'Fisioterapeuta', '14h às 16h', 'Seg/Qua/Sex', 'PJ', 'hora', 80, 'Zona Oeste - SP', 'ativa'
  ]);
  await insertVaga([
    contratante.lastInsertRowid, 'F', 75, 'Hipertensão e mobilidade reduzida',
    'baixa', 'Cuidador noturno para idosa independente que precisa de companhia e supervisão.',
    'Cuidador de Idosos', '20h às 08h', '12x36', 'CLT', 'plantao', 220, 'Centro - SP', 'ativa'
  ]);

  // Avaliações demo (de "contratantes" fictícios para popular o perfil)
  // Cria contratantes extras só pra popular avaliações
  const novoContratante = async (nome, email, tel) => {
    const r = await db.run(
      `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
      ['contratante', nome, email, hash('demo1234'), tel]
    );
    return r.lastInsertRowid;
  };
  const c2 = await novoContratante('Família Oliveira', 'oliveira@demo.com', '11999990010');
  const c3 = await novoContratante('Família Santos', 'santos@demo.com', '11999990011');
  const c4 = await novoContratante('Clínica Vida Plus', 'vidaplus@demo.com', '11999990012');
  const c5 = await novoContratante('Família Pereira', 'pereira@demo.com', '11999990013');
  const c6 = await novoContratante('Família Costa', 'costa@demo.com', '11999990014');

  // Vagas fechadas dos contratantes extras (base para as avaliações)
  const vagaFechada = async (args) => {
    const r = await insertVaga(args);
    return r.lastInsertRowid;
  };
  const vf1 = await vagaFechada([c2, 'M', 80, 'AVC', 'media', 'Fisioterapia pós-AVC.', 'Fisioterapeuta', '10h-12h', 'Seg a Sex', 'PJ', 'hora', 90, 'Zona Norte', 'fechada']);
  const vf2 = await vagaFechada([c3, 'F', 70, 'Diabetes', 'baixa', 'Acompanhante para idosa com diabetes controlada.', 'Cuidador de Idosos', '14h-18h', 'Segunda a Sexta', 'CLT', 'hora', 30, 'Zona Leste', 'fechada']);
  const vf3 = await vagaFechada([c4, 'M', 65, 'Pós-cirúrgico', 'media', 'Acompanhamento pós-cirurgia cardíaca.', 'Técnico de Enfermagem', '07h-19h', '12x36', 'CLT', 'plantao', 280, 'Zona Oeste', 'fechada']);
  const vf5 = await vagaFechada([c5, 'F', 88, 'Alzheimer avançado', 'media', 'Cuidado integral a idosa acamada.', 'Cuidador de Idosos', '08h-20h', '12x36', 'CLT', 'plantao', 250, 'Zona Sul', 'fechada']);
  const vf6 = await vagaFechada([c6, 'M', 72, 'Parkinson', 'media', 'Acompanhamento diurno.', 'Cuidador de Idosos', '09h-17h', 'Seg a Sex', 'PJ', 'hora', 45, 'Zona Oeste', 'fechada']);

  // Candidaturas aceitas (base para as avaliações — a API exige aceite)
  const insertCand = (vagaId, profId, msg) => db.run(
    `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`,
    [vagaId, profId, msg]
  );
  await insertCand(vf1, prof1.lastInsertRowid, 'Experiência com AVC');
  await insertCand(vf2, prof2.lastInsertRowid, 'Disponível para início imediato');
  await insertCand(vf3, prof3.lastInsertRowid, 'Boa referência profissional');
  await insertCand(vf5, prof1.lastInsertRowid, 'Atendimento 24h');
  await insertCand(vf6, prof1.lastInsertRowid, 'Acompanhamento Parkinson');

  const insertAv = (contratanteId, profId, vagaId, nota, comentario) => db.run(
    `INSERT INTO avaliacoes (id_contratante, id_profissional, id_vaga, nota, comentario) VALUES (?, ?, ?, ?, ?)`,
    [contratanteId, profId, vagaId, nota, comentario]
  );
  await insertAv(c2, prof1.lastInsertRowid, vf1, 5, 'Excelente profissional! Cuidou do meu pai com muito carinho e atenção. Recomendo demais.');
  await insertAv(c3, prof2.lastInsertRowid, vf2, 5, 'Pontual, educado e muito competente. A minha mãe adorou.');
  await insertAv(c4, prof3.lastInsertRowid, vf3, 4, 'Boa profissional. Um pouco tímida mas muito atenciosa.');
  await insertAv(c5, prof1.lastInsertRowid, vf5, 5, null);
  await insertAv(c6, prof1.lastInsertRowid, vf6, 4, 'Muito atenciosa com paciente difícil.');

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
