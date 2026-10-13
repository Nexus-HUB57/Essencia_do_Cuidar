import express from 'express';

// JSON body parser, exposto por rota (NÃO global) para não conflitar com multer em multipart.
export const json = express.json({ limit: '2mb' });
