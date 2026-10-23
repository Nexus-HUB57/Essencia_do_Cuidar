import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../db/driver.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyNetlify } from '../services/netlify.js';
import { recomendarParaVaga } from '../services/matching.js';
import { notificarVagaStatus } from '../services/event-bus.js';

const router = express.Router();

const vagaSchema = {
  paciente_sexo:        { type: 'enum', values: ['M', 'F', 'Outro'] },
  paciente_idade:       { type: 'integer', min: 0, max: 130 },
  paciente_diagnostico: { type: 'string', max: 500 },
  complexidade:         { required: true, type: 'enum', values: ['baixa', 'media'] },
  servico_descricao:    { required: true, type: 'string', min: 10, max: 2000 },
  profissional_desejado:{ required: true, type: 'string', min: 2, max: 80 },
  jornada_horario:      { type: 'string', max: 80 },
  jornada_escala:       { type: 'string', max: 80 },
  tipo_contrato:        { type: 'enum', values: ['PJ', 'CLT'] },
  remuneracao_tipo:     { type: 'enum', values: ['plantao', 'hora'] },
  remuneracao_valor:    { type: 'number', min: 0 },
  regiao:               { type: 'string', max: 80 }
};

router.get('/', async (req, res) => {
  // M4 — filtros de matching expandidos (8 filtros no total):
  //   profissional, complexidade, regiao, remuneracaoMin (originais)
  //   + tipoContrato, remuneracaoTipo, jornadaEscala, ordenar, limite, offset
  const {
    profissional, complexidade, regiao, remuneracaoMin,
    tipoContrato, remuneracaoTipo, jornadaEscala,
    ordenar, limite, offset
  } = req.query;
  const filters = ["v.status = 'ativa'"];
  const params = [];

  if (profissional)     { filters.push('v.profissional_desejado LIKE ?'); params.push(`%${profissional}%`); }
  if (complexidade)     { filters.push('v.complexidade = ?'); params.push(complexidade); }
  if (regiao)           { filters.push('v.regiao LIKE ?'); params.push(`%${regiao}%`); }
  if (remuneracaoMin)   { filters.push('v.remuneracao_valor >= ?'); params.push(Number(remuneracaoMin)); }
  if (tipoContrato)     { filters.push('v.tipo_contrato = ?'); params.push(tipoContrato); }
  if (remuneracaoTipo)  { filters.push('v.remuneracao_tipo = ?'); params.push(remuneracaoTipo); }
  if (jornadaEscala)    { filters.push('v.jornada_escala LIKE ?'); params.push(`%${jornadaEscala}%`); }

  const where = 'WHERE ' + filters.join(' AND ');

  // M4 — ordenação configurável (default: criado_em DESC)
  const ordenarCol = {
    remuneracao: 'v.remuneracao_valor',
    recentes: 'v.criado_em',
    antigos: 'v.criado_em'
  }[ordenar] || 'v.criado_em';
  const ordenarDir = ordenar === 'antigos' ? 'ASC' : 'DESC';
  // valida coluna — não permite injeção SQL
  const colunasPermitidas = ['v.remuneracao_valor', 'v.criado_em'];
  const colFinal = colunasPermitidas.includes(ordenarCol) ? ordenarCol : 'v.criado_em';

  // Paginação: default 100, max 200, min 1
  const limit = Math.max(1, Math.min(Number(limite) || 100, 200));
  const off = Math.max(0, Number(offset) || 0);

  const rows = await db.all(
    `SELECT v.*, u.nome AS contratante_nome
       FROM vagas v
       JOIN users u ON u.id = v.id_contratante
       ${where}
      ORDER BY ${colFinal} ${ordenarDir}
      LIMIT ? OFFSET ?`,
    [...params, limit, off]
  );

  // Total (para cliente poder paginar)
  const total = await db.get(
    `SELECT COUNT(*) AS n FROM vagas v ${where}`,
    params
  );

  res.json({
    vagas: rows,
    total: total?.n || 0,
    limite: limit,
    offset: off
  });
});

/**
 * GET /api/vagas/:id/recomendar
 * M1 — Matching automático: top N profissionais recomendados para uma vaga.
 * Public (qualquer contratante logado pode ver recomendações para suas vagas).
 * Query: limite (default 10, max 50), minScore (default 0.3)
 */
router.get('/:id/recomendar', authRequired, requireTipo('contratante'), async (req, res) => {
  const id = Number(req.params.id);
  const vaga = await db.get('SELECT id, id_contratante, status FROM vagas WHERE id = ?', [id]);
  if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
  if (vaga.id_contratante !== req.user.id) {
    return res.status(403).json({ error: 'Você não é dono desta vaga' });
  }
  const limite = Math.min(Number(req.query.limite) || 10, 50);
  const minScore = Number(req.query.minScore) || 0.3;
  const result = await recomendarParaVaga(id, { limite, minScore });
  res.json(result);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const vaga = await db.get(
    `SELECT v.*, u.nome AS contratante_nome, u.telefone AS contratante_telefone
       FROM vagas v JOIN users u ON u.id = v.id_contratante
      WHERE v.id = ?`,
    [id]
  );
  if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });

  // Registra view (best-effort — se a tabela não existir, ignora)
  const auth = req.headers.authorization;
  let userId = null;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'dev-secret-trocar');
      userId = payload.id;
    } catch {}
  }
  try {
    await db.run(
      'INSERT INTO vaga_visualizacoes (id_vaga, id_user) VALUES (?, ?)',
      [id, userId]
    );
  } catch {
    // tabela pode não existir em alguns ambientes — best-effort
  }

  let visualizacoes = 0;
  try {
    const v = await db.get(
      'SELECT COUNT(*) AS n FROM vaga_visualizacoes WHERE id_vaga = ?',
      [id]
    );
    visualizacoes = v?.n || 0;
  } catch {
    // tabela pode não existir
  }
  res.json({ vaga, visualizacoes });
});

router.post('/', authRequired, requireTipo('contratante'),
  validateBody(vagaSchema), async (req, res) => {
    const f = req.body;
    const info = await db.run(
      `INSERT INTO vagas
        (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
         complexidade, servico_descricao, profissional_desejado,
         jornada_horario, jornada_escala, tipo_contrato, remuneracao_tipo,
         remuneracao_valor, regiao, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativa')`,
      [
        req.user.id, f.paciente_sexo ?? null, f.paciente_idade ?? null, f.paciente_diagnostico ?? null,
        f.complexidade, f.servico_descricao, f.profissional_desejado,
        f.jornada_horario ?? null, f.jornada_escala ?? null,
        f.tipo_contrato ?? null, f.remuneracao_tipo ?? null,
        f.remuneracao_valor ?? null, f.regiao ?? null
      ]
    );
    const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [info.lastInsertRowid]);
    notifyNetlify('vaga_criada', { vaga_id: vaga.id, contratante_id: req.user.id }).catch(e => console.warn('[webhook]', e.message));
    res.status(201).json({ vaga });
  }
);

router.get('/contratante/minhas', authRequired, requireTipo('contratante'), async (req, res) => {
  const rows = await db.all(
    'SELECT * FROM vagas WHERE id_contratante = ? ORDER BY criado_em DESC',
    [req.user.id]
  );
  const enriched = [];
  for (const v of rows) {
    const c = await db.get('SELECT COUNT(*) AS n FROM candidaturas WHERE id_vaga = ?', [v.id]);
    enriched.push({ ...v, total_candidatos: c.n });
  }
  res.json({ vagas: enriched });
});

router.patch('/:id/status', authRequired, requireTipo('contratante'),
  validateBody({ status: { required: true, type: 'enum', values: ['ativa', 'pausada', 'fechada'] } }),
  async (req, res) => {
    const id = Number(req.params.id);
    const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [id]);
    if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
    if (vaga.id_contratante !== req.user.id) {
      return res.status(403).json({ error: 'Você não é dono desta vaga' });
    }
    const statusAnterior = vaga.status;
    await db.run('UPDATE vagas SET status = ? WHERE id = ?', [req.body.status, id]);
    const updated = await db.get('SELECT * FROM vagas WHERE id = ?', [id]);

    // W5 — Notifica interessados (favoritaram + candidatos pendentes) via Socket.IO + Push
    if (statusAnterior !== req.body.status) {
      notificarVagaStatus({
        vaga_id: id,
        status_anterior: statusAnterior,
        status_novo: req.body.status,
        contratante_id: req.user.id
      }).catch(e => console.warn('[event-bus]', e.message));
    }

    res.json({ vaga: updated });
  }
);

export default router;
