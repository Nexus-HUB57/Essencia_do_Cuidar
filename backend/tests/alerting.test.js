/**
 * Testes do serviço de alertas.
 *
 * O caminho de email é testado de verdade contra um servidor SMTP mínimo
 * local — não contra um mock do nodemailer. Isso prova o handshake, o
 * envelope (MAIL FROM / RCPT TO) e o corpo MIME que chegam na caixa de
 * entrada de verdade.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import net from 'node:net';

// ─────────────────────────────────────────────────────────────────────────────
// Servidor SMTP mínimo: aceita uma conexão, captura a mensagem e responde.
// ─────────────────────────────────────────────────────────────────────────────
function criarServidorSmtp() {
  const recebidas = [];
  const servidor = net.createServer((socket) => {
    let emData = false;
    let buffer = '';
    let mensagem = '';

    socket.write('220 essencia.test ESMTP pronto\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      let idx;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const linha = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        if (emData) {
          if (linha === '.') {          // fim da mensagem
            emData = false;
            recebidas.push(mensagem);
            mensagem = '';
            socket.write('250 2.0.0 OK: mensagem recebida\r\n');
          } else {
            mensagem += linha + '\n';
          }
          continue;
        }

        const cmd = linha.split(' ')[0].toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') {
          socket.write('250-essencia.test\r\n250 AUTH PLAIN LOGIN\r\n');
        } else if (cmd === 'MAIL' || cmd === 'RCPT') {
          socket.write('250 2.1.0 OK\r\n');
        } else if (cmd === 'DATA') {
          emData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (cmd === 'RSET') {
          socket.write('250 2.0.0 OK\r\n');
        } else if (cmd === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 2.0.0 OK\r\n');
        }
      }
    });

    socket.on('error', () => {});
  });

  return {
    recebidas,
    async iniciar() {
      await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
      return servidor.address().port;
    },
    fechar() {
      return new Promise((resolve) => servidor.close(resolve));
    }
  };
}

/**
 * Desdobra um header MIME (linhas de continuação começam com espaço/tab) e
 * decodifica as palavras codificadas RFC 2047 (`=?UTF-8?Q?...?=`,
 * `=?UTF-8?B?...?=`) — que é o que o cliente de email faz ao mostrar o
 * assunto. Sem isso, um assunto com "ê" chega ilegível.
 */
function lerHeader(cabecalho, nome) {
  const linhas = String(cabecalho).split(/\r?\n/);
  let valor = null;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (valor === null) {
      const m = l.match(new RegExp(`^${nome}:\\s*(.*)$`, 'i'));
      if (!m) continue;
      valor = m[1];
      // continua enquanto a próxima linha começar com espaço/tab
      while (i + 1 < linhas.length && /^[ \t]/.test(linhas[i + 1])) {
        const prox = linhas[++i].trim();
        // RFC 2047 §6.2: o espaço que separa um par de 'encoded-word's
        // adjacentes é ignorado na exibição — uni-los sem espaço, senão
        // o assunto sai com espaço duplo.
        valor += (valor.endsWith('?=') && prox.startsWith('=?')) ? prox : ' ' + prox;
      }
    }
  }
  if (valor === null) return null;
  return valor.replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (_full, charset, tipo, dados) => {
    if (tipo.toUpperCase() === 'B') {
      return Buffer.from(dados, 'base64').toString(charset);
    }
    // Q = quoted-printable (o espaço vira "_")
    return Buffer.from(
      dados.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16))),
      'binary'
    ).toString('utf-8');
  });
}

const smtp = criarServidorSmtp();
let portaSmtp;

beforeAll(async () => {
  portaSmtp = await smtp.iniciar();
});

afterAll(async () => {
  await smtp.fechar();
});

/**
 * Importa o alerting.js do zero, com as env vars do teste já definidas.
 * O módulo lê process.env no topo, então precisa ser importado depois.
 */
async function carregarAlerting(env) {
  const anterior = {};
  for (const [k, v] of Object.entries(env)) {
    anterior[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  const mod = await import('../src/services/alerting.js');
  return {
    mod,
    restaurar() {
      for (const [k, v] of Object.entries(anterior)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

describe('services/alerting', () => {
  let tmpLog;
  beforeEach(() => {
    tmpLog = `/tmp/essencia-alerts-test-${Date.now()}.log`;
    process.env.ALERTS_FILE = tmpLog;
    smtp.recebidas.length = 0;
  });

  describe('emitirAlerta', () => {
    it('registra o alerta no log estruturado e no arquivo', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: undefined,
        SMTP_URL: undefined,
        SMTP_HOST: undefined
      });
      try {
        const alerta = await mod.emitirAlerta('db_down', { erro: 'connection refused' });
        expect(alerta.tipo).toBe('db_down');
        expect(alerta.severidade).toBe('critical');
        expect(alerta.erro).toBe('connection refused');
        expect(alerta.timestamp).toBeTruthy();

        const { readFileSync } = await import('node:fs');
        const conteudo = readFileSync(tmpLog, 'utf-8');
        expect(conteudo).toContain('db_down');
        expect(JSON.parse(conteudo.trim())).toMatchObject({ tipo: 'db_down', severidade: 'critical' });
      } finally {
        restaurar();
      }
    });

    it('aplica throttling: o mesmo tipo não repete em menos de 5 minutos', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: undefined, SMTP_URL: undefined, SMTP_HOST: undefined
      });
      try {
        const primeiro = await mod.emitirAlerta('webhook_warning', { taxa: 0.15 });
        const segundo = await mod.emitirAlerta('webhook_warning', { taxa: 0.20 });
        expect(primeiro).not.toBeNull();
        expect(segundo).toBeUndefined();   // throttled: retorna sem alerta
      } finally {
        restaurar();
      }
    });

    it('não quebra quando o SMTP está configurado mas o servidor está fora do ar', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: 'alerta@teste.com',
        SMTP_URL: 'smtp://127.0.0.1:1'   // porta fechada
      });
      try {
        const alerta = await mod.emitirAlerta('db_down', { erro: 'x' });
        expect(alerta.tipo).toBe('db_down');   // o alerta existe apesar do email falhar
      } finally {
        restaurar();
      }
    });
  });

  describe('emailConfigurado', () => {
    it('é falso sem destinatário nem SMTP', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: undefined, SMTP_URL: undefined, SMTP_HOST: undefined
      });
      try {
        expect(mod.emailConfigurado()).toBe(false);
      } finally {
        restaurar();
      }
    });

    it('é falso com destinatário mas sem SMTP', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: 'alerta@teste.com', SMTP_URL: undefined, SMTP_HOST: undefined
      });
      try {
        expect(mod.emailConfigurado()).toBe(false);
      } finally {
        restaurar();
      }
    });

    it('é falso com SMTP mas sem destinatário', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: undefined, SMTP_URL: 'smtp://localhost:2525', SMTP_HOST: undefined
      });
      try {
        expect(mod.emailConfigurado()).toBe(false);
      } finally {
        restaurar();
      }
    });

    it('é verdadeiro com SMTP_URL e destinatário', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: 'alerta@teste.com', SMTP_URL: 'smtp://localhost:2525', SMTP_HOST: undefined
      });
      try {
        expect(mod.emailConfigurado()).toBe(true);
      } finally {
        restaurar();
      }
    });

    it('é verdadeiro com SMTP_HOST e destinatário', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: 'alerta@teste.com', SMTP_URL: undefined, SMTP_HOST: 'smtp.teste.com'
      });
      try {
        expect(mod.emailConfigurado()).toBe(true);
      } finally {
        restaurar();
      }
    });
  });

  describe('envio de email (SMTP real local)', () => {
    it('entrega o email no SMTP com assunto e corpo do alerta', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: 'alerta@teste.com',
        ALERT_EMAIL_FROM: 'essencia@teste.com',
        SMTP_URL: `smtp://127.0.0.1:${portaSmtp}`,
        SMTP_HOST: undefined
      });
      try {
        await mod.emitirAlerta('webhook_critical', {
          taxaFalha: 0.73,
          janela: '24h',
          total: 41
        });

        expect(smtp.recebidas).toHaveLength(1);
        const email = smtp.recebidas[0];

        // Envelope
        expect(lerHeader(email, 'From')).toBe('essencia@teste.com');
        expect(lerHeader(email, 'To')).toBe('alerta@teste.com');
        // Assunto (decodificado de RFC 2047)
        expect(lerHeader(email, 'Subject')).toBe('[Essência do Cuidar] CRITICAL: webhook_critical');
        // Conteúdo
        expect(email).toContain('webhook_critical');
        expect(email).toContain('taxaFalha');
        expect(email).toContain('0.73');
        // Parte HTML presente (MIME multipart)
        expect(email).toContain('text/html');
      } finally {
        restaurar();
      }
    });

    it('envia também alerta de severidade warning', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: 'alerta@teste.com',
        SMTP_URL: `smtp://127.0.0.1:${portaSmtp}`,
        SMTP_HOST: undefined
      });
      try {
        await mod.emitirAlerta('webhook_warning', { taxaFalha: 0.12 });
        expect(smtp.recebidas).toHaveLength(1);
        expect(lerHeader(smtp.recebidas[0], 'Subject'))
          .toBe('[Essência do Cuidar] WARNING: webhook_warning');
      } finally {
        restaurar();
      }
    });

    it('não envia email quando não há SMTP configurado', async () => {
      const { mod, restaurar } = await carregarAlerting({
        ALERT_EMAIL_TO: undefined, SMTP_URL: undefined, SMTP_HOST: undefined
      });
      try {
        await mod.emitirAlerta('db_down', { erro: 'x' });
        expect(smtp.recebidas).toHaveLength(0);
      } finally {
        restaurar();
      }
    });
  });
});
