# Dockerfile do frontend Essência do Cuidar
# Build multi-stage: compila com Node 20, serve com nginx

# === STAGE 1: Build ===
FROM node:20-alpine AS build

WORKDIR /app

# Copia package files primeiro para cache de deps
COPY package*.json ./
RUN npm ci

# Copia o resto e builda
COPY . .

# URL da API em build-time. Em produção, substitua via --build-arg.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# === STAGE 2: Serve com nginx ===
FROM nginx:1.27-alpine

# Config mínima para SPA: fallback para /index.html em 404
RUN rm -f /etc/nginx/conf.d/default.conf
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # Compressão gzip
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/javascript application/xml image/svg+xml;
  gzip_min_length 1024;

  # Cache de assets com hash
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Service worker sem cache (sempre busca versão nova)
  location = /sw.js {
    add_header Cache-Control "no-cache";
  }

  # SPA fallback: qualquer rota volta para /index.html
  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

# Copia o build do stage 1
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
