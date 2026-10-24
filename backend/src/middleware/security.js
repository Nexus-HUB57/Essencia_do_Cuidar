/**
 * Middleware de segurança do backend.
 *
 *  - helmet: adiciona headers HTTP de segurança (X-Content-Type-Options,
 *    X-Frame-Options, Referrer-Policy, etc). Desabilita CSP por padrão
 *    porque o frontend é servido pelo mesmo origin em produção (single-port)
 *    e configurar CSP pra multi-origin aqui daria mais problema que solução.
 *
 *  - rateLimit: limita requests por IP em janelas curtas. Defaults:
 *      /api/auth/*  → 30 req / 15 min (anti brute-force em login/cadastro)
 *      /api/*       → 300 req / 15 min (uso geral da API)
 *    Configurável via env RATE_LIMIT_MAX.
 *
 *  - P9 — Rate limit por usuário (além de IP): para usuários autenticados,
 *    usa id_user como chave; para anônimos, usa IP. Evita que um único
 *    usuário derrube o limite de IP para todos os outros atrás do mesmo proxy.
 *
 * Em dev, se quiser desabilitar, setar RATE_LIMIT_DISABLED=1.
 */
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

const RATE_DISABLED = process.env.RATE_LIMIT_DISABLED === '1';
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX || 300);
const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar';

export const securityHeaders = helmet({
  // CSP fica desligado — single-port serve HTML do mesmo origin.
  // Ativar somente após configurar nonce/unsafe-inline corretamente.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  // HSTS só em produção (HTTPS)
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? {
    maxAge: 60 * 60 * 24 * 365, // 1 ano
    includeSubDomains: true,
    preload: true
  } : false
});

/**
 * P9 — Key generator que usa id_user para autenticados e IP para anônimos.
 * Antes: todas as requests atrás de um proxy compartilhavam o mesmo IP
 * do proxy, então um usuário malicioso podia exaurir o limite para todos.
 * Agora: usuários autenticados têm seu próprio bucket, limitando blast radius.
 */
function keyGenerator(req) {
  // Tenta extrair user.id do JWT
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET);
      if (payload.id) return `user:${payload.id}`;
    } catch {
      // token inválido/expirado — cai para IP
    }
  }
  // Fallback: IP
  return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

/**
 * Rate limiter global da API. Em dev fica permissivo.
 * Em prod, 300 req / 15 min por user (autenticado) ou IP (anônimo).
 */
export const apiLimiter = RATE_DISABLED
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: RATE_WINDOW_MS,
      max: RATE_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator,
      message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' }
    });

/**
 * Rate limiter mais agressivo para rotas de auth — protege contra
 * brute-force em login e abuso do endpoint de cadastro.
 * Em dev: 30 req / 15 min. Em prod: ajustável via RATE_AUTH_MAX.
 */
export const authLimiter = RATE_DISABLED
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: RATE_WINDOW_MS,
      max: Number(process.env.RATE_AUTH_MAX || 30),
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true, // não conta login OK
      // Auth limiter sempre usa IP (não user) porque antes do login não há user
      message: { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' }
    });
