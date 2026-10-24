# Dockerfile — Essência do Cuidar backend
# Multi-stage build para imagem final menor (apenas deps de produção)

# ─── Stage 1: build deps ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# better-sqlite3 precisa de build tools para compilar native addon
RUN apk add --no-cache python3 make g++ libstdc++

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ─── Stage 2: runtime ─────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Runtime: apenas libstdc++ para better-sqlite3 (sem python/make/g++)
RUN apk add --no-cache libstdc++ wget

# Copia node_modules do stage de build (já com addons compilados)
COPY --from=deps /app/node_modules ./node_modules

# Copia código
COPY . .

# Cria diretórios de runtime
RUN mkdir -p data uploads
VOLUME ["/app/data", "/app/uploads"]

# Variáveis de ambiente defaults (sobrescrever via -e ou docker-compose)
ENV NODE_ENV=production
ENV PORT=4000
# JWT_SECRET é OBRIGATÓRIO em produção — backend aborta se ausente
# (ver P2 em src/index.js)
# ENV JWT_SECRET=...
ENV FRONTEND_URL=http://localhost:5173
ENV AUTH_UPLOADS=true
ENV AUTO_CLOSE_ON_ACCEPT=true
ENV MAX_CANDIDATURAS_PER_VAGA=50
ENV CANDIDATURA_EXPIRA_DIAS=30
ENV STRIPE_MOCK=true
ENV ENABLE_REFRESH_TOKENS=false

EXPOSE 4000

# Healthcheck: GET /api/health → 200 se DB ok, 503 se cair
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/api/health || exit 1

# Não rodar como root
USER node

CMD ["node", "src/index.js"]
