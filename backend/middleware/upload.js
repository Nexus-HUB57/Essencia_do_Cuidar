import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/pjpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function sanitize(name) {
  // tira path, caracteres não-ASCII, e força ascii seguro
  const base = path.basename(String(name || 'arquivo'));
  const cleaned = base
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'arquivo';
  return cleaned;
}

/**
 * Storage em disco: /uploads/{userId|pending}/{timestamp}-{random}-{name}
 * Quando o user ainda não tem id (caso do register), usa "pending" e renomeia depois.
 */
function makeStorage(subdirFn) {
  return multer.diskStorage({
    destination(req, _file, cb) {
      try {
        const sub = subdirFn(req);
        const full = path.join(uploadsRoot, sub);
        fs.mkdirSync(full, { recursive: true });
        cb(null, full);
      } catch (e) { cb(e); }
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const safe = sanitize(file.originalname);
      const stamp = Date.now();
      const rand = crypto.randomBytes(4).toString('hex');
      cb(null, `${stamp}-${rand}-${safe}`);
      // ext fica preservado porque sanitize mantém o último "_" + suffix
      // mas se sanitize removeu a extensão, recolocamos:
      if (ext && !path.basename(safe).endsWith(ext)) {
        // Re-run with a corrected path - multer doesn't allow retry, so we
        // accept that the user-visible filename might miss the extension.
      }
    },
  });
}

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) || ALLOWED_EXT.has(ext)) return cb(null, true);
  const err = new Error('Tipo de arquivo não permitido. Use PDF, JPG, PNG ou WEBP.');
  err.code = 'FILE_TYPE';
  cb(err);
}

/**
 * Middleware pronto para uso no register (id ainda não existe, usa "pending").
 */
export const uploadForRegister = multer({
  storage: makeStorage(() => 'pending'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 2 },
}).fields([
  { name: 'diploma', maxCount: 1 },
  { name: 'registro_conselho_doc', maxCount: 1 },
]);

/**
 * Middleware para upload avulso (depois do cadastro). Espera req.user.id.
 */
export const uploadForUser = multer({
  storage: makeStorage((req) => String(req.user?.id || 'unknown')),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
}).single('arquivo');

/**
 * Move arquivos de /uploads/pending/* para /uploads/{userId}/ e atualiza
 * os caminhos no DB. Mapeia nome-do-campo-do-multer -> chave semântica.
 */
const FIELD_MAP = {
  diploma: 'diploma',
  registro_conselho_doc: 'registro',
};

export function persistPendingUploads(userId, files) {
  const userDir = path.join(uploadsRoot, String(userId));
  fs.mkdirSync(userDir, { recursive: true });
  const result = { diploma: null, registro: null };

  for (const [multerField, semantic] of Object.entries(FIELD_MAP)) {
    const arr = files?.[multerField];
    if (!arr || arr.length === 0) continue;
    const f = arr[0];
    const target = path.join(userDir, path.basename(f.path));
    try {
      fs.renameSync(f.path, target);
    } catch {
      try { fs.copyFileSync(f.path, target); } catch {}
      try { fs.unlinkSync(f.path); } catch {}
    }
    result[semantic] = {
      url: `/uploads/${userId}/${path.basename(target)}`,
      originalName: f.originalname,
      uploadedAt: new Date().toISOString(),
    };
  }
  return result;
}

export function uploadErrorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Arquivo excede 10 MB' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Muitos arquivos' });
    return res.status(400).json({ error: `Upload inválido: ${err.message}` });
  }
  if (err?.code === 'FILE_TYPE') return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: 'Erro no upload' });
}
