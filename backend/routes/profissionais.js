import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/profissionais/me  -> meu perfil detalhado
router.get('/me', authRequired, requireRole('profissional'), (req, res) => {
  const u = db.prepare(`
    SELECT u.id, u.nome, u.email, u.telefone,
           p.diploma_url, p.registro_conselho, p.especialidades, p.disponibilidade
    FROM users u
    LEFT JOIN profissionais_detalhes p ON p.id_user = u.id
    WHERE u.id = ?
  `).get(req.user.id);
  if (!u) return res.status(404).json({ error: 'perfil não encontrado' });
  res.json({
    ...u,
    especialidades: u.especialidades ? JSON.parse(u.especialidades) : [],
    disponibilidade: u.disponibilidade ? JSON.parse(u.disponibilidade) : {},
  });
});

// PUT /api/profissionais/me  -> atualizar perfil
router.put('/me', authRequired, requireRole('profissional'), (req, res) => {
  const { diploma_url, registro_conselho, especialidades, disponibilidade } = req.body || {};
  db.prepare(`
    UPDATE profissionais_detalhes
    SET diploma_url = COALESCE(?, diploma_url),
        registro_conselho = COALESCE(?, registro_conselho),
        especialidades = COALESCE(?, especialidades),
        disponibilidade = COALESCE(?, disponibilidade)
    WHERE id_user = ?
  `).run(
    diploma_url ?? null,
    registro_conselho ?? null,
    especialidades ? JSON.stringify(especialidades) : null,
    disponibilidade ? JSON.stringify(disponibilidade) : null,
    req.user.id
  );
  res.json({ ok: true });
});

// GET /api/profissionais/:id  -> perfil público (para contratante ver candidato)
router.get('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare(`
    SELECT u.id, u.nome, u.telefone,
           p.registro_conselho, p.especialidades, p.disponibilidade
    FROM users u
    LEFT JOIN profissionais_detalhes p ON p.id_user = u.id
    WHERE u.id = ? AND u.tipo_usuario = 'profissional'
  `).get(id);
  if (!u) return res.status(404).json({ error: 'profissional não encontrado' });
  res.json({
    ...u,
    especialidades: u.especialidades ? JSON.parse(u.especialidades) : [],
    disponibilidade: u.disponibilidade ? JSON.parse(u.disponibilidade) : {},
  });
});

export default router;
