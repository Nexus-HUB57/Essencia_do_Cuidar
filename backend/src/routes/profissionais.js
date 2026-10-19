import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db/index.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { verificarRegistro, verificarEClassificar, CONSELHOS_SUPORTADOS } from '../services/conselhos/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    const safe = `prof${req.user.id}_${Date.now()}${ext}`;
    cb(null, safe);
  }
});

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error("Apenas PDF, JPG ou PNG são aceitos."));
    }
    cb(null, true);
  }
});

const router = express.Router();

const detalhesSchema = {
  registro_conselho: { type: "string", min: 3, max: 30 },
  tipo_registro:     { type: "enum", values: ["CRM", "COREN", "CREFITO", "CRP", "CRN", "OUTRO"] },
  especialidades:    { type: "array" },
  disponibilidade:   { type: "array" },
  bio:               { type: "string", max: 1000 }
};

/**
 * PUT /api/profissionais/me  — atualiza perfil profissional
 */
router.put("/me", authRequired, requireTipo("profissional"),
  validateBody(detalhesSchema), (req, res) => {
    const { registro_conselho, tipo_registro, especialidades, disponibilidade, bio } = req.body;
    // Normaliza o número de registro (se fornecido) para o formato canônico.
    const normalized = normalize(tipo_registro, registro_conselho);
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
      normalized ?? null,
      tipo_registro ?? null,
      especialidades ? JSON.stringify(especialidades) : null,
      disponibilidade ? JSON.stringify(disponibilidade) : null,
      bio ?? null,
      req.user.id
    );
    const detalhes = db.prepare("SELECT * FROM profissionais_detalhes WHERE id_user = ?").get(req.user.id);
    res.json({ detalhes });
  }
);

/**
 * POST /api/profissionais/me/diploma  — upload do diploma (multipart "diploma")
 * Marca o arquivo como "pendente de verificação" — não verificamos KYC,
 * apenas exibimos selos na UI.
 */
router.post("/me/diploma", authRequired, requireTipo("profissional"),
  (req, res, next) => upload.single("diploma")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  }),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo \"diploma\" é obrigatório" });
    const url = `/uploads/${req.file.filename}`;
    db.prepare(`
      UPDATE profissionais_detalhes
         SET diploma_url = ?, diploma_nome_original = ?, diploma_verificado = 0,
             atualizado_em = datetime('now')
       WHERE id_user = ?
    `).run(url, req.file.originalname, req.user.id);
    const detalhes = db.prepare("SELECT * FROM profissionais_detalhes WHERE id_user = ?").get(req.user.id);
    res.json({ detalhes });
  }
);

/**
 * POST /api/profissionais/me/verificar-registro
 *
 * Dispara a verificação estrutural do número de registro do profissional
 * logado. Hoje a validação é via regex (ver services/registroValidator.js),
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
 */
router.post("/me/verificar-registro", authRequired, requireTipo("profissional"),
  async (req, res) => {
    const row = db.prepare(
      "SELECT id_user, registro_conselho, tipo_registro FROM profissionais_detalhes WHERE id_user = ?"
    ).get(req.user.id);
    if (!row) return res.status(404).json({ error: "Perfil profissional não encontrado" });
    if (!row.registro_conselho || !row.tipo_registro) {
      return res.status(400).json({
        error: "Informe tipo_registro e registro_conselho antes de verificar."
      });
    }

    let result;
    try {
      result = await verifyWithCouncil(row.tipo_registro, row.registro_conselho);
    } catch (err) {
      // Falha tecnica: marca como "em analise" (estado 2) e retorna 200 para
      // que a UI possa mostrar o selo "⏳ Em analise" sem quebrar.
      db.prepare(`
        UPDATE profissionais_detalhes
           SET registro_verificado = 2,
               registro_verificado_em = datetime('now'),
               atualizado_em = datetime('now')
         WHERE id_user = ?
      `).run(req.user.id);
      return res.status(200).json({
        verificado: false,
        estado: 2,
        motivo: "erro_consulta",
        selo: "⏳ Em análise",
        detalhe: String(err?.message || err)
      });
    }

    const estado = result.ok ? 1 : 2;
    const selo = result.ok ? "✓ Verificado" : "⏳ Em análise";

    db.prepare(`
      UPDATE profissionais_detalhes
         SET registro_verificado = ?,
             registro_verificado_em = datetime('now'),
             atualizado_em = datetime('now')
       WHERE id_user = ?
    `).run(estado, req.user.id);

    // Auditoria simples: grava a tentativa na tabela webhook_logs (reaproveita
    // o pipeline de observabilidade que ja existe). Tipo="registro_verificacao".
    try {
      const payload = JSON.stringify({
        user_id: req.user.id,
        tipo_registro: row.tipo_registro,
        registro_conselho: row.registro_conselho,
        ok: result.ok,
        motivo: result.motivo
      });
      db.prepare(`
        INSERT INTO webhook_logs (tipo, payload, status_code, resposta, erro, criado_em)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(
        "registro_verificacao",
        payload,
        result.ok ? 200 : 422,
        JSON.stringify({ estado, selo }),
        result.ok ? null : (result.detalle || result.motivo)
      );
    } catch (_) {
      // Nao bloquear o fluxo principal se o log falhar.
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
 * GET /api/profissionais/:id  — perfil público de um profissional
 * Inclui estatísticas de avaliação (média e total).
 */
router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare(
    `SELECT id, nome, telefone, criado_em FROM users WHERE id = ? AND tipo_usuario = 'profissional'`
  ).get(id);
  if (!user) return res.status(404).json({ error: "Profissional não encontrado" });
  const detalhes = db.prepare("SELECT * FROM profissionais_detalhes WHERE id_user = ?").get(id);
  // Parse JSON
  if (detalhes) {
    try { detalhes.especialidades = JSON.parse(detalhes.especialidades || "[]"); } catch { detalhes.especialidades = []; }
    try { detalhes.disponibilidade = JSON.parse(detalhes.disponibilidade || "[]"); } catch { detalhes.disponibilidade = []; }
  }
  // Estatisticas de avaliacao (somente as que o profissional recebeu de contratantes)
  const stats = db.prepare(`
    SELECT COUNT(*) AS total, ROUND(AVG(nota), 1) AS media
      FROM avaliacoes
     WHERE id_avaliado = ? AND avaliador_tipo = 'contratante'
  `).get(id);
  res.json({
    user,
    detalhes,
    stats: { total: stats?.total || 0, media: stats?.media || 0 }
  });
});

/**
 * POST /api/profissionais/me/verificar-registro
 *
 * Dispara a verificação automática do registro de conselho do
 * profissional logado. Sempre devolve 200 com o resultado (mesmo
 * que "não encontrado" — esse é o caminho feliz quando o conselho
 * não tem API pública). Apenas 4xx para problemas de input/auth.
 *
 * Body: { conselho: 'CRM'|'COREN'|'CREFITO'|'CRP'|'CRN', registro: 'CRM-SP 123456' }
 *
 * Effects:
 *   - Atualiza `profissionais_detalhes.verificacao_status` (e campos
 *     correlatos) com base no retorno.
 *   - Insere uma linha em `verificacao_logs` para auditoria.
 */
router.post('/me/verificar-registro', authRequired, requireTipo('profissional'), async (req, res) => {
  const { conselho, registro } = req.body || {};
  if (!conselho || !registro) {
    return res.status(400).json({ error: 'Campos conselho e registro são obrigatórios' });
  }
  const tipo = String(conselho).toUpperCase();
  if (!CONSELHOS_SUPORTADOS.includes(tipo)) {
    return res.status(400).json({
      error: `Conselho não suportado. Suportados: ${CONSELHOS_SUPORTADOS.join(', ')}`
    });
  }

  const resultado = await verificarEClassificar(tipo, String(registro));
  const agora = new Date().toISOString();

  // Atualiza o detalhe
  db.prepare(`
    UPDATE profissionais_detalhes
       SET verificacao_status  = ?,
           verificacao_fonte   = ?,
           verificacao_observacao = ?,
           verificado_em       = ?,
           registro_verificado = ?,
           atualizado_em       = datetime('now')
     WHERE id_user = ?
  `).run(
    resultado.status,
    resultado.fonte,
    resultado.observacao,
    agora,
    resultado.status === 'verificado_auto' ? 1 : 0,
    req.user.id
  );

  // Log de auditoria
  db.prepare(`
    INSERT INTO verificacao_logs (id_profissional, conselho, registro_conselho, resultado_encontrado, resultado_json, fonte)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    tipo,
    String(registro),
    resultado.dados?.encontrado ? 1 : 0,
    JSON.stringify(resultado.dados || {}),
    resultado.fonte
  );

  // Retorna o detalhe atualizado
  const detalhes = db.prepare('SELECT * FROM profissionais_detalhes WHERE id_user = ?').get(req.user.id);
  res.json({
    status: resultado.status,
    fonte: resultado.fonte,
    observacao: resultado.observacao,
    detalhes
  });
});

/**
 * GET /api/profissionais/me/verificacao-logs
 *
 * Lista o histórico de tentativas de verificação do profissional logado.
 */
router.get('/me/verificacao-logs', authRequired, requireTipo('profissional'), (req, res) => {
  const rows = db.prepare(`
    SELECT id, conselho, registro_conselho, resultado_encontrado, fonte, criado_em
      FROM verificacao_logs
     WHERE id_profissional = ?
     ORDER BY criado_em DESC
     LIMIT 50
  `).all(req.user.id);
  res.json({ logs: rows });
});

export default router;
