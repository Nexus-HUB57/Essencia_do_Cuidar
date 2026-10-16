import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db/index.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    const safe = `prof${req.user.id}_${Date.now()}${ext}`;
    cb(null, safe);
  }
});

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Apenas PDF, JPG ou PNG são aceitos.'));
    }
    cb(null, true);
  }
});

const router = express.Router();

const detalhesSchema = {
  registro_conselho: { type: 'string', min: 3, max: 30 },
  tipo_registro:     { type: 'enum', values: ['CRM', 'COREN', 'CREFITO', 'CRP', 'CRN', 'OUTRO'] },
  especialidades:    { type: 'array' },
  disponibilidade:   { type: 'array' },
  bio:               { type: 'string', max: 1000 }
};

/**
 * PUT /api/profissionais/me  — atualiza perfil profissional
 */
router.put('/me', authRequired, requireTipo('profissional'),
  validateBody(detalhesSchema), (req, res) => {
    const { registro_conselho, tipo_registro, especialidades, disponibilidade, bio } = req.body;
    db.prepare(`
      UPDATE profissionais_detalhes
         SET registro_conselho = COALESCE(?, registro_conselho),
             tipo_registro     = COALESCE(?, tipo_registro),
             especialidades    = COALESCE(?, especialidades),
             disponibilidade   = COALESCE(?, disponibilidade),
             bio               = COALESCE(?, bio),
             atualizado_em     = datetime('now')
       WHERE id_user = ?
    `).run(
      registro_conselho ?? null,
      tipo_registro ?? null,
      especialidades ? JSON.stringify(especialidades) : null,
      disponibilidade ? JSON.stringify(disponibilidade) : null,
      bio ?? null,
      req.user.id
    );
    const detalhes = db.prepare('SELECT * FROM profissionais_detalhes WHERE id_user = ?').get(req.user.id);
    res.json({ detalhes });
  }
);

/**
 * POST /api/profissionais/me/diploma  — upload do diploma (multipart "diploma")
 * Marca o arquivo como "pendente de verificação" — não verificamos KYC,
 * apenas exibimos selos na UI.
 */
router.post('/me/diploma', authRequired, requireTipo('profissional'),
  (req, res, next) => upload.single('diploma')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  }),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Arquivo "diploma" é obrigatório' });
    const url = `/uploads/${req.file.filename}`;
    db.prepare(`
      UPDATE profissionais_detalhes
         SET diploma_url = ?, diploma_nome_original = ?, diploma_verificado = 0,
             atualizado_em = datetime('now')
       WHERE id_user = ?
    `).run(url, req.file.originalname, req.user.id);
    const detalhes = db.prepare('SELECT * FROM profissionais_detalhes WHERE id_user = ?').get(req.user.id);
    res.json({ detalhes });
  }
);

/**
 * GET /api/profissionais/:id  — perfil público de um profissional
 * Inclui estatísticas (vagas concluídas, total de candidaturas, etc).
 */
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare(
    `SELECT id, nome, telefone, criado_em FROM users WHERE id = ? AND tipo_usuario = 'profissional'`
  ).get(id);
  if (!user) return res.status(404).json({ error: 'Profissional não encontrado' });
  const detalhes = db.prepare('SELECT * FROM profissionais_detalhes WHERE id_user = ?').get(id);

  // Stats: candidaturas totais, aceitas, vagas fechadas em que atuou
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM candidaturas WHERE id_profissional = ?) AS total_candidaturas,
      (SELECT COUNT(*) FROM candidaturas WHERE id_profissional = ? AND status_candidatura = 'aceita') AS aceitas,
      (SELECT COUNT(DISTINCT id_vaga) FROM candidaturas WHERE id_profissional = ? AND status_candidatura = 'aceita') AS vagas_aceitas
  `).get(id, id, id);

  // Vagas em que o profissional foi aceito E a vaga está fechada (= concluída)
  const concluidas = db.prepare(`
    SELECT COUNT(*) AS n
      FROM candidaturas c
      JOIN vagas v ON v.id = c.id_vaga
     WHERE c.id_profissional = ? AND c.status_candidatura = 'aceita' AND v.status = 'fechada'
  `).get(id).n;

  res.json({
    user,
    detalhes,
    stats: { ...stats, vagas_concluidas: concluidas }
  });
});

export default router;
