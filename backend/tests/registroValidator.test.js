import { describe, it, expect } from 'vitest';
import { validate, normalize } from '../src/services/registroValidator.js';

describe('services/registroValidator — validate', () => {
  it('aceita COREN no formato UF + dígitos (documentado no validador)', () => {
    expect(validate('COREN', 'SP 123456').ok).toBe(true);
  });

  it('aceita COREN com prefixo do conselho', () => {
    expect(validate('COREN', 'COREN-SP-123456').ok).toBe(true);
  });

  it('aceita COREN no formato canônico dígitos-UF (mesmo do registros.js)', () => {
    expect(validate('COREN', '123456-SP').ok).toBe(true);
  });

  it('aceita CRM no formato canônico dígitos-UF', () => {
    expect(validate('CRM', '123456-SP').ok).toBe(true);
  });

  it('aceita CREFITO no formato canônico dígitos/UF', () => {
    expect(validate('CREFITO', '123456/SP-3').ok).toBe(true);
  });

  it('aceita CRN no formato canônico dígitos-UF', () => {
    expect(validate('CRN', '1234-SP').ok).toBe(true);
  });

  it('aceita CRM no formato dígitos/UF', () => {
    expect(validate('CRM', '123456/SP').ok).toBe(true);
  });

  it('aceita CREFITO com letra final', () => {
    expect(validate('CREFITO', 'CREFITO 12345 F').ok).toBe(true);
  });

  it('aceita CRP no formato NN/NNNNN', () => {
    expect(validate('CRP', '06/12345').ok).toBe(true);
  });

  it('aceita CRN no formato dígitos/UF', () => {
    expect(validate('CRN', '12345/RJ').ok).toBe(true);
  });

  it('rejeita CRM com formato invertido', () => {
    expect(validate('CRM', 'SP/123456').ok).toBe(false);
  });

  it('rejeita CRM com UF na frente (formato invertido real)', () => {
    expect(validate('CRM', 'SP/123456').ok).toBe(false);
  });

  it('rejeita conselho desconhecido', () => {
    const r = validate('XYZ', '123456');
    expect(r.ok).toBe(false);
  });

  it('rejeita string vazia', () => {
    expect(validate('CRM', '').ok).toBe(false);
  });

  it('rejeita registro com letras no lugar de dígitos (COREN)', () => {
    expect(validate('COREN', 'SP ABCDEF').ok).toBe(false);
  });
});

describe('services/registroValidator — normalize', () => {
  it('normaliza COREN para o formato canônico', () => {
    const n = normalize('COREN', 'coren sp 123456');
    expect(n).toMatch(/^COREN[-\s]?SP[-\s]?\d{4,6}$/i);
  });

  it('normaliza CRM colocando o prefixo do conselho em maiúsculas', () => {
    const n = normalize('CRM', 'crm 123456 sp');
    expect(n.startsWith('CRM')).toBe(true);
  });

  it('não quebra entradas já válidas', () => {
    expect(normalize('CRM', '123456/SP')).toBeTruthy();
  });
});
