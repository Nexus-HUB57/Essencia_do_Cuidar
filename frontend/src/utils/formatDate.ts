import i18n from '../i18n';

const LOCALE_MAP: Record<string, string> = {
  'pt-BR': 'pt-BR',
  es: 'es-ES',
  en: 'en-US'
};

export function getLocale(): string {
  const lng = (i18n.language || 'pt-BR').toLowerCase();
  return LOCALE_MAP[lng] || (lng.startsWith('pt') ? 'pt-BR' : lng.startsWith('es') ? 'es-ES' : 'en-US');
}

export function formatDate(input: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(getLocale(), options ?? { dateStyle: 'short' }).format(d);
}

export function formatDateTime(input: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(getLocale(), options ?? { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export function formatTime(input: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(getLocale(), options ?? { hour: '2-digit', minute: '2-digit' }).format(d);
}
