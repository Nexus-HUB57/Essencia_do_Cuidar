/**
 * Wrapper de handlers async.
 *
 * O Express 4 NAO captura rejeicoes de Promise em handlers async. Quando um
 * handler `async` lanca (ex.: `saveSubscription` levantando 'Subscription
 * invalida', ou constraint violada no banco), a excecao vira uma
 * "unhandled rejection" e o processo Node morre — no Node >= 15 o default de
 * unhandledRejection e terminar o processo.
 *
 * Com isso, UM request autenticado derrubava o backend inteiro:
 *   POST /api/push/subscribe  {"endpoint":"https://..."}   (sem `keys`)
 *   -> saveSubscription() lanca -> sem try/catch -> unhandledRejection
 *   -> processo encerrado (HTTP 000, servico fora do ar)
 *
 * `asyncHandler` converte o handler em um wrapper que faz o `catch(next)`,
 * encaminhando o erro para o error handler do Express, que devolve um
 * JSON 500 correto em vez de matar o servico.
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
 * Cria um Router com wrapping automatico de handlers.
 *
 * Uso:  const router = createRouter(express);   // em vez de express.Router()
 * Todos os handlers (sync ou async) passam por asyncHandler, garantindo que
 * excecoes sempre cheguem ao error handler.
 */
export function createRouter(express) {
  const router = express.Router();
  const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'];

  /**
   * O Express identifica um error handler pela ARIDADE (4 argumentos:
   * err, req, res, next). Envolver um handler de 4 args em asyncHandler — que
   * devolve uma funcao de 3 args — faria o Express tratar o error handler
   * como middleware comum, e ele nunca receberia os erros.
   *
   * Erros de rota (4 args) sao preservados como estao.
   */
  const isErrorHandler = (fn) => typeof fn === 'function' && fn.length >= 4;

  const wrap = (handlers) =>
    handlers.map((h) => (typeof h === 'function' && !isErrorHandler(h) ? asyncHandler(h) : h));

  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = function autoWrapped(path, ...handlers) {
      return original(path, ...wrap(handlers));
    };
  }

  // `use` tambem aceita handlers; envolvemos apenas os que sao funcoes.
  const originalUse = router.use.bind(router);
  router.use = function autoWrappedUse(...args) {
    return originalUse(...wrap(args));
  };

  return router;
}
