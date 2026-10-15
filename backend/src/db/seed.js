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

  console.log('[seed] dados demo criados:');
  console.log('   - contratante: maria@demo.com / demo1234');
  console.log('   - profissional: ana@demo.com / demo1234');
  console.log('   - profissional: joao@demo.com / demo1234');
  console.log('   - profissional: bia@demo.com / demo1234');
  console.log('   - admin:       admin@demo.com / admin1234');
}

await seed();
process.exit(0);
