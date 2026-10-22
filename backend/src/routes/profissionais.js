import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db/driver.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { validateRegistro } from '../services/registros.js';
import { normalize, validate, verifyWithCouncil } from '../services/registroValidator.js';
import { recomendarParaProfissional } from '../services/matching.js';

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
  bio:               { type: 'string', max: 1000 },
  uf:                { type: 'string', min: 2, max: 2 }
};

router.put('/me', authRequired, requireTipo('profissional'),
  validateBody(detalhesSchema), async (req, res) => {
    const { registro_conselho, tipo_registro, especialidades, disponibilidade, bio, uf } = req.body;

    // Normaliza o número de registro (se fornecido) para o formato canônico
    const normalized = (registro_conselho && tipo_registro)
      ? normalize(tipo_registro, registro_conselho)
      : registro_conselho;

    // Valida o formato do registro (síncrono, baseado em regex)
    let registroVerificadoAuto = 0;
    let mensagemVerificacao = null;
    if (normalized && tipo_registro) {
      // Preferimos o validador estrutural (registroValidator.js) que usa regex por conselho.
      // Mantemos o validateRegistro (services/registros.js) como fallback para UF.
      const v = validate(tipo_registro, normalized);
      if (!v.ok) {
        // Tenta o validador de UF antes de rejeitar (compat com main)
        const vUf = validateRegistro(tipo_registro, normalized, uf);
        if (!vUf.ok) {
          return res.status(400).json({ error: v.motivo === 'regex_invalido' ? vUf.motivo : v.motivo });
        }
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
        normalized ?? null,
        tipo_registro ?? null,
        especialidades ? JSON.stringify(especialidades) : null,
        disponibilidade ? JSON.stringify(disponibilidade) : null,
        bio ?? null,
        registroVerificadoAuto,
        req.user.id
      ]
    );

    // Cria entrada em verificacao_registros para auditoria
    if (normalized && tipo_registro) {
      await db.run(
        `INSERT INTO verificacao_registros
          (id_user, tipo_registro, numero_registro, uf, status, motivo, verificado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id, tipo_registro, normalized, uf || null,
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
 * POST /api/profissionais/me/verificar-registro
 *
 * Dispara a verificação estrutural do número de registro do profissional
 * logado. Hoje a validação é via regex (services/registroValidator.js),
 * mas a interface foi desenhada para que um scraper/API oficial de conselho
 * seja plugado no mesmo endpoint sem quebrar o frontend.
 *
 * Possíveis respostas:
 *   200 { verificado: true,  estado: 1, motivo: "regex_ok",       selo: "✓ Verificado" }
 *   200 { verificado: false, estado: 2, motivo: "regex_invalido", selo: "⏳ Em análise" }
 *   400 { error: "..." }                                              (dados faltando)
 *
 * Em todos os casos o estado da coluna `registro_verificado` é atualizado
 * para que a UI reflita imediatamente.
 *
 * Nota: o schema do main usa `registro_verificado` como INTEGER (0/1) — adaptamos
 * o estado 1/2 do Linha A para 1=verificado, 0=pendente (mantendo compat).
 */
router.post('/me/verificar-registro', authRequired, requireTipo('profissional'),
  async (req, res) => {
    const row = await db.get(
      'SELECT id_user, registro_conselho, tipo_registro FROM profissionais_detalhes WHERE id_user = ?',
      [req.user.id]
    );
    if (!row) return res.status(404).json({ error: 'Perfil profissional não encontrado' });
    if (!row.registro_conselho || !row.tipo_registro) {
      return res.status(400).json({
        error: 'Informe tipo_registro e registro_conselho antes de verificar.'
      });
    }

    let result;
    try {
      result = await verifyWithCouncil(row.tipo_registro, row.registro_conselho);
    } catch (err) {
      // Falha técnica: marca como pendente (0) e retorna 200 para
      // que a UI possa mostrar o selo "⏳ Em análise" sem quebrar.
      await db.run(
        `UPDATE profissionais_detalhes
            SET registro_verificado = 0,
                atualizado_em = datetime('now')
          WHERE id_user = ?`,
        [req.user.id]
      );
      return res.status(200).json({
        verificado: false,
        estado: 2,
        motivo: 'erro_consulta',
        selo: '⏳ Em análise',
        detalhe: String(err?.message || err)
      });
    }

    const estado = result.ok ? 1 : 2;
    const selo = result.ok ? '✓ Verificado' : '⏳ Em análise';
    const registroVerificadoFlag = result.ok ? 1 : 0;

    await db.run(
      `UPDATE profissionais_detalhes
          SET registro_verificado = ?,
              atualizado_em = datetime('now')
        WHERE id_user = ?`,
      [registroVerificadoFlag, req.user.id]
    );

    // Auditoria: grava a tentativa na tabela webhook_logs (reaproveita o pipeline
    // de observabilidade que já existe). Tipo="registro_verificacao".
    try {
      const payload = JSON.stringify({
        user_id: req.user.id,
        tipo_registro: row.tipo_registro,
        registro_conselho: row.registro_conselho,
        ok: result.ok,
        motivo: result.motivo
      });
      await db.run(
        `INSERT INTO webhook_logs (tipo, payload, status_code, resposta, erro)
         VALUES (?, ?, ?, ?, ?)`,
        [
          'registro_verificacao',
          payload,
          result.ok ? 200 : 422,
          JSON.stringify({ estado, selo }),
          result.ok ? null : (result.detalle || result.motivo)
        ]
      );
    } catch {
      // Não bloquear o fluxo principal se o log falhar.
    }

    res.json({
      verificado: result.ok,
      estado,
      motivo: result.motivo,
      selo,
      detalhe: result.detalle || null
    });
  }
);

/**
 * GET /api/profissionais/:id — perfil público
 * Inclui estatísticas de avaliação (média e total) do schema do main
 * (colunas id_profissional, id_contratante, id_vaga, nota).
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

  // Estatísticas de avaliação (schema do main: id_profissional, id_contratante, id_vaga, nota)
  const stats = await db.get(
    `SELECT COUNT(*) AS total, COALESCE(ROUND(AVG(nota), 1), 0) AS media
       FROM avaliacoes
      WHERE id_profissional = ?`,
    [id]
  );

  res.json({
    user,
    detalhes,
    stats: { total: stats?.total || 0, media: stats?.media || 0 }
  });
});

/**
 * GET /api/profissionais/me/recomendar
 * M1 — Matching automático: top N vagas recomendadas para o profissional logado.
 * Apenas o próprio profissional logado pode ver suas recomendações.
 * Query: limite (default 10, max 50), minScore (default 0.3)
 */
router.get('/me/recomendar', authRequired, requireTipo('profissional'), async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 10, 50);
  const minScore = Number(req.query.minScore) || 0.3;
  const result = await recomendarParaProfissional(req.user.id, { limite, minScore });
  if (!result) return res.status(404).json({ error: 'Perfil profissional não encontrado' });
  res.json(result);
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
