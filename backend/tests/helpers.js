/**
 * Helpers compartilhados pelos testes de integração.
 *
 * Cria usuários/vagas de teste direto no banco e devolve tokens JWT
 * prontos para uso nos headers `Authorization: Bearer <token>`.
 */
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import db from '../src/db/driver.js';
import { signToken } from '../src/middleware/auth.js';

let appInstance = null;

export async function getApp() {
  if (!appInstance) appInstance = await createApp({ serveStatic: false });
  return appInstance;
}

export async function resetDb() {
  // Garante que o schema existe antes de limpar (initSchema roda no app).
  await getApp();
  await db.exec(`
    DELETE FROM mensagens;
    DELETE FROM candidaturas;
    DELETE FROM avaliacoes;
    DELETE FROM pagamentos;
    DELETE FROM push_subscriptions;
    DELETE FROM verificacao_registros;
    DELETE FROM favoritos;
    DELETE FROM reports;
    DELETE FROM vaga_visualizacoes;
    DELETE FROM vagas;
    DELETE FROM profissionais_detalhes;
    DELETE FROM stripe_connect;
    DELETE FROM users;
  `);
}

export async function createUser({
  tipo_usuario = 'contratante',
  nome = 'Teste',
  email = `teste-${Math.random().toString(36).slice(2, 8)}@demo.com`,
  senha = 'demo1234',
  is_admin = 0,
  telefone = '11999990000'
} = {}) {
  const hash = bcrypt.hashSync(senha, 4); // rounds baixos = teste rápido
  const info = await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone, is_admin)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tipo_usuario, nome, email, hash, telefone, is_admin]
  );
  const id = info.lastInsertRowid;
  if (tipo_usuario === 'profissional') {
    await db.run(
      `INSERT INTO profissionais_detalhes (id_user, especialidades, disponibilidade)
       VALUES (?, '[]', '[]')`,
      [id]
    );
  }
  const token = signToken({ id, tipo_usuario, email });
  return { id, email, senha, token, tipo_usuario, nome };
}

export function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function createVaga(contratanteId, overrides = {}) {
  const v = {
    paciente_sexo: 'F',
    paciente_idade: 78,
    paciente_diagnostico: 'Hipertensão',
    complexidade: 'baixa',
    servico_descricao: 'Cuidados domiciliares diurnos',
    profissional_desejado: 'Técnico de Enfermagem',
    jornada_horario: '08:00 às 12:00',
    jornada_escala: 'Seg a Sex',
    tipo_contrato: 'PJ',
    remuneracao_tipo: 'hora',
    remuneracao_valor: 120,
    regiao: 'São Paulo - SP',
    cidade: 'São Paulo',
    carga_horaria: '6h',
    ...overrides
  };
  const info = await db.run(
    `INSERT INTO vagas (
       id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
       complexidade, servico_descricao, profissional_desejado, jornada_horario,
       jornada_escala, tipo_contrato, remuneracao_tipo, remuneracao_valor, regiao,
       cidade, carga_horaria
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      contratanteId, v.paciente_sexo, v.paciente_idade, v.paciente_diagnostico,
      v.complexidade, v.servico_descricao, v.profissional_desejado, v.jornada_horario,
      v.jornada_escala, v.tipo_contrato, v.remuneracao_tipo, v.remuneracao_valor, v.regiao,
      v.cidade, v.carga_horaria
    ]
  );
  return { id: info.lastInsertRowid, ...v };
}

export async function api() {
  return request(await getApp());
}
