/**
 * Normalização de idioma.
 *
 * POR QUE ISSO EXISTE
 *
 * O `i18next-browser-languagedetector` guarda no localStorage o idioma
 * DETECTADO, não um idioma suportado. Num navegador em `en-US` ele gravava
 * `"essencia_lang": "en-US"`. Como o seletor de idioma só oferece
 * `pt-BR | es | en`, o `<select value="en-US">` não tinha nenhuma opção
 * correspondente — o navegador exibia a PRIMEIRA opção ("🇧🇷 Português")
 * enquanto a tela era renderizada em inglês.
 *
 * O usuário via um seletor mentindo sobre o idioma atual. Este módulo
 * concentra a lógica (normalizar qualquer tag regional para um dos três
 * idiomas suportados) para que detector, seletor e `<html lang>` falem a
 * mesma língua.
 */
export type IdiomaSuportado = 'pt-BR' | 'es' | 'en';

export interface OpcaoIdioma {
  code: IdiomaSuportado;
  label: string;
  flag: string;
}

export const IDIOMAS_SUPORTADOS: OpcaoIdioma[] = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇬🇧' }
];

/**
 * Converte qualquer tag de idioma (`en-US`, `pt_BR`, `es-419`, `en`) no
 * idioma suportado mais próximo. Fallback: pt-BR.
 */
export function normalizarIdioma(lng?: string | null): IdiomaSuportado {
  if (!lng) return 'pt-BR';
  const base = String(lng).toLowerCase().replace(/_/g, '-').split('-')[0];
  switch (base) {
    case 'pt':
      return 'pt-BR';
    case 'es':
      return 'es';
    case 'en':
      return 'en';
    default:
      return 'pt-BR';
  }
}

/**
 * true quando `lng` (já normalizado) é um idioma que a plataforma suporta.
 */
export function ehIdiomaSuportado(lng: string): lng is IdiomaSuportado {
  return IDIOMAS_SUPORTADOS.some((o) => o.code === lng);
}
