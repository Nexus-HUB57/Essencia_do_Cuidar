/**
 * Feature 6 — i18n server-side.
 *
 *   GET /api/i18n/:locale → retorna JSON com strings traduzidas
 *
 * O frontend usa react-i18next, mas o backend expõe strings canônicos para
 * e-mails, push notifications, etc.
 */
import express from 'express';
import { createRouter } from '../middleware/async.js';
import { dictionaries } from '../i18n/dictionaries.js';

const router = createRouter(express);

const supported = ['pt-BR', 'es', 'en'];

router.get('/', (req, res) => {
  res.json({ supported, default: 'pt-BR' });
});

router.get('/:locale', (req, res) => {
  const locale = req.params.locale;
  if (!supported.includes(locale)) {
    return res.status(404).json({ error: 'Locale não suportado', supported });
  }
  res.json({ locale, strings: dictionaries[locale] });
});

export default router;
