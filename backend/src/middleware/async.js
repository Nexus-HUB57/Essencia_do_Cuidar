/**
 * Wrapper de handlers async.
 *
 * O Express 4 NÃO captura rejeições de Promise em handlers async. Quando um
 * handler `async` lança (ex.: constraint violada no banco), a exceção vira
 * uma "unhandled rejection" e a requisição fica pendurada até o cliente
 * desistir (timeout) — sem nunca chegar ao error handler.
 *
 * `asyncHandler` converte o handler em um wrapper que faz o `catch(next)`,
 * encaminhando o erro para o middleware de erro do Express, que devolve um
 * JSON 500 correto.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    try {
      const r = fn(req, res, next);
      if (r && typeof r.then === 'function') r.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Cria um Router com wrapping automático de handlers.
 *
 * Uso:  const router = createRouter();   // em vez de express.Router()
 * Todos os handlers (sync ou async) passam por asyncHandler, garantindo que
 * exceções sempre cheguem ao error handler.
 */
export function createRouter(express) {
  const router = express.Router();
  const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'];

  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = function autoWrapped(path, ...handlers) {
      const wrapped = handlers.map((h) => (typeof h === 'function' ? asyncHandler(h) : h));
      return original(path, ...wrapped);
    };
  }

  // `use` também aceita handlers; envolvemos apenas os que são funções.
  const originalUse = router.use.bind(router);
  router.use = function autoWrappedUse(...args) {
    const wrapped = args.map((a) => (typeof a === 'function' ? asyncHandler(a) : a));
    return originalUse(...wrapped);
  };

  return router;
}
