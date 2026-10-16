/**
 * Seed inicial com dados de demonstração: profissionais e vagas de exemplo.
 * Uso: npm run seed
 */
import bcrypt from 'bcryptjs';
import db from './index.js';

function seed() {
  // Limpa dados de demo (idempotente para desenvolvimento)
  db.exec(`
    DELETE FROM mensagens;
    DELETE FROM candidaturas;
    DELETE FROM vagas;
    DELETE FROM profissionais_detalhes;
    DELETE FROM users;
  `);

  const hash = (s) => bcrypt.hashSync(s, 10);

  const insertUser = db.prepare(`
    INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Contratante demo
  const contratanteId = insertUser.run(
    'contratante', 'Maria Silva', 'maria@demo.com', hash('demo1234'),
    '11999990001'
  ).lastInsertRowid;

  // Profissionais demo
  const prof1 = insertUser.run(
    'profissional', 'Ana Carolina Souza', 'ana@demo.com', hash('demo1234'),
    '11999990002'
  ).lastInsertRowid;
  const prof2 = insertUser.run(
    'profissional', 'João Pedro Lima', 'joao@demo.com', hash('demo1234'),
    '11999990003'
  ).lastInsertRowid;
  const prof3 = insertUser.run(
    'profissional', 'Beatriz Mendes', 'bia@demo.com', hash('demo1234'),
    '11999990004'
  ).lastInsertRowid;

  const insertProfDetalhes = db.prepare(`
    INSERT INTO profissionais_detalhes
      (id_user, diploma_url, diploma_nome_original, diploma_verificado,
       registro_conselho, tipo_registro, registro_verificado,
       especialidades, disponibilidade, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertProfDetalhes.run(
    prof1, '/uploads/diploma-demo-ana.pdf', 'diploma-ana.pdf', 1,
    'COREN-SP 123456', 'COREN', 1,
    JSON.stringify(['Idosos', 'Alzheimer', 'Cuidados Paliativos']),
    JSON.stringify(['manha', 'tarde', '12h']),
    'Cuidadora de idosos há 8 anos, especializada em Alzheimer e cuidados paliativos.'
  );
  insertProfDetalhes.run(
    prof2, '/uploads/diploma-demo-joao.pdf', 'diploma-joao.pdf', 1,
    'CREFITO-3/98765', 'CREFITO', 1,
    JSON.stringify(['Fisioterapia', 'Pós-operatório', 'Geriatria']),
    JSON.stringify(['manha', 'tarde']),
    'Fisioterapeuta com foco em reabilitação pós-cirúrgica e geriátrica.'
  );
  insertProfDetalhes.run(
    prof3, '/uploads/diploma-demo-bia.pdf', 'diploma-bia.pdf', 0,
    'CRP-06/54321', 'CRP', 0,
    JSON.stringify(['Psicologia', 'Idosos', 'Acompanhamento Familiar']),
    JSON.stringify(['tarde', 'noite']),
    'Psicóloga clínica com 5 anos de experiência em saúde do idoso.'
  );

  // Vagas demo
  const insertVaga = db.prepare(`
    INSERT INTO vagas
      (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
       complexidade, servico_descricao, profissional_desejado,
       jornada_horario, jornada_escala, tipo_contrato, remuneracao_tipo,
       remuneracao_valor, regiao, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertVaga.run(
    contratanteId, 'F', 82, 'Alzheimer moderado',
    'media', 'Acompanhante diurno para idosa com Alzheimer. Auxílio em medicação, alimentação e mobilidade.',
    'Cuidador de Idosos', '08h às 18h', 'Segunda a Sexta', 'CLT', 'hora', 35, 'Zona Sul - SP', 'ativa'
  );
  insertVaga.run(
    contratanteId, 'M', 70, 'Pós-operatório de quadril',
    'media', 'Sessões de fisioterapia domiciliar, 3x por semana, foco em mobilidade.',
    'Fisioterapeuta', '14h às 16h', 'Seg/Qua/Sex', 'PJ', 'hora', 80, 'Zona Oeste - SP', 'ativa'
  );
  insertVaga.run(
    contratanteId, 'F', 75, 'Hipertensão e mobilidade reduzida',
    'baixa', 'Cuidador noturno para idosa independente que precisa de companhia e supervisão.',
    'Cuidador de Idosos', '20h às 08h', '12x36', 'CLT', 'plantao', 220, 'Centro - SP', 'ativa'
  );

  // Avaliações demo (de "contratantes" fictícios para popular o perfil)
  // Cria 2 contratantes extras só pra popular avaliações
  const c2 = insertUser.run('contratante', 'Família Oliveira', 'oliveira@demo.com', hash('demo1234'), '11999990010').lastInsertRowid;
  const c3 = insertUser.run('contratante', 'Família Santos', 'santos@demo.com', hash('demo1234'), '11999990011').lastInsertRowid;
  const c4 = insertUser.run('contratante', 'Clínica Vida Plus', 'vidaplus@demo.com', hash('demo1234'), '11999990012').lastInsertRowid;

  // Cria vagas para os outros contratantes
  insertVaga.run(c2, 'M', 80, 'AVC', 'media', 'Fisioterapia pós-AVC.', 'Fisioterapeuta', '10h-12h', 'Seg a Sex', 'PJ', 'hora', 90, 'Zona Norte', 'fechada');
  insertVaga.run(c3, 'F', 70, 'Diabetes', 'baixa', 'Acompanhante para idosa com diabetes controlada.', 'Cuidador de Idosos', '14h-18h', 'Segunda a Sexta', 'CLT', 'hora', 30, 'Zona Leste', 'fechada');
  insertVaga.run(c4, 'M', 65, 'Pós-cirúrgico', 'media', 'Acompanhamento pós-cirurgia cardíaca.', 'Técnico de Enfermagem', '07h-19h', '12x36', 'CLT', 'plantao', 280, 'Zona Oeste', 'fechada');

  // Aceita algumas candidaturas e cria avaliações
  // Pega os IDs das vagas recém-criadas
  const vagasFechadas = db.prepare(`SELECT id, id_contratante FROM vagas WHERE id_contratante IN (?,?,?) ORDER BY id`).all(c2, c3, c4);

  // Candidaturas + aceite
  const insertCand = db.prepare(`INSERT INTO candidaturas (id_vaga, id_profissional, mensagem, status_candidatura) VALUES (?, ?, ?, 'aceita')`);
  const candAna2 = insertCand.run(vagasFechadas[0].id, prof1, 'Experiência com AVC').lastInsertRowid;
  const candJoao2 = insertCand.run(vagasFechadas[1].id, prof2, 'Disponível para início imediato').lastInsertRowid;
  const candBia2 = insertCand.run(vagasFechadas[2].id, prof3, 'Boa referência profissional').lastInsertRowid;

  const insertAv = db.prepare(`INSERT INTO avaliacoes (id_contratante, id_profissional, id_vaga, nota, comentario) VALUES (?, ?, ?, ?, ?)`);
  insertAv.run(c2, prof1, vagasFechadas[0].id, 5, 'Excelente profissional! Cuidou do meu pai com muito carinho e atenção. Recomendo demais.');
  insertAv.run(c3, prof2, vagasFechadas[1].id, 5, 'Pontual, educado e muito competente. A minha mãe adorou.');
  insertAv.run(c4, prof3, vagasFechadas[2].id, 4, 'Boa profissional. Um pouco tímida mas muito atenciosa.');
  // Mais 2 avaliações pra Ana pra dar destaque
  const c5 = insertUser.run('contratante', 'Família Pereira', 'pereira@demo.com', hash('demo1234'), '11999990013').lastInsertRowid;
  const c6 = insertUser.run('contratante', 'Família Costa', 'costa@demo.com', hash('demo1234'), '11999990014').lastInsertRowid;
  const v5 = insertVaga.run(c5, 'F', 88, 'Alzheimer avançado', 'media', 'Cuidado integral a idosa acamada.', 'Cuidador de Idosos', '08h-20h', '12x36', 'CLT', 'plantao', 250, 'Zona Sul', 'fechada').lastInsertRowid;
  const v6 = insertVaga.run(c6, 'M', 72, 'Parkinson', 'media', 'Acompanhamento diurno.', 'Cuidador de Idosos', '09h-17h', 'Seg a Sex', 'PJ', 'hora', 45, 'Zona Oeste', 'fechada').lastInsertRowid;
  insertCand.run(v5, prof1, 'Atendimento 24h');
  insertCand.run(v6, prof1, 'Acompanhamento Parkinson');
  // Candidatura da Ana numa vaga ATIVA para stats de candidaturas totais
  const vAtiva = db.prepare(`SELECT id FROM vagas WHERE id_contratante = ? AND status = 'ativa' LIMIT 1`).get(contratanteId);
  if (vAtiva) insertCand.run(vAtiva.id, prof1, 'Disponível para início imediato');
  // Candidatura da Ana numa vaga PAUSADA (testes)
  // Cria + fecha uma vaga demo pra stats de "vagas concluídas"
  const vConc = insertVaga.run(contratanteId, 'M', 79, 'Reabilitação', 'media',
    'Trabalho concluído em 3 meses, profissional exemplar.',
    'Cuidador de Idosos', '08h-18h', 'Seg a Sex', 'CLT', 'plantao', 250, 'Zona Sul', 'fechada').lastInsertRowid;
  insertCand.run(vConc, prof1, 'Já trabalhei com casos similares');
  insertAv.run(c5, prof1, v5, 5, null);
  insertAv.run(c6, prof1, v6, 4, 'Muito atenciosa com paciente difícil.');

  console.log('[seed] dados demo criados:');
  console.log('   - contratante: maria@demo.com / demo1234');
  console.log('   - contratante: oliveira@demo.com / demo1234');
  console.log('   - contratante: santos@demo.com / demo1234');
  console.log('   - contratante: vidaplus@demo.com / demo1234');
  console.log('   - profissional: ana@demo.com / demo1234');
  console.log('   - profissional: joao@demo.com / demo1234');
  console.log('   - profissional: bia@demo.com / demo1234');
  console.log('   (Ana: ~4.7⭐  |  João: ~4.5⭐  |  Bia: 4⭐)');
}

seed();
