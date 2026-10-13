// Seed opcional: cria um contratante, um profissional, e uma vaga de exemplo.
// Uso: npm run seed
import bcrypt from 'bcryptjs';
import { db, transaction } from './db.js';

async function run() {
  const senha = await bcrypt.hash('senha123', 10);

  // INSERT OR IGNORE precisa checar antes — node:sqlite não tem OR IGNORE?
  // Workaround: SELECT antes, INSERT só se não existir.
  let c = db.prepare("SELECT id FROM users WHERE email = 'maria@demo.com'").get();
  if (!c) {
    const r = db.prepare(`
      INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone)
      VALUES ('contratante', 'Maria Silva (Demo)', 'maria@demo.com', ?, '+55 11 99999-0000')
    `).run(senha);
    c = { id: r.lastInsertRowid };
  }

  let p = db.prepare("SELECT id FROM users WHERE email = 'joao@demo.com'").get();
  if (!p) {
    const r = db.prepare(`
      INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone)
      VALUES ('profissional', 'João Enfermeiro (Demo)', 'joao@demo.com', ?, '+55 11 98888-0000')
    `).run(senha);
    p = { id: r.lastInsertRowid };
  }

  const hasDet = db.prepare('SELECT id FROM profissionais_detalhes WHERE id_user = ?').get(p.id);
  if (!hasDet) {
    db.prepare(`
      INSERT INTO profissionais_detalhes (id_user, registro_conselho, especialidades, disponibilidade)
      VALUES (?, 'COREN-SP 123456', ?, ?)
    `).run(
      p.id,
      JSON.stringify(['Idosos', 'Cuidados Paliativos', 'Pós-operatório']),
      JSON.stringify({ periodos: ['manha', 'tarde'], dias: ['seg', 'ter', 'qua', 'qui', 'sex'] })
    );
  }

  const hasVaga = db.prepare('SELECT id FROM vagas WHERE id_contratante = ? LIMIT 1').get(c.id);
  if (!hasVaga) {
    db.prepare(`
      INSERT INTO vagas (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
        complexidade, servico_descricao, profissional_desejado,
        jornada_horario, jornada_escala, tipo_contrato, remuneracao_tipo, remuneracao_valor, regiao, status)
      VALUES (?, 'F', 78, 'Alzheimer leve', 'baixa',
        'Acompanhamento diurno, administração de medicação, auxílio em atividades',
        'Técnico de Enfermagem', '08h às 18h', 'Segunda a Sexta', 'CLT', 'hora', 35, 'Zona Sul - SP', 'ativa')
    `).run(c.id);
  }

  console.log('✅ Seed concluído. Credenciais demo:');
  console.log('   contratante: maria@demo.com / senha123');
  console.log('   profissional: joao@demo.com  / senha123');
}

run().catch(e => { console.error(e); process.exit(1); });
