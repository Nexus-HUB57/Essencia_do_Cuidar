/**
 * tests/i18n-dicionario.test.js
 *
 * Garante que toda chave de tradução USADA no frontend exista de fato no
 * dicionário — e que os três idiomas tenham exatamente as mesmas chaves.
 *
 * POR QUE ISSO EXISTE
 *
 * Em novembro/2026 um merge conflitto sobrescreveu os arquivos
 * `frontend/src/i18n/locales/*.json` e derrubou 139 chaves que o código
 * usava. O sintoma na tela: o usuário lia "publicVagas.title2" e
 * "profissionais.back" no lugar do texto — nenhuma suíte pegou, porque
 * `tsc` não valida chaves de i18n e o build passa bem.
 *
 * Esta verificação é barata e pega a classe inteira do bug: chave usada
 * no código e ausente no dicionário.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_SRC = path.join(REPO_ROOT, 'frontend', 'src');
const LOCALES_DIR = path.join(FRONTEND_SRC, 'i18n', 'locales');
const IDIOMAS = ['pt-BR', 'es', 'en'];

/** Todos os arquivos .ts/.tsx do frontend (fora os dicionários). */
function arquivosFrontend(dir = FRONTEND_SRC) {
  const out = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'locales') continue;
      out.push(...arquivosFrontend(p));
    } else if (/\.tsx?$/.test(entrada.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Carrega um dicionário como árvore simples. */
function carregarDicionario(idioma) {
  const p = path.join(LOCALES_DIR, `${idioma}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/** Achata o dicionário em "secao.sub.chave" → valor. */
function achatar(obj, prefixo = '') {
  const saida = new Map();
  for (const [k, v] of Object.entries(obj)) {
    const chave = prefixo ? `${prefixo}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of achatar(v, chave)) saida.set(k2, v2);
    } else {
      saida.set(chave, v);
    }
  }
  return saida;
}

/**
 * Extrai as chaves de tradução referenciadas no código.
 *
 *   t('secao.chave')      → literal
 *   t(`secao.${variavel}`) → prefixo dinâmico (marca com *)
 */
function chavesUsadas() {
  const literais = new Map();   // chave → arquivo
  const dinamicos = new Map();  // prefixo → arquivo

  for (const arquivo of arquivosFrontend()) {
    const src = fs.readFileSync(arquivo, 'utf-8');
    const rel = path.relative(REPO_ROOT, arquivo);

    for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) {
      if (!literais.has(m[1])) literais.set(m[1], rel);
    }
    for (const m of src.matchAll(/\bt\(\s*`([a-zA-Z0-9_]+)\.\$\{/g)) {
      const prefixo = `${m[1]}.`;
      if (!dinamicos.has(prefixo)) dinamicos.set(prefixo, rel);
    }
  }
  return { literais, dinamicos };
}

/** A chave existe no dicionário (aceita prefixo dinâmico)? */
function existe(chave, achatado, prefixosDinamicos) {
  if (achatado.has(chave)) return true;
  for (const p of prefixosDinamicos) {
    if (chave.startsWith(p)) return true;
  }
  return false;
}

describe('i18n — dicionário x código', () => {
  const dicionarios = Object.fromEntries(IDIOMAS.map((i) => [i, achatar(carregarDicionario(i))]));
  const { literais, dinamicos } = chavesUsadas();

  it('o frontend referencia chaves de tradução', () => {
    // Sanidade: se o parser quebrar, o teste passa vazio e não pega nada.
    expect(literais.size).toBeGreaterThan(50);
    expect(dinamicos.size).toBeGreaterThan(0);
  });

  for (const idioma of IDIOMAS) {
    it(`toda chave usada no código existe no dicionário (${idioma})`, () => {
      const achatado = dicionarios[idioma];
      const prefixos = [...dinamicos.keys()];
      const faltando = [];
      for (const [chave, arquivo] of literais) {
        if (!existe(chave, achatado, prefixos)) faltando.push(`${chave}  (${arquivo})`);
      }
      expect(
        faltando,
        `Chaves usadas no frontend e ausentes no dicionário "${idioma}".\n` +
        `Se você acabou de renomear uma chave, atualize o dicionário; ` +
        `se o merge sobrescreveu locales/*.json, restaure as chaves.\n\n` +
        faltando.join('\n')
      ).toEqual([]);
    });
  }

  it('os três idiomas têm exatamente as mesmas chaves', () => {
    const base = dicionarios['pt-BR'];
    for (const idioma of ['es', 'en']) {
      const outro = dicionarios[idioma];
      const faltando = [...base.keys()].filter((k) => !outro.has(k));
      const sobrando = [...outro.keys()].filter((k) => !base.has(k));
      expect(
        { faltando, sobrando },
        `Divergência entre pt-BR e ${idioma}: ` +
        `${faltando.length} faltando, ${sobrando.length} sobrando`
      ).toEqual({ faltando: [], sobrando: [] });
    }
  });

  it('nenhuma chave tem string vazia', () => {
    for (const idioma of IDIOMAS) {
      const vazias = [];
      for (const [chave, valor] of dicionarios[idioma]) {
        if (typeof valor === 'string' && valor.trim() === '') vazias.push(chave);
      }
      expect(vazias, `Chaves com texto vazio em ${idioma}`).toEqual([]);
    }
  });
});
