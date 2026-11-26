/**
 * tests/sql-dialect.test.js
 *
 * O código de rotas e serviços é escrito em dialeto SQLite e roda em
 * PostgreSQL em produção. A tradução acontece em `db/sql-dialect.js`.
 *
 * Estes testes existem porque o custo de uma tradução errada é altíssimo:
 * um `datetime('now')` que escapa vira erro 500 em produção — e o README
 * afirma "Migração para PostgreSQL em produção ✅", o que dá falsa confiança
 * justamente nos trechos que movem dinheiro.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toPostgres, PG_NOW } from '../src/db/sql-dialect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../src');

/**
 * Lista recursivamente os arquivos .js de src/.
 * @param {string} dir
 * @returns {string[]}
 */
function listarJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listarJs(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Extrai template literals e strings do código-fonte.
 * @param {string} src
 * @returns {string[]}
 */
function extrairStrings(src) {
  const out = [];
  // Template literals
  for (const m of src.matchAll(/`([^`\\]*(?:\\.[^`\\]*)*)`/g)) out.push(m[1]);
  // Strings simples com SQL
  for (const m of src.matchAll(/'([^'\n]*(?:datetime|INSERT OR IGNORE)[^'\n]*)'/gi)) out.push(m[1]);
  return out;
}

describe('sql-dialect — construções SQLite', () => {
  it("datetime('now') vira CURRENT_TIMESTAMP em UTC, no formato do SQLite", () => {
    const out = toPostgres("UPDATE x SET y = datetime('now') WHERE id = ?");
    expect(out).not.toContain('datetime(');
    expect(out).toContain("AT TIME ZONE 'UTC'");
    // O formato precisa ser byte-compatível com o SQLite: o frontend faz
    // `new Date(row.criado_em + 'Z')` e dependia de 'YYYY-MM-DD HH:MM:SS'.
    expect(out).toContain("'YYYY-MM-DD HH24:MI:SS'");
    expect(out).not.toContain('HH24:MI:SS.US');
  });

  it("datetime('now', '-24 hours') vira INTERVAL com sinal correto", () => {
    const out = toPostgres("SELECT * FROM webhook_logs WHERE criado_em > datetime('now', '-24 hours')");
    expect(out).not.toContain('datetime(');
    expect(out).toContain("INTERVAL '24 hours'");
    expect(out).toContain('CURRENT_TIMESTAMP -');
  });

  it("datetime('now', '-30 day') normaliza a unidade para o plural do PG", () => {
    const out = toPostgres("SELECT * FROM x WHERE criado_em > datetime('now', '-30 day')");
    expect(out).not.toContain('datetime(');
    expect(out).toContain("INTERVAL '30 days'");
  });

  it("datetime('now', ?) vira intervalo parametrizado", () => {
    const out = toPostgres("SELECT * FROM protocolos WHERE expira_em < datetime('now', ?)");
    expect(out).not.toContain('datetime(');
    expect(out).toContain('(?::interval)');
    expect(out).toContain('AT TIME ZONE');
  });

  it('INSERT OR IGNORE (forma VALUES) vira ON CONFLICT DO NOTHING', () => {
    const out = toPostgres(
      'INSERT OR IGNORE INTO protocolo_checkouts (id_protocolo, id_user, tipo_user) VALUES (?, ?, ?)'
    );
    expect(out).not.toMatch(/OR\s+IGNORE/i);
    expect(out).toContain('INSERT INTO protocolo_checkouts');
    expect(out).toContain('ON CONFLICT DO NOTHING');
  });

  it('INSERT OR IGNORE (forma SELECT) põe o ON CONFLICT no fim da statement', () => {
    const out = toPostgres(
      'INSERT OR IGNORE INTO vagas_fts(rowid, profissional_desejado) SELECT id, profissional_desejado FROM vagas'
    );
    expect(out).not.toMatch(/OR\s+IGNORE/i);
    expect(out).toContain('INSERT INTO vagas_fts');
    expect(out.trim().endsWith('ON CONFLICT DO NOTHING')).toBe(true);
  });

  it('SQL sem construções SQLite passa intacto', () => {
    const sql = 'SELECT id, nome FROM users WHERE tipo_usuario = ? AND id > ?';
    expect(toPostgres(sql)).toBe(sql);
  });

  it('PG_NOW produz o mesmo formato de timestamp do SQLite', () => {
    expect(PG_NOW).toContain("'YYYY-MM-DD HH24:MI:SS'");
    expect(PG_NOW).toContain("AT TIME ZONE 'UTC'");
    // Sem fração de segundo e sem offset: o SQLite devolve 'YYYY-MM-DD HH:MM:SS'
    expect(PG_NOW).not.toContain('US');
    expect(PG_NOW).not.toContain('+00');
  });
});

describe('sql-dialect — cobertura de todo o código-fonte', () => {
  const arquivos = listarJs(SRC_DIR)
    // O próprio adaptador é excluído: os literais dele são exemplos em
    // comentário, não SQL executado.
    .filter(a => !a.endsWith(path.join('db', 'sql-dialect.js')));

  it('varre todos os arquivos .js de src/ sem construções SQLite após a tradução', () => {
    const achados = [];
    for (const arquivo of arquivos) {
      const src = fs.readFileSync(arquivo, 'utf-8');
      for (const trecho of extrairStrings(src)) {
        if (!/datetime\('now'|INSERT OR IGNORE/i.test(trecho)) continue;
        const traduzido = toPostgres(trecho);
        if (/datetime\('now'/i.test(traduzido) || /INSERT\s+OR\s+IGNORE/i.test(traduzido)) {
          achados.push({
            arquivo: path.relative(SRC_DIR, arquivo),
            original: trecho.slice(0, 120),
            traduzido: traduzido.slice(0, 120)
          });
        }
      }
    }
    expect(achados).toEqual([]);
  });

  it('todo datetime("now") presente no código é traduzido', () => {
    let total = 0;
    for (const arquivo of arquivos) {
      const src = fs.readFileSync(arquivo, 'utf-8');
      total += (src.match(/datetime\('now'/g) || []).length;
    }
    // Sanidade: o código realmente usa a construção (o teste acima não
    // pode passar só porque não há nada para traduzir).
    expect(total).toBeGreaterThan(0);
  });
});
