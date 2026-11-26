/**
 * tests/validate.test.js
 *
 * Cobertura do `validateBody` — o middleware que barra entrada inválida
 * antes dela chegar no banco.
 *
 * O caso que motivou esta suíte: em regra numérica, o limite era
 * comparado contra o **tamanho da string** quando o valor vinha como
 * string ("999".length = 3 ≤ 5 passava). O `nota` do checkout passava
 * então pela validação e só era barrado pelo CHECK constraint do banco —
 * o cliente recebia 500 em vez de 400, e o check-out ficava pela metade.
 */
import { describe, it, expect } from 'vitest';
import { validateBody } from '../src/middleware/validate.js';

/**
 * Roda o middleware e devolve o status/resposta.
 * @param {Object} schema
 * @param {Object} body
 * @returns {Promise<{status:number, body:any}>}
 */
function validar(schema, body) {
  return new Promise((resolve) => {
    const req = { body };
    const res = {
      status(code) {
        return { json: (payload) => resolve({ status: code, body: payload }) };
      }
    };
    validateBody(schema)(req, res, () => resolve({ status: 200, body: null }));
  });
}

const NOTA = { nota: { type: 'integer', min: 1, max: 5 } };
const HORAS = { horas_trabalhadas: { type: 'number', min: 0 } };

describe('validateBody — limites numéricos', () => {
  it('rejeita string numérica acima do máximo (o bug que virava 500)', async () => {
    const r = await validar(NOTA, { nota: '999' });
    expect(r.status).toBe(400);
    expect(r.body.details[0].field).toBe('nota');
  });

  it('rejeita string numérica fora da faixa 1..5', async () => {
    expect((await validar(NOTA, { nota: '6' })).status).toBe(400);
    expect((await validar(NOTA, { nota: '0' })).status).toBe(400);
    expect((await validar(NOTA, { nota: '-3' })).status).toBe(400);
  });

  it('aceita string numérica dentro da faixa (formulários mandam string)', async () => {
    expect((await validar(NOTA, { nota: '5' })).status).toBe(200);
    expect((await validar(NOTA, { nota: '1' })).status).toBe(200);
    expect((await validar(NOTA, { nota: 3 })).status).toBe(200);
  });

  it('rejeita string numérica abaixo do mínimo numérico', async () => {
    const r = await validar(HORAS, { horas_trabalhadas: '-5' });
    expect(r.status).toBe(400);
  });

  it('rejeita booleanos em campos numéricos', async () => {
    expect((await validar(NOTA, { nota: true })).status).toBe(400);
    expect((await validar(HORAS, { horas_trabalhadas: true })).status).toBe(400);
  });

  it('continua aceitando limites de tamanho para campos de texto', async () => {
    const schema = { nome: { type: 'string', min: 2, max: 10 } };
    expect((await validar(schema, { nome: 'ab' })).status).toBe(200);
    expect((await validar(schema, { nome: 'a' })).status).toBe(400);
    expect((await validar(schema, { nome: 'abcdefghijk' })).status).toBe(400);
  });

  it('continua validando os demais tipos', async () => {
    expect((await validar({ e: { type: 'email' } }, { e: 'nao-e-email' })).status).toBe(400);
    expect((await validar({ e: { type: 'enum', values: ['a', 'b'] } }, { e: 'c' })).status).toBe(400);
    expect((await validar({ a: { type: 'array' } }, { a: 'x' })).status).toBe(400);
    expect((await validar({ n: { required: true } }, {})).status).toBe(400);
    expect((await validar({ n: { required: true } }, { n: '' })).status).toBe(400);
    // Campo ausente e opcional não gera erro
    expect((await validar({ n: { type: 'integer' } }, {})).status).toBe(200);
  });
});
