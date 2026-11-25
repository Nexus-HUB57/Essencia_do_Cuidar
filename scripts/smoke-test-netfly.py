#!/usr/bin/env python3
"""
Smoke test E2E da Sincronização Netfly (webhook netlify.ai).

Valida, contra instâncias reais do backend, o ciclo completo do pipeline:

  [Entrega]
   - cada evento de negócio dispara um POST para o endpoint configurado
     em NETLIFY_AI_URL (aqui, um receptor HTTP local que o próprio
     script levanta)
   - o payload sai no envelope {event, source, timestamp, data}
   - cada envio é auditado em webhook_logs com status_code do destino

  [Resiliência]
   - com o destino fora do ar, o evento falha SEM derrubar a API
     (best-effort: o fluxo de negócio continua 201/200)
   - a falha fica registrada (erro != null) e o retry
     (POST /api/admin/webhooks/retry) reenvia o payload original quando
     o destino volta — o log é atualizado (erro = null, status 200)

  [Observabilidade]
   - GET /api/admin/webhooks lista os envios
   - GET /api/admin/webhooks/health agrega sucesso/falha por tipo/status

  [Autorização]
   - endpoints de admin: 401 sem token, 403 com token não-admin

Orquestração (o script é autocontido, não precisa de API externa):
   1. Levanta o receptor HTTP em 127.0.0.1:49001
   2. Sobe um backend em :4010 com NETLIFY_AI_URL → receptor
   3. Percorre a jornada de negócio que dispara os 9 tipos de evento
   4. Reconfigura o backend com um destino morto e força uma falha
   5. Volta o destino e executa o retry via API de admin

Uso:
    python3 scripts/smoke-test-netfly.py [--seed] [--keep] [--netfly-url URL]

  --seed   roda `npm run seed` antes (estado determinístico; default:
           usa o banco que já estiver em backend/data/essencia.db)
  --keep   não derruba o backend do teste ao sair (debug)
  --netfly-url URL
           fase de ENTREGA contra um destino real (ex.: o endpoint do
           parceiro em produção) em vez do receptor local. A auditoria
           passa a exigir entrega alcançada (status registrado, erro
           nulo) em vez de 200 do receptor; as fases de falha e de
           retry continuam no receptor local (200) para não mudar o
           contrato delas.

Sai com código 1 se qualquer verificação falhar.
"""
import argparse
import json
import os
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import error as urlerror
from urllib import request as urlrequest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
RECEIVER_PORT = 49001
BACKEND_PORT = 4010
DEAD_PORT = 49999            # nada escuta aqui — força ECONNREFUSED
FAILURES = []


# ─────────────────────────── Receptor do webhook ─────────────────────────

class Inbox:
    """Guarda cada POST recebido: (momento, payload)."""

    def __init__(self):
        self.items = []
        self.lock = threading.Lock()

    def add(self, payload):
        with self.lock:
            self.items.append((time.time(), payload))

    def all(self):
        with self.lock:
            return list(self.items)

    def count(self, event=None):
        return len([p for _, p in self.all() if event is None or p.get("event") == event])


INBOX = Inbox()


class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode())
        except Exception:
            payload = {"_raw": raw.decode(errors="replace")[:300]}
        INBOX.add(payload)
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # silencia o log padrão
        pass


def start_receiver():
    server = ThreadingHTTPServer(("127.0.0.1", RECEIVER_PORT), Receiver)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# ─────────────────────────────── Backend ─────────────────────────────────

def start_backend(netfly_url, log_path):
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    env.update({
        "PORT": str(BACKEND_PORT),
        "NETLIFY_AI_URL": netfly_url,
        "NETLIFY_AI_TIMEOUT_MS": "3000",
        "NODE_ENV": "development",
    })
    logf = open(log_path, "ab")
    proc = subprocess.Popen(
        ["node", "src/index.js"], cwd=BACKEND, env=env,
        stdout=logf, stderr=logf, stdin=subprocess.DEVNULL,
        start_new_session=True,
    )
    return proc


def wait_health(timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            st, _ = call("GET", "/api/health")
            if st == 200:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def stop_backend(proc):
    if proc and proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait(timeout=5)


# ─────────────────────────── Cliente HTTP da API ─────────────────────────

BASE = f"http://localhost:{BACKEND_PORT}"


def call(method, path, token=None, body=None, base=BASE):
    req = urlrequest.Request(base + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urlrequest.urlopen(req, data, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urlerror.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}")
        except Exception:
            return e.code, {"raw": raw[:300]}


def wait_for(pred, timeout=15.0, step=0.4):
    """Espera assíncrona: o notifyNetfly é fire-and-forget no backend."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if pred():
            return True
        time.sleep(step)
    return False


def check(label, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'}  {label}" + (f"  — {detail}" if detail else ""))
    if not cond:
        FAILURES.append(label)


def admin_webhooks(TA):
    st, r = call("GET", "/api/admin/webhooks", TA)
    return (st, r.get("webhooks", [])) if st == 200 else (st, [])


def jid(token):
    import base64
    p = token.split(".")[1]
    p += "=" * (-len(p) % 4)
    return json.loads(base64.urlsafe_b64decode(p))["id"]


# ─────────────────────────────── Jornada ─────────────────────────────────

EXPECTED_EVENTS = [
    "vaga_criada",           # routes/vagas.js       (POST /api/vagas)
    "candidatura_enviada",   # routes/candidaturas.js
    "candidatura_aceita",    # routes/candidaturas.js (PATCH status)
    "pcm_enviado",           # services/protocolos.js (candidatura aceita)
    "pdc_gerado",            # services/protocolos.js (PCM aceito)
    "pdc_pago",              # services/protocolos.js (pagamento em custódia)
    "checkout_completo",     # services/protocolos.js (2º check-out)
    "pagamento_liberado",    # services/protocolos.js (liberação)
    "avaliacao_criada",      # routes/avaliacoes.js
]


def jornada():
    print("\n  ── [A] Usuários da jornada ──")
    suf = str(int(time.time()))[-6:]
    call("POST", "/api/auth/cadastro", body={
        "tipo_usuario": "contratante", "nome": "Netfly Contratante",
        "email": f"netfly-c-{suf}@demo.com", "senha": "demo1234", "telefone": "11900000001"})
    call("POST", "/api/auth/cadastro", body={
        "tipo_usuario": "profissional", "nome": "Netfly Profissional",
        "email": f"netfly-p-{suf}@demo.com", "senha": "demo1234", "telefone": "11900000002"})
    _, r = call("POST", "/api/auth/login", body={"email": f"netfly-c-{suf}@demo.com", "senha": "demo1234"})
    TC = r.get("token", "")
    _, r = call("POST", "/api/auth/login", body={"email": f"netfly-p-{suf}@demo.com", "senha": "demo1234"})
    TP = r.get("token", "")
    _, r = call("POST", "/api/auth/login", body={"email": "admin@demo.com", "senha": "admin1234"})
    TA = r.get("token", "")
    check("tokens obtidos (contratante, profissional, admin)", bool(TC and TP and TA))
    return TC, TP, TA


def disparar_eventos(TC, TP, TA):
    """Percorre o negócio e devolve o payload de controle (ids)."""
    call("PUT", "/api/profissionais/me", TP, {
        "profissao": "tecnico_enfermagem", "regiao": "São Paulo - SP",
        "cidade": "São Paulo", "disponibilidade": ["manha"],
        "especialidades": ["Pós-operatório"]})

    st, r = call("POST", "/api/vagas", TC, {
        "paciente_sexo": "F", "paciente_idade": 79,
        "paciente_diagnostico": "Pós-operatório", "complexidade": "baixa",
        "servico_descricao": "Sincronização Netfly — vaga de teste",
        "profissional_desejado": "Técnico de Enfermagem",
        "jornada_horario": "08h às 12h", "jornada_escala": "Seg a Sex",
        "tipo_contrato": "PJ", "remuneracao_tipo": "hora", "remuneracao_valor": 150,
        "regiao": "São Paulo - SP", "cidade": "São Paulo"})
    vaga = r.get("vaga", {})
    check("vaga criada (dispara vaga_criada)", st == 201 and bool(vaga.get("id")), f"id={vaga.get('id')}")
    vaga_id = vaga["id"]

    st, r = call("POST", "/api/candidaturas", TP, {"id_vaga": vaga_id, "mensagem": "sync"})
    cand_id = r.get("candidatura", {}).get("id")
    check("candidatura enviada (dispara candidatura_enviada)", st == 201, f"id={cand_id}")

    st, _ = call("PATCH", f"/api/candidaturas/{cand_id}", TC, {"status_candidatura": "aceita"})
    check("candidatura aceita (dispara candidatura_aceita + pcm_enviado)", st == 200)

    st, r = call("GET", "/api/protocolos?tipo=PCM", TP)
    pcms = [p for p in r.get("protocolos", []) if p["status"] == "enviado"]
    pcm_id = pcms[0]["id"] if pcms else None
    st, r = call("POST", f"/api/protocolos/{pcm_id}/aceitar", TP)
    pdc_id = r.get("pdc", {}).get("id")
    check("PCM aceito → PDC gerado (dispara pdc_gerado)", st == 200 and bool(pdc_id), f"pcm={pcm_id} pdc={pdc_id}")

    st, r = call("POST", "/api/pagamentos", TC, {"id_vaga": vaga_id, "metodo": "pix"})
    check("pagamento em custódia (dispara pdc_pago)", st == 201 and r.get("protocolo_id") == pdc_id,
          f"via={r.get('via')} protocolo_id={r.get('protocolo_id')}")

    call("POST", f"/api/protocolos/{pdc_id}/checkin", TP, {"latitude": -23.55, "longitude": -46.63})
    call("POST", f"/api/protocolos/{pdc_id}/checkin", TC, {})
    # Check-outs SEM nota: a nota via check-out grava avaliação pelo caminho do
    # protocolo; a avaliacao_criada (routes/avaliacoes.js) é disparada pelo POST
    # explícito abaixo. Com nota nos dois, o POST cairia no UNIQUE sem evento.
    call("POST", f"/api/protocolos/{pdc_id}/checkout", TP, {"comentario": "Concluído"})
    st, r = call("POST", f"/api/protocolos/{pdc_id}/checkout", TC, {"comentario": "Ótimo"})
    check("check-outs completos (disparam checkout_completo)", st == 200 and r.get("checkout_completo") is True)

    st, r = call("POST", f"/api/protocolos/{pdc_id}/liberar", TA)
    check("liberação (dispara pagamento_liberado)", st == 200, f"ja_liberado={r.get('ja_liberado')}")

    st, r = call("POST", "/api/avaliacoes", TC, {
        "id_profissional": jid(TP), "id_vaga": vaga_id, "nota": 5,
        "comentario": "Sync Netfly"})
    check("avaliação criada (dispara avaliacao_criada)", st in (201, 200))

    return {"vaga_id": vaga_id, "cand_id": cand_id, "pdc_id": pdc_id}


# ─────────────────────────────── Fases ───────────────────────────────────

def fase_entrega(destino_real=False):
    """[1] Entrega real: eventos → destino → webhook_logs auditados."""
    print("\n[1] Entrega — envelope do payload e auditoria")
    if destino_real:
        print("      destino real: os payloads NÃO passam pelo receptor local;")
        print("      a prova aqui é a auditoria (webhook_logs com status do destino)")
    else:
        ok = wait_for(lambda: INBOX.count("avaliacao_criada") >= 1, timeout=15)
        check("webhooks chegaram ao receptor", ok,
              f"{len(INBOX.all())} payload(s) recebido(s)")

        tipos_ok = []
        for ev in EXPECTED_EVENTS:
            hits = [p for _, p in INBOX.all() if p.get("event") == ev]
            if hits:
                tipos_ok.append(ev)
            check(f"evento {ev} entregue", len(hits) >= 1)
            if hits:
                p = hits[0]
                check(f"  envelope ok ({ev})",
                      p.get("source") == "essencia-do-cuidar"
                      and isinstance(p.get("data"), dict)
                      and bool(p.get("timestamp"))
                      and _iso(p.get("timestamp")),
                      f"data={json.dumps(p.get('data'))[:90]}")

    st, rows = admin_webhooks(TA_global[0])
    check("GET /api/admin/webhooks lista os envios", st == 200 and len(rows) >= len(EXPECTED_EVENTS),
          f"{len(rows)} registro(s)")
    if destino_real:
        entregues = {r["tipo"] for r in rows
                     if r["tipo"] in EXPECTED_EVENTS
                     and r["erro"] is None and r["status_code"] is not None}
        status_vistos = sorted({r["status_code"] for r in rows
                                if r["tipo"] in EXPECTED_EVENTS})
        check("webhook_logs audita todos com entrega real (status registrado, erro nulo)",
              entregues == set(EXPECTED_EVENTS),
              f"auditados={len(entregues)}/9 | status do destino: {status_vistos}")
    else:
        entregues = {r["tipo"] for r in rows if r["tipo"] in EXPECTED_EVENTS and r["status_code"] == 200}
        check("webhook_logs audita todos com status 200", entregues == set(EXPECTED_EVENTS),
              f"auditados={len(entregues)}/9")
    return TA_global[0]


def _iso(s):
    try:
        datetime.fromisoformat(s.replace("Z", "+00:00"))
        return True
    except Exception:
        return False


def fase_falha(vaga_payload_ctrl, TC):
    """[2] Resiliência: destino morto → falha auditada, negócio segue de pé."""
    print("\n[2] Resiliência — destino fora do ar (best-effort)")
    st, r = call("POST", "/api/vagas", TC, {
        "complexidade": "baixa", "servico_descricao": "Netfly falha proposital",
        "profissional_desejado": "Cuidador", "regiao": "São Paulo - SP",
        "jornada_horario": "08h às 12h", "remuneracao_tipo": "hora", "remuneracao_valor": 100})
    vaga_id = r.get("vaga", {}).get("id")
    check("com webhook morto, a vaga AINDA é criada (best-effort)", st == 201, f"id={vaga_id}")

    st, r = call("GET", "/api/vagas?limite=1")
    check("API continua respondendo após a falha do webhook", st == 200)

    def falha_gravada():
        _, rows = admin_webhooks(TA_global[0])
        return any((rw.get("erro") is not None or rw.get("status_code") is None)
                   and str(vaga_id) in rw.get("payload", "")
                   for rw in rows)

    ok = wait_for(falha_gravada, timeout=15)
    _, rows = admin_webhooks(TA_global[0])
    falhas = [rw for rw in rows if rw["tipo"] == "vaga_criada"
              and (rw.get("erro") is not None or rw["status_code"] is None)]
    check("falha registrada em webhook_logs (erro/status)", ok and len(falhas) >= 1,
          "; ".join((rw.get("erro") or f"status={rw.get('status_code')}")[:60] for rw in falhas[:2]))
    return vaga_id


def fase_retry(vaga_id_falha, netfly_ok):
    """[3] Retry: destino volta, POST /api/admin/webhooks/retry reenvia."""
    print("\n[3] Retry — reenvio do payload original")
    before = INBOX.count("vaga_criada")
    st, r = call("POST", "/api/admin/webhooks/retry", TA_global[0], {})
    check("POST /api/admin/webhooks/retry executa", st == 200 and r.get("ok") is True,
          f"tentados={r.get('tentados')} sucesso={r.get('sucesso')} falha={r.get('falha')}")
    check("retry reenviou ao menos 1 webhook com sucesso", (r.get("sucesso") or 0) >= 1)

    def reenviado():
        return INBOX.count("vaga_criada") > before and any(
            p.get("data", {}).get("vaga_id") == vaga_id_falha for _, p in INBOX.all())

    ok = wait_for(reenviado, timeout=10)
    replay = [p for _, p in INBOX.all()
              if p.get("event") == "vaga_criada" and p.get("data", {}).get("vaga_id") == vaga_id_falha]
    check("payload original reentregue ao receptor", ok and len(replay) >= 1,
          f"vaga_id={vaga_id_falha}, payloads={len(replay)}")

    _, rows = admin_webhooks(TA_global[0])
    linha = next((rw for rw in rows if rw["tipo"] == "vaga_criada"
                  and str(vaga_id_falha) in rw.get("payload", "")), None)
    check("log do webhook recuperado (erro=null, status 200)",
          linha is not None and linha.get("erro") is None and linha.get("status_code") == 200,
          f"status={linha.get('status_code') if linha else '?'} erro={linha.get('erro') if linha else '?'}")


def fase_health():
    """[4] Observabilidade: agregações do health por tipo/status."""
    print("\n[4] Observabilidade — GET /api/admin/webhooks/health")
    st, h = call("GET", "/api/admin/webhooks/health", TA_global[0])
    check("health responde com agregações", st == 200 and isinstance(h.get("por_tipo"), list)
          and isinstance(h.get("por_status"), list),
          f"status={h.get('status')} taxa_falha={h.get('taxa_falha')}%")
    check("janela de 24h com envios auditados", (h.get("total") or 0) >= len(EXPECTED_EVENTS),
          f"total={h.get('total')} sucesso={h.get('sucesso_total')} falhas={h.get('falhas_total')}")
    tipos = {t["tipo"] for t in h.get("por_tipo", [])}
    check("health cobre os tipos de evento do negócio", EXPECTED_EVENTS[0] in tipos,
          f"{len(tipos)} tipo(s)")
    check("classificação de saúde coerente (falha ~0 → healthy/sem_dados)",
          h.get("status") in ("healthy", "sem_dados"), f"status={h.get('status')}")


def fase_authz(TC):
    """[5] Autorização dos endpoints de admin."""
    print("\n[5] Autorização — endpoints de admin exigem admin")
    st, _ = call("GET", "/api/admin/webhooks")
    check("sem token → 401", st == 401, f"got {st}")
    st, _ = call("GET", "/api/admin/webhooks", TC)
    check("contratante → 403", st == 403, f"got {st}")
    st, _ = call("POST", "/api/admin/webhooks/retry", TC, {})
    check("retry por não-admin → 403", st == 403, f"got {st}")
    st, _ = call("GET", "/api/admin/webhooks/health", TC)
    check("health por não-admin → 403", st == 403, f"got {st}")


# ─────────────────────────────── Runner ──────────────────────────────────

TA_global = [None]


def main():
    global TA_global
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", action="store_true", help="roda npm run seed antes")
    ap.add_argument("--keep", action="store_true", help="mantém o backend do teste ao sair")
    ap.add_argument("--netfly-url", default=None, metavar="URL",
                    help="fase de entrega contra um destino real (default: receptor local)")
    args = ap.parse_args()

    print("═" * 64)
    print(" SMOKE TEST E2E — SINCRONIZAÇÃO NETFLY (webhook netlify.ai)")
    print("═" * 64)

    if args.seed:
        print("\n  seed do banco…")
        env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
        subprocess.run(["npm", "run", "seed"], cwd=BACKEND, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)

    receiver = start_receiver()
    print(f"\n  receptor do webhook: http://127.0.0.1:{RECEIVER_PORT}/")

    backend, netfly_ok = None, False
    log1 = "/tmp/netfly-backend-1.log"
    try:
        # ── Fase 1: entrega ──
        destino1 = args.netfly_url or f"http://127.0.0.1:{RECEIVER_PORT}/"
        destino_real = bool(args.netfly_url)
        print(f"\n  backend #1 em :{BACKEND_PORT} com NETLIFY_AI_URL → {destino1}")
        open(log1, "wb").close()
        backend = start_backend(destino1, log1)
        if not wait_health():
            print("FAIL  backend não subiu — veja /tmp/netfly-backend-1.log")
            sys.exit(1)
        netfly_ok = True

        TC, TP, TA = jornada()
        TA_global = [TA, TC]
        ctrl = disparar_eventos(TC, TP, TA)
        fase_entrega(destino_real)

        # ── Fase 2: falha ──
        stop_backend(backend)
        backend = None
        log2 = "/tmp/netfly-backend-2.log"
        open(log2, "wb").close()
        backend = start_backend(f"http://127.0.0.1:{DEAD_PORT}/", log2)
        if not wait_health():
            print("FAIL  backend #2 não subiu — veja /tmp/netfly-backend-2.log")
            sys.exit(1)
        TC = TA_global[1]
        vaga_falha = fase_falha(ctrl, TC)

        # ── Fase 3: retry (destino de volta) ──
        stop_backend(backend)
        backend = None
        log3 = "/tmp/netfly-backend-3.log"
        open(log3, "wb").close()
        backend = start_backend(f"http://127.0.0.1:{RECEIVER_PORT}/", log3)
        if not wait_health():
            print("FAIL  backend #3 não subiu — veja /tmp/netfly-backend-3.log")
            sys.exit(1)
        fase_retry(vaga_falha, True)

        # ── Fases 4 e 5 ──
        fase_health()
        fase_authz(TC)

    finally:
        if not args.keep:
            stop_backend(backend)
            try:
                receiver.shutdown()
            except Exception:
                pass

    print("\n" + "═" * 64)
    if FAILURES:
        print(f"FALHAS ({len(FAILURES)}): " + "; ".join(FAILURES))
        sys.exit(1)
    print("SINCRONIZAÇÃO NETFLY E2E: TUDO OK")


if __name__ == "__main__":
    main()
