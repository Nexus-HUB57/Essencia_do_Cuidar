import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { uploadForUser, uploadErrorHandler } from '../middleware/upload.js';
import { json } from '../middleware/body.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '..', 'uploads');

const router = Router();

function parseJSON(col) {
  if (!col) return null;
  try { return JSON.parse(col); } catch { return null; }
}

// GET /api/profissionais/me  -> meu perfil detalhado
router.get('/me', authRequired, requireRole('profissional'), (req, res) => {
  const u = db.prepare(`
    SELECT u.id, u.nome, u.email, u.telefone,
           p.diploma_url, p.diploma_original_name, p.diploma_uploaded_at,
           p.registro_conselho, p.registro_conselho_url,
           p.registro_conselho_original_name, p.registro_conselho_uploaded_at,
           p.especialidades, p.disponibilidade
    FROM users u
    LEFT JOIN profissionais_detalhes p ON p.id_user = u.id
    WHERE u.id = ?
  `).get(req.user.id);
  if (!u) return res.status(404).json({ error: 'perfil não encontrado' });
  res.json({
    ...u,
    especialidades: parseJSON(u.especialidades) || [],
    disponibilidade: parseJSON(u.disponibilidade) || {},
  });
});

// PUT /api/profissionais/me  -> atualizar dados textuais
router.put('/me', authRequired, requireRole('profissional'), json, (req, res) => {
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

// PUT /api/profissionais/me/documentos  -> upload avulso de um documento
// Body: multipart com campo "arquivo" e campo texto "tipo" = "diploma" | "registro_conselho"
router.put(
  '/me/documentos',
  authRequired,
  requireRole('profissional'),
  (req, res, next) => uploadForUser(req, res, (err) => err ? uploadErrorHandler(err, req, res, next) : next()),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'arquivo não enviado' });
    const tipo = String(req.body?.tipo || '').toLowerCase();
    if (!['diploma', 'registro_conselho'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo deve ser "diploma" ou "registro_conselho"' });
    }

    const newUrl = `/uploads/${req.user.id}/${path.basename(req.file.path)}`;
    const originalName = req.file.originalname;
    const uploadedAt = new Date().toISOString();

    if (tipo === 'diploma') {
      db.prepare(`UPDATE profissionais_detalhes
                  SET diploma_url = ?, diploma_original_name = ?, diploma_uploaded_at = ?
                  WHERE id_user = ?`).run(newUrl, originalName, uploadedAt, req.user.id);
    } else {
      db.prepare(`UPDATE profissionais_detalhes
                  SET registro_conselho_url = ?, registro_conselho_original_name = ?, registro_conselho_uploaded_at = ?
                  WHERE id_user = ?`).run(newUrl, originalName, uploadedAt, req.user.id);
    }

    res.json({ ok: true, tipo, url: newUrl, originalName, uploadedAt });
  }
);

// GET /api/profissionais/:id  -> perfil público (para contratante ver candidato)
router.get('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare(`
    SELECT u.id, u.nome, u.telefone,
           p.registro_conselho,
           p.registro_conselho_url, p.registro_conselho_original_name, p.registro_conselho_uploaded_at,
           p.diploma_url, p.diploma_original_name, p.diploma_uploaded_at,
           p.especialidades, p.disponibilidade
    FROM users u
    LEFT JOIN profissionais_detalhes p ON p.id_user = u.id
    WHERE u.id = ? AND u.tipo_usuario = 'profissional'
  `).get(id);
  if (!u) return res.status(404).json({ error: 'profissional não encontrado' });

  // Resumo de avaliações (média + total) para exibir no perfil
  const stats = db.prepare(`
    SELECT COUNT(*) AS total, AVG(nota) AS media
    FROM avaliacoes WHERE id_profissional = ?
  `).get(id);

  res.json({
    ...u,
    especialidades: parseJSON(u.especialidades) || [],
    disponibilidade: parseJSON(u.disponibilidade) || {},
    // boolean helpers pro front mostrar selos
    documentos: {
      diploma: !!u.diploma_url,
      registro_conselho: !!u.registro_conselho_url,
    },
    avaliacao: {
      total: stats.total || 0,
      media: stats.media ? Number(Number(stats.media).toFixed(2)) : 0,
    },
  });
});

export default router;
