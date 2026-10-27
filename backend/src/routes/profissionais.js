import express from 'express';
import { createRouter } from '../middleware/async.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db/driver.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { validateRegistro } from '../services/registros.js';

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

const router = createRouter(express);

const detalhesSchema = {
  registro_conselho: { type: 'string', min: 3, max: 30 },
  tipo_registro:     { type: 'enum', values: ['CRM', 'COREN', 'CREFITO', 'CRP', 'CRN', 'OUTRO'] },
  especialidades:    { type: 'array' },
  disponibilidade:   { type: 'array' },
  bio:               { type: 'string', max: 1000 },
  uf:                { type: 'string', min: 2, max: 2 }
};

router.put('/me', authRequired, requireTipo('profissional'),
  validateBody(detalhesSchema), async (req, res) => {
    const { registro_conselho, tipo_registro, especialidades, disponibilidade, bio, uf } = req.body;

    // Se mudou registro, valida formato + agenda verificação
    let registroVerificadoAuto = 0;
    let mensagemVerificacao = null;
    if (registro_conselho && tipo_registro) {
      const v = validateRegistro(tipo_registro, registro_conselho, uf);
      if (!v.ok) {
        return res.status(400).json({ error: v.motivo });
      }
      // Auto-aprova só em modo dev (sem API externa)
      if (process.env.AUTO_VERIFICAR_REGISTROS === 'true') {
        registroVerificadoAuto = 1;
        mensagemVerificacao = 'Aprovado automaticamente (modo dev).';
      }
    }

    await db.run(
      `UPDATE profissionais_detalhes
          SET registro_conselho = COALESCE(?, registro_conselho),
              tipo_registro     = COALESCE(?, tipo_registro),
              especialidades    = COALESCE(?, especialidades),
              disponibilidade   = COALESCE(?, disponibilidade),
              bio               = COALESCE(?, bio),
              registro_verificado = ?,
              atualizado_em     = datetime('now')
        WHERE id_user = ?`,
      [
        registro_conselho ?? null,
        tipo_registro ?? null,
        especialidades ? JSON.stringify(especialidades) : null,
        disponibilidade ? JSON.stringify(disponibilidade) : null,
        bio ?? null,
        registroVerificadoAuto,
        req.user.id
      ]
    );

    // Cria entrada em verificacao_registros para auditoria
    if (registro_conselho && tipo_registro) {
      await db.run(
        `INSERT INTO verificacao_registros
          (id_user, tipo_registro, numero_registro, uf, status, motivo, verificado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id, tipo_registro, registro_conselho, uf || null,
          registroVerificadoAuto ? 'aprovado' : 'pendente',
          mensagemVerificacao,
          registroVerificadoAuto ? new Date().toISOString() : null
        ]
      );
    }

    const detalhes = await db.get('SELECT * FROM profissionais_detalhes WHERE id_user = ?', [req.user.id]);
    res.json({ detalhes });
  }
);

router.post('/me/diploma', authRequired, requireTipo('profissional'),
  (req, res, next) => upload.single('diploma')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  }),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Arquivo "diploma" é obrigatório' });
    const url = `/uploads/${req.file.filename}`;
    await db.run(
      `UPDATE profissionais_detalhes
          SET diploma_url = ?, diploma_nome_original = ?, diploma_verificado = 0,
              atualizado_em = datetime('now')
        WHERE id_user = ?`,
      [url, req.file.originalname, req.user.id]
    );
    const detalhes = await db.get('SELECT * FROM profissionais_detalhes WHERE id_user = ?', [req.user.id]);
    res.json({ detalhes });
  }
);

/**
 * GET /api/profissionais/:id — perfil público
 */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const user = await db.get(
    `SELECT id, nome, telefone, criado_em FROM users WHERE id = ? AND tipo_usuario = 'profissional'`,
    [id]
  );
  if (!user) return res.status(404).json({ error: 'Profissional não encontrado' });
  const detalhes = await db.get('SELECT * FROM profissionais_detalhes WHERE id_user = ?', [id]);
  if (detalhes) {
    try { detalhes.especialidades = JSON.parse(detalhes.especialidades || '[]'); } catch { detalhes.especialidades = []; }
    try { detalhes.disponibilidade = JSON.parse(detalhes.disponibilidade || '[]'); } catch { detalhes.disponibilidade = []; }
  }
  res.json({ user, detalhes });
});

/**
 * GET /api/profissionais/:id/verificacoes — histórico de verificações
 */
router.get('/:id/verificacoes', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.id !== id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const rows = await db.all(
    `SELECT v.*, a.nome AS verificado_por_nome
       FROM verificacao_registros v
       LEFT JOIN users a ON a.id = v.verificado_por
      WHERE v.id_user = ?
      ORDER BY v.criado_em DESC`,
    [id]
  );
  res.json({ verificacoes: rows });
});

export default router;
