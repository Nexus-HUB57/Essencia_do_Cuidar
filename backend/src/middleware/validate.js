/**
 * Validador de campos baseado em um esquema. Lança 400 com detalhes.
 *
 * schema = {
 *   nome: { required: true, type: 'string', min: 2, max: 120 },
 *   email: { required: true, type: 'email' },
 *   senha: { required: true, type: 'string', min: 6 },
 *   idade: { type: 'integer', min: 0, max: 130 },
 *   enums: { required: true, type: 'enum', values: ['PJ','CLT'] },
 *   tags: { type: 'array', items: 'string' }
 * }
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body?.[field];

      if (rules.required && (value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0))) {
        errors.push({ field, msg: 'campo obrigatório' });
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      // Booleanos não são número: `Number(true)` é 1, então sem esta
      // guarda um `nota: true` passaria como inteiro 1.
      const isNumericRule = rules.type === 'integer' || rules.type === 'number';

      if (rules.type === 'string' && typeof value !== 'string') {
        errors.push({ field, msg: 'deve ser texto' });
        continue;
      }
      if (isNumericRule && typeof value === 'boolean') {
        errors.push({ field, msg: rules.type === 'integer' ? 'deve ser inteiro' : 'deve ser número' });
        continue;
      }
      if (rules.type === 'integer' && !Number.isInteger(Number(value))) {
        errors.push({ field, msg: 'deve ser inteiro' });
        continue;
      }
      if (rules.type === 'number' && Number.isNaN(Number(value))) {
        errors.push({ field, msg: 'deve ser número' });
        continue;
      }
      if (rules.type === 'email') {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof value !== 'string' || !re.test(value)) {
          errors.push({ field, msg: 'e-mail inválido' });
          continue;
        }
      }
      if (rules.type === 'enum' && !rules.values.includes(value)) {
        errors.push({ field, msg: `deve ser um de: ${rules.values.join(', ')}` });
        continue;
      }
      if (rules.type === 'array' && !Array.isArray(value)) {
        errors.push({ field, msg: 'deve ser uma lista' });
        continue;
      }

      // ── min/max ──────────────────────────────────────────────────────
      // Em regra numérica, o limite compara o VALOR — não o tamanho da
      // string. Sem isto, `nota: "999"` passava da validação (porque
      // "999".length = 3 ≤ 5) e só era barrado depois pelo CHECK constraint
      // do banco: o cliente recebia 500 em vez de 400, e o protocolo
      // ficava com o check-out pela metade.
      if (rules.min !== undefined) {
        if (isNumericRule) {
          if (Number(value) < rules.min) {
            errors.push({ field, msg: `mínimo ${rules.min}` });
          }
        } else if (typeof value === 'string' && value.length < rules.min) {
          errors.push({ field, msg: `mínimo ${rules.min} caracteres` });
        } else if (typeof value === 'number' && value < rules.min) {
          errors.push({ field, msg: `mínimo ${rules.min}` });
        } else if (Array.isArray(value) && value.length < rules.min) {
          errors.push({ field, msg: `mínimo ${rules.min} itens` });
        }
      }
      if (rules.max !== undefined) {
        if (isNumericRule) {
          if (Number(value) > rules.max) {
            errors.push({ field, msg: `máximo ${rules.max}` });
          }
        } else if (typeof value === 'string' && value.length > rules.max) {
          errors.push({ field, msg: `máximo ${rules.max} caracteres` });
        } else if (typeof value === 'number' && value > rules.max) {
          errors.push({ field, msg: `máximo ${rules.max}` });
        } else if (Array.isArray(value) && value.length > rules.max) {
          errors.push({ field, msg: `máximo ${rules.max} itens` });
        }
      }
    }

    if (errors.length) return res.status(400).json({ error: 'Validação falhou', details: errors });
    next();
  };
}
