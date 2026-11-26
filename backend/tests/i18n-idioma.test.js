/**
 * tests/i18n-idioma.test.js
 *
 * Garante que o idioma detectado NUNCA vire um valor que a plataforma não
 * suporta, e que o detector, o seletor e o `<html lang>` falem a mesma
 * língua.
 *
 * POR QUE ISSO EXISTE
 *
 * O `i18next-browser-languagedetector` cacheava no localStorage o idioma
 * DETECTADO (`en-US`, `pt_BR`, `es-419`) em vez de um dos três idiomas
 * suportados. Como o seletor só oferece `pt-BR | es | en`, o
 * `<select value="en-US">` ficava sem opção correspondente e o navegador
 * exibia a PRIMEIRA — "🇧🇷 Português" — numa tela renderizada em inglês.
 *
 * O usuário via um seletor mentindo sobre o idioma em que estava lendo.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizarIdioma,
  ehIdiomaSuportado,
  IDIOMAS_SUPORTADOS
} from '../../frontend/src/i18n/normalize';

describe('normalização de idioma', () => {
  it('mapeia tags regionais para o idioma suportado', () => {
    expect(normalizarIdioma('en-US')).toBe('en');
    expect(normalizarIdioma('en-GB')).toBe('en');
    expect(normalizarIdioma('en')).toBe('en');
    expect(normalizarIdioma('pt-BR')).toBe('pt-BR');
    expect(normalizarIdioma('pt')).toBe('pt-BR');
    expect(normalizarIdioma('pt-PT')).toBe('pt-BR');
    expect(normalizarIdioma('es')).toBe('es');
    expect(normalizarIdioma('es-419')).toBe('es');
    expect(normalizarIdioma('es-ES')).toBe('es');
  });

  it('aceita underscore e caixa mista', () => {
    expect(normalizarIdioma('pt_BR')).toBe('pt-BR');
    expect(normalizarIdioma('EN-us')).toBe('en');
    expect(normalizarIdioma('ES_es')).toBe('es');
  });

  it('cai para pt-BR em entrada vazia ou desconhecida', () => {
    expect(normalizarIdioma('')).toBe('pt-BR');
    expect(normalizarIdioma(null)).toBe('pt-BR');
    expect(normalizarIdioma(undefined)).toBe('pt-BR');
    expect(normalizarIdioma('fr-FR')).toBe('pt-BR');
    expect(normalizarIdioma('zh-CN')).toBe('pt-BR');
  });

  it('todo idioma normalizado é suportado', () => {
    for (const tag of ['en-US', 'pt-BR', 'es-419', 'fr', 'zh-CN', 'pt_BR']) {
      expect(ehIdiomaSuportado(normalizarIdioma(tag))).toBe(true);
    }
  });
});

describe('catálogo de idiomas', () => {
  it('tem exatamente os três idiomas com dicionário', () => {
    expect(IDIOMAS_SUPORTADOS.map((o) => o.code).sort()).toEqual(['en', 'es', 'pt-BR']);
  });

  it('todo idioma do catálogo tem rótulo e bandeira', () => {
    for (const o of IDIOMAS_SUPORTADOS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.flag.length).toBeGreaterThan(0);
    }
  });
});
