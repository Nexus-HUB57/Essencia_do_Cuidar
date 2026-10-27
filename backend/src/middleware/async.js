/**
 * middleware/async.js
 *
 * Rede de segurança para handlers `async` no Express 4.
 *
 * O Express 4 NÃO captura erros lançados dentro de handlers assíncronos: o
 * `throw`/`reject` vira uma `unhandledRejection`. Como o Node ≥ 15 aborta o
 * processo por padrão em `unhandledRejection`, um único request malformado
 * derrubava a API inteira.
 *
 * Foi exatamente o que aconteceu com `POST /api/mensagens` para um
 * `id_destinatario` inexistente: a violação de FOREIGN KEY dentro do
 * `db.run()` derrubava o processo e todas as requisições passavam a retornar
 * "connection refused".
 *
 * `wrapRouter` reescreve cada handler do router para que:
 *   - rejeições de Promise virem `next(err)` (o handler de erro do Express
 *     responde 500 e o processo continua de pé);
 *   - throws síncronos também sejam repassados.
 */

/**
 * Envolve os handlers de um router para que erros assíncronos cheguem ao
 * error handler do Express.
 *
 * @param {import('express').Router} router
 * @returns {import('express').Router} o mesmo router, já tratado
 */
export function wrapRouter(router) {
  if (!router || !Array.isArray(router.stack)) return router;

  for (const layer of router.stack) {
    if (!layer.route || !Array.isArray(layer.route.stack)) continue;

    for (const l of layer.route.stack) {
      // Handlers de erro (4 argumentos) já são tratados pelo Express.
      if (typeof l.handle !== 'function' || l.handle.length >= 4) continue;

      const original = l.handle;
      l.handle = function wrapped(req, res, next) {
        let result;
        try {
          result = original(req, res, next);
        } catch (err) {
          return next(err);
        }
        if (result && typeof result.catch === 'function') {
          result.catch(next);
        }
        return result;
      };
    }
  }

  return router;
}

export default wrapRouter;
