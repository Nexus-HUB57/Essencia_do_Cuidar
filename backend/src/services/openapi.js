/**
 * services/openapi.js
 *
 * P10 — Especificação OpenAPI 3.0 do backend.
 *
 * Gera e serve a documentação interativa da API em:
 *   - GET /api/openapi.json — JSON OpenAPI 3.0
 *   - GET /api/docs         — HTML minimalista (Swagger-like) usando CDN
 *
 * Sem dependências externas (sem swagger-ui-express), para manter o
 * bundle leve. O HTML carrega Swagger UI via CDN.
 */

export function getOpenApiSpec() {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:4000';
  return {
    openapi: '3.0.3',
    info: {
      title: 'Essência do Cuidar API',
      version: '1.0.0',
      description: 'Marketplace de profissionais de saúde para atendimento domiciliar de idosos e pacientes de baixa/média complexidade.\n\nEndpoints organizados por recurso. Autenticação via JWT Bearer token.',
      contact: {
        name: 'Nexus-HUB57',
        url: 'https://github.com/Nexus-HUB57/Essencia_do_Cuidar'
      },
      license: {
        name: 'MIT'
      }
    },
    servers: [
      { url: '/api', description: 'Relativo (com proxy)' },
      { url: baseUrl + '/api', description: 'Absoluto (sem proxy)' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtido em POST /auth/login ou /auth/cadastro. Header: Authorization: Bearer <token>'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            tipo_usuario: { type: 'string', enum: ['profissional', 'contratante'] },
            nome: { type: 'string' },
            email: { type: 'string', format: 'email' },
            telefone: { type: 'string' },
            is_admin: { type: 'integer', enum: [0, 1] }
          }
        },
        Vaga: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            id_contratante: { type: 'integer' },
            complexidade: { type: 'string', enum: ['baixa', 'media'] },
            profissional_desejado: { type: 'string' },
            regiao: { type: 'string' },
            regiao_uf: { type: 'string', description: 'UF (2 letras)' },
            remuneracao_valor: { type: 'number' },
            remuneracao_tipo: { type: 'string', enum: ['plantao', 'hora'] },
            tipo_contrato: { type: 'string', enum: ['PJ', 'CLT'] },
            status: { type: 'string', enum: ['ativa', 'pausada', 'fechada'] },
            criado_em: { type: 'string', format: 'date-time' }
          }
        },
        Candidatura: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            id_vaga: { type: 'integer' },
            id_profissional: { type: 'integer' },
            mensagem: { type: 'string' },
            status_candidatura: { type: 'string', enum: ['pendente', 'visualizada', 'aceita', 'recusada'] },
            criado_em: { type: 'string', format: 'date-time' }
          }
        },
        Recomendacao: {
          type: 'object',
          properties: {
            score: { type: 'number', minimum: 0, maximum: 1, description: 'Score de matching 0.0-1.0' },
            motivos: { type: 'array', items: { type: 'string' } },
            profissional: { $ref: '#/components/schemas/User' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            motivo: { type: 'string' },
            details: { type: 'array', items: { type: 'object' } }
          }
        }
      }
    },
    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Healthcheck',
          description: 'Verifica disponibilidade do servidor e do banco de dados. Retorna 503 se DB indisponível.',
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, service: { type: 'string' }, db: { type: 'object' } } } } } },
            '503': { description: 'DB indisponível' }
          }
        }
      },
      '/profissoes': {
        get: {
          tags: ['Helpers'],
          summary: 'Lista profissões suportadas (M2/M3)',
          description: 'Retorna lista canônica de profissões (8 categorias) e UFs válidas (27).',
          responses: { '200': { description: 'OK' } }
        }
      },
      '/auth/cadastro': {
        post: {
          tags: ['Auth'],
          summary: 'Cadastra novo usuário (profissional ou contratante)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
            tipo_usuario: { type: 'string', enum: ['profissional', 'contratante'] },
            nome: { type: 'string', minLength: 2, maxLength: 120 },
            email: { type: 'string', format: 'email' },
            senha: { type: 'string', minLength: 6, maxLength: 72 },
            telefone: { type: 'string' }
          } } } } },
          responses: { '201': { description: 'Criado' }, '409': { description: 'E-mail já cadastrado' } }
        }
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login → JWT',
          responses: { '200': { description: 'OK' }, '401': { description: 'Credenciais inválidas' }, '403': { description: 'Conta suspensa' } }
        }
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'A1 — Renova access token',
          description: 'Gera novo access token a partir de um refresh token válido.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } } },
          responses: { '200': { description: 'Novo access token' }, '401': { description: 'Refresh token inválido' } }
        }
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'A2 — Logout (revoga token)',
          description: 'Adiciona o jti do token atual à blacklist. Próximas requests com este token serão rejeitadas.',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Logout efetuado' } }
        }
      },
      '/auth/me': {
        get: { tags: ['Auth'], summary: 'Usuário logado', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } }
      },
      '/vagas': {
        get: {
          tags: ['Vagas'],
          summary: 'Lista pública com filtros (M4)',
          description: 'Filtros opcionais: profissional, complexidade, regiao, remuneracaoMin, tipoContrato, remuneracaoTipo, jornadaEscala, regiaoUf, ordenar, limite, offset.',
          responses: { '200': { description: 'Lista paginada' } }
        },
        post: {
          tags: ['Vagas'],
          summary: 'Cria nova vaga (M2 warning + M3 UF valida)',
          security: [{ bearerAuth: [] }],
          responses: { '201': { description: 'Criada' }, '400': { description: 'UF inválida ou validação falhou' } }
        }
      },
      '/vagas/{id}/recomendar': {
        get: {
          tags: ['Vagas', 'Matching'],
          summary: 'M1 — Top N profissionais recomendados',
          description: 'Algoritmo de matching automático com score 0-1. Exclui profissionais que já se candidataram.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'limite', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } },
            { name: 'minScore', in: 'query', schema: { type: 'number', default: 0.3, minimum: 0, maximum: 1 } }
          ],
          responses: { '200': { description: 'Lista de recomendações com scores' }, '403': { description: 'Não é dono da vaga' } }
        }
      },
      '/profissionais/me/recomendar': {
        get: {
          tags: ['Profissionais', 'Matching'],
          summary: 'M1 reverso — Top N vagas recomendadas',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Lista de vagas com scores' } }
        }
      },
      '/candidaturas': {
        post: {
          tags: ['Candidaturas'],
          summary: 'Candidatar-se (M8 limite)',
          description: 'Limite de candidaturas por vaga: MAX_CANDIDATURAS_PER_VAGA (default 50).',
          security: [{ bearerAuth: [] }],
          responses: { '201': { description: 'Candidatura criada' }, '429': { description: 'Vaga atingiu limite' } }
        }
      },
      '/candidaturas/{id}/historico-status': {
        get: {
          tags: ['Candidaturas', 'Auditoria'],
          summary: 'M11 — Histórico de transições',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Lista de transições auditadas' } }
        }
      },
      '/admin/webhooks/retry': {
        post: {
          tags: ['Admin'],
          summary: 'N1 — Dispara retry de webhooks com falha',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Resultado do retry' } }
        }
      },
      '/admin/candidaturas/limpar-expiradas': {
        post: {
          tags: ['Admin'],
          summary: 'M9 — Expira candidaturas pendentes há mais de 30 dias',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Resultado da expiração' } }
        }
      }
    }
  };
}

/**
 * HTML minimalista que carrega Swagger UI via CDN.
 * @param {Object} spec — OpenAPI spec (JSON)
 * @returns {string} HTML page
 */
export function getSwaggerUIHtml(spec) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Essência do Cuidar — API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui { max-width: 1200px; margin: 0 auto; }
    .header { background: #4A90E2; color: white; padding: 12px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .header h1 { margin: 0; font-size: 18px; }
    .header small { font-size: 12px; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Essência do Cuidar — API Docs <small>v1.0.0</small></h1>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        spec: ${JSON.stringify(spec)},
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
        deepLinking: true
      });
    };
  </script>
</body>
</html>`;
}
