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
 * Em dev, se quiser desabilitar, setar RATE_LIMIT_DISABLED=1.
 */
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const RATE_DISABLED = process.env.RATE_LIMIT_DISABLED === '1';
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX || 300);
const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);

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
 * Rate limiter global da API. Em dev fica permissivo.
 * Em prod, 300 req / 15 min por IP (configurável).
 */
export const apiLimiter = RATE_DISABLED
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: RATE_WINDOW_MS,
      max: RATE_MAX,
      standardHeaders: true,
      legacyHeaders: false,
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
      message: { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' }
    });
