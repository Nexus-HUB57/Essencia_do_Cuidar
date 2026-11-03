import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../db/driver.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyNetlify } from '../services/netlify.js';
import { recomendarParaVaga } from '../services/matching.js';
import { notificarVagaStatus } from '../services/event-bus.js';
import { buscarVagas, isFtsEnabled } from '../services/search-fts.js';

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
  regiao:               { type: 'string', max: 80 },
  regiao_uf:            { type: 'string', min: 2, max: 2 },
  cidade:               { type: 'string', max: 100 },
  carga_horaria:        { type: 'string', max: 100 }
};

/**
 * GET /api/vagas
 * Matching simplificado — apenas 2 filtros: cidade + carga_horaria
 * Outros filtros (profissional, complexidade, etc) foram removidos.
 * Paginação e ordenação mantidas.
 */
router.get('/', async (req, res) => {
  const { cidade, cargaHoraria, ordenar, limite, offset } = req.query;
  const filters = ["v.status = 'ativa'"];
  const params = [];

  // ÚNICOS 2 FILTROS DE MATCHING: cidade + carga_horaria
  if (cidade) {
    filters.push('v.cidade LIKE ?');
    params.push(`%${cidade}%`);
  }
  if (cargaHoraria) {
    filters.push('v.carga_horaria LIKE ?');
    params.push(`%${cargaHoraria}%`);
  }

  const where = 'WHERE ' + filters.join(' AND ');

  // Ordenação
  const ordenarCol = ordenar === 'remuneracao' ? 'v.remuneracao_valor' : 'v.criado_em';
  const ordenarDir = ordenar === 'antigos' ? 'ASC' : 'DESC';

  // Paginação
  const limit = Math.max(1, Math.min(Number(limite) || 100, 200));
  const off = Math.max(0, Number(offset) || 0);

  const rows = await db.all(
    `SELECT v.*, u.nome AS contratante_nome
       FROM vagas v
       JOIN users u ON u.id = v.id_contratante
       ${where}
      ORDER BY ${ordenarCol} ${ordenarDir}
      LIMIT ? OFFSET ?`,
    [...params, limit, off]
  );

  const total = await db.get(
    `SELECT COUNT(*) AS n FROM vagas v ${where}`,
    params
  );

  res.json({
    vagas: rows,
    total: total?.n || 0,
    limite: limit,
    offset: off,
    filtros_disponiveis: ['cidade', 'cargaHoraria']
  });
});

/**
 * GET /api/vagas/buscar?q=<texto>
 * Busca textual FTS (mantida — busca em servico_descricao + cidade + carga_horaria)
 */
router.get('/buscar', async (req, res) => {
  const { q, limite, offset } = req.query;
  const rows = await buscarVagas(q || '', { limite, offset });
  res.json({
    vagas: rows,
    total: rows.length,
    fts_ativo: isFtsEnabled(),
    query: q || '',
    limite: Number(limite) || 20,
    offset: Number(offset) || 0
  });
});

/**
 * GET /api/vagas/:id/recomendar
 * M1 — Matching automático: top N profissionais recomendados para uma vaga.
 * Score baseado em: cidade (peso 0.50) + carga_horaria (peso 0.50)
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
    `SELECT v.*, u.nome AS contratante_nome
       FROM vagas v JOIN users u ON u.id = v.id_contratante
      WHERE v.id = ?`,
    [id]
  );
  if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });

  // Registra view (best-effort)
  const auth = req.headers.authorization;
  let userId = null;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'dev-secret-trocar');
      userId = payload.id;
    } catch {}
  }
  try {
    await db.run('INSERT INTO vaga_visualizacoes (id_vaga, id_user) VALUES (?, ?)', [id, userId]);
  } catch {}
  let visualizacoes = 0;
  try {
    const v = await db.get('SELECT COUNT(*) AS n FROM vaga_visualizacoes WHERE id_vaga = ?', [id]);
    visualizacoes = v?.n || 0;
  } catch {}
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
         remuneracao_valor, regiao, regiao_uf, cidade, carga_horaria, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativa')`,
      [
        req.user.id, f.paciente_sexo ?? null, f.paciente_idade ?? null, f.paciente_diagnostico ?? null,
        f.complexidade, f.servico_descricao, f.profissional_desejado,
        f.jornada_horario ?? null, f.jornada_escala ?? null,
        f.tipo_contrato ?? null, f.remuneracao_tipo ?? null,
        f.remuneracao_valor ?? null, f.regiao ?? null, f.regiao_uf ?? null,
        f.cidade ?? null, f.carga_horaria ?? null
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
