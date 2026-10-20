FROM node:20-bookworm-slim

WORKDIR /app

# python3/make/g++ necessários para compilar better-sqlite3 (native module)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Instala todas as deps (dev inclusas, pois scripts/ e src/ são todos runtime)
RUN npm install --no-audit --no-fund && npm cache clean --force

COPY . .

RUN mkdir -p data uploads
VOLUME ["/app/data", "/app/uploads"]

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Se DATABASE_URL estiver setado, roda a migration do PG antes de subir
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then node scripts/migrate-pg.js; fi; node src/index.js"]