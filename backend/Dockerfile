FROM node:20-alpine

WORKDIR /app

# Copia package.json e lock
COPY package*.json ./

# Instala deps de produção
RUN npm install --omit=dev --no-audit --no-fund

# Copia o código
COPY . .

# Cria diretórios de runtime
RUN mkdir -p data uploads
VOLUME ["/app/data", "/app/uploads"]

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Healthcheck simples
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/api/health || exit 1

CMD ["node", "src/index.js"]
