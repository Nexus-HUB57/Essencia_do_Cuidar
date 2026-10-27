import express from 'express';
import { createRouter } from '../middleware/async.js';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = createRouter(express);

/**
 * POST /api/favoritos
 * Body: { tipo: 'vaga' | 'profissional', id_recurso: number }
 * Toggle: se já existe, remove; senão, adiciona.
 */
router.post('/', authRequired, async (req, res) => {
  const { tipo, id_recurso } = req.body || {};
  if (!['vaga', 'profissional'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo deve ser "vaga" ou "profissional"' });
  }
  if (!Number.isInteger(id_recurso) || id_recurso <= 0) {
    return res.status(400).json({ error: 'id_recurso inválido' });
  }
  // Verifica que o recurso existe
  if (tipo === 'vaga') {
    const v = await db.get('SELECT id FROM vagas WHERE id = ?', [id_recurso]);
    if (!v) return res.status(404).json({ error: 'Vaga não encontrada' });
  } else {
    const p = await db.get(
      "SELECT id FROM users WHERE id = ? AND tipo_usuario = 'profissional'",
      [id_recurso]
    );
    if (!p) return res.status(404).json({ error: 'Profissional não encontrado' });
  }

  const existe = await db.get(
    'SELECT id FROM favoritos WHERE id_user = ? AND tipo = ? AND id_recurso = ?',
    [req.user.id, tipo, id_recurso]
  );

  if (existe) {
    await db.run('DELETE FROM favoritos WHERE id = ?', [existe.id]);
    return res.json({ favoritado: false });
  }
  await db.run(
    'INSERT INTO favoritos (id_user, tipo, id_recurso) VALUES (?, ?, ?)',
    [req.user.id, tipo, id_recurso]
  );
  res.status(201).json({ favoritado: true });
});

/**
 * GET /api/favoritos?tipo=vaga
 * Lista IDs de recursos favoritados pelo user (filtra por tipo via query).
 */
router.get('/', authRequired, async (req, res) => {
  const tipo = req.query.tipo;
  let rows;
  if (tipo === 'vaga' || tipo === 'profissional') {
    rows = await db.all(
      'SELECT id_recurso FROM favoritos WHERE id_user = ? AND tipo = ?',
      [req.user.id, tipo]
    );
  } else {
    rows = await db.all(
      'SELECT id_recurso, tipo FROM favoritos WHERE id_user = ?',
      [req.user.id]
    );
  }
  res.json({ favoritos: rows.map((r) => r.id_recurso) });
});

/**
 * GET /api/favoritos/vagas
 * Lista VAGAS favoritadas pelo user, com dados completos.
 */
router.get('/vagas', authRequired, async (req, res) => {
  const rows = await db.all(
    `SELECT v.*, u.nome AS contratante_nome
       FROM favoritos f
       JOIN vagas v ON v.id = f.id_recurso
       JOIN users u ON u.id = v.id_contratante
      WHERE f.id_user = ? AND f.tipo = 'vaga'
      ORDER BY f.criado_em DESC`,
    [req.user.id]
  );
  res.json({ vagas: rows });
});

/**
 * GET /api/favoritos/profissionais
 * Lista PROFISSIONAIS favoritados pelo user, com dados básicos.
 */
router.get('/profissionais', authRequired, async (req, res) => {
  const rows = await db.all(
    `SELECT u.id, u.nome, u.telefone,
            d.registro_conselho, d.tipo_registro, d.registro_verificado,
            d.diploma_verificado, d.especialidades, d.disponibilidade,
            (SELECT COALESCE(ROUND(AVG(nota), 1), 0) FROM avaliacoes WHERE id_profissional = u.id) AS media,
            (SELECT COUNT(*) FROM avaliacoes WHERE id_profissional = u.id) AS total_avaliacoes
       FROM favoritos f
       JOIN users u ON u.id = f.id_recurso
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE f.id_user = ? AND f.tipo = 'profissional'
      ORDER BY f.criado_em DESC`,
    [req.user.id]
  );
  for (const r of rows) {
    try { r.especialidades = JSON.parse(r.especialidades || '[]'); } catch { r.especialidades = []; }
    try { r.disponibilidade = JSON.parse(r.disponibilidade || '[]'); } catch { r.disponibilidade = []; }
  }
  res.json({ profissionais: rows });
});

export default router;