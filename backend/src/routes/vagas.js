import express from 'express';
import { createRouter } from '../middleware/async.js';
import db from '../db/driver.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyNetlify } from '../services/netlify.js';

const router = createRouter(express);

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

// Critérios de ordenação aceitos em ?ordenar=
const ORDENACOES = {
  remuneracao: 'v.remuneracao_valor',
  complexidade: 'v.complexidade',
  regiao: 'v.regiao',
  recentes: 'v.criado_em'
};

router.get('/', async (req, res) => {
  const { profissional, complexidade, regiao, remuneracaoMin, ordenar, limite, offset } = req.query;
  const filters = ["v.status = 'ativa'"];
  const params = [];

  if (profissional) { filters.push('v.profissional_desejado LIKE ?'); params.push(`%${profissional}%`); }
  if (complexidade) { filters.push('v.complexidade = ?'); params.push(complexidade); }
  if (regiao)       { filters.push('v.regiao LIKE ?');       params.push(`%${regiao}%`); }
  if (remuneracaoMin) { filters.push('v.remuneracao_valor >= ?'); params.push(Number(remuneracaoMin)); }

  // Ordenação — whitelist para não permitir injeção via nome de coluna
  const colunaOrdem = ORDENACOES[ordenar] || 'v.criado_em';
  const direcao = String(req.query.dir || (ordenar === 'remuneracao' ? 'DESC' : 'DESC')).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // LIMIT/OFFSET — clamp para evitar abuse
  const lim = Math.min(Math.max(parseInt(limite, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);

  const where = 'WHERE ' + filters.join(' AND ');
  const rows = await db.all(
    `SELECT v.*, u.nome AS contratante_nome
       FROM vagas v
       JOIN users u ON u.id = v.id_contratante
       ${where}
      ORDER BY ${colunaOrdem} ${direcao}, v.id DESC
      LIMIT ? OFFSET ?`,
    [...params, lim, off]
  );
  res.json({ vagas: rows, total: rows.length, limite: lim, offset: off, ordenado_por: ordenar || 'recentes' });
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

  // Registra view
  const auth = req.headers.authorization;
  let userId = null;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'dev-secret-trocar');
      userId = payload.id;
    } catch {}
  }
  await db.run('INSERT INTO vaga_visualizacoes (id_vaga, id_user) VALUES (?, ?)', [id, userId]);

  const visRow = await db.get('SELECT COUNT(*) AS n FROM vaga_visualizacoes WHERE id_vaga = ?', [id]);
  const visualizacoes = visRow?.n || 0;
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
    notifyNetlify('vaga_criada', { vaga_id: vaga.id, contratante_id: req.user.id });
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
    await db.run('UPDATE vagas SET status = ? WHERE id = ?', [req.body.status, id]);
    const updated = await db.get('SELECT * FROM vagas WHERE id = ?', [id]);
    res.json({ vaga: updated });
  }
);

export default router;
