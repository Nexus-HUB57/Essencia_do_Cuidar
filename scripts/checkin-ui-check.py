#!/usr/bin/env python3
"""
Verificação visual do fluxo de check-in / check-out no dashboard.

Sobe um protocolo em custódia via API, entra no dashboard com o navegador
e confere que os botões da UI aparecem no estado certo. Salva screenshots.

Uso: python3 scripts/checkin-ui-check.py http://localhost:4000 [OUT_DIR]
"""
import sys, os, time, urllib.request, urllib.error, json, base64
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/shots"
os.makedirs(OUT, exist_ok=True)
SUF = str(int(time.time()))[-6:]

ERROS = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}")
        except Exception:
            return e.code, {"raw": raw[:200]}


def check(label, cond, detail=""):
    print(f"  {'✓' if cond else '✗'} {label}" + (f"  — {detail}" if detail else ""))
    if not cond:
        ERROS.append(label)


# ── monta o cenário via API ────────────────────────────────────────────────
call("POST", "/api/auth/cadastro", body={"tipo_usuario": "contratante", "nome": "UI Contratante",
     "email": f"ui-c-{SUF}@demo.com", "senha": "demo1234", "telefone": "11988887777"})
call("POST", "/api/auth/cadastro", body={"tipo_usuario": "profissional", "nome": "UI Profissional",
     "email": f"ui-p-{SUF}@demo.com", "senha": "demo1234", "telefone": "11977776666"})
_, r = call("POST", "/api/auth/login", body={"email": f"ui-c-{SUF}@demo.com", "senha": "demo1234"})
TC = r["token"]
_, r = call("POST", "/api/auth/login", body={"email": f"ui-p-{SUF}@demo.com", "senha": "demo1234"})
TP = r["token"]

call("PUT", "/api/profissionais/me", TP, {"profissao": "tecnico_enfermagem", "regiao": "São Paulo - SP",
     "cidade": "São Paulo", "disponibilidade": ["manha", "tarde"], "especialidades": ["Geriatria"]})
_, r = call("POST", "/api/vagas", TC, {"paciente_sexo": "F", "paciente_idade": 80,
     "paciente_diagnostico": "Geriatria", "complexidade": "baixa",
     "servico_descricao": "Cuidados domiciliares", "profissional_desejado": "Técnico de Enfermagem",
     "jornada_horario": "08h às 12h", "jornada_escala": "Seg a Sex", "tipo_contrato": "PJ",
     "remuneracao_tipo": "hora", "remuneracao_valor": 150, "regiao": "São Paulo - SP", "cidade": "São Paulo"})
VAGA = r["vaga"]["id"]
call("POST", "/api/candidaturas", TP, {"id_vaga": VAGA, "mensagem": "ok"})
_, r = call("GET", f"/api/candidaturas/vaga/{VAGA}", TC)
CID = r["candidatos"][0]["id"]
call("PATCH", f"/api/candidaturas/{CID}", TC, {"status_candidatura": "aceita"})
_, r = call("GET", "/api/protocolos?tipo=PCM", TP)
PCM = [p for p in r["protocolos"] if p["status"] == "enviado"][0]["id"]
_, r = call("POST", f"/api/protocolos/{PCM}/aceitar", TP)
PDC = r["pdc"]["id"]
call("POST", f"/api/protocolos/{PDC}/pagar", TC)
print(f"  cenário pronto: vaga={VAGA} pdc={PDC}\n")

# ── navegador ──────────────────────────────────────────────────────────────
with sync_playwright() as p:
    browser = p.chromium.launch()
    console_errs = []

    def entrar(page, email):
        page.goto(f"{BASE}/login", wait_until="networkidle", timeout=30000)
        page.fill('input[type="email"]', email)
        page.fill('input[type="password"]', "demo1234")
        page.click('button[type="submit"]')
        page.wait_for_timeout(3000)

    # ── profissional: deve ver "Fazer check-in" ──────────────────────────
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    # Força pt-BR: o i18n detecta o locale do browser, que aqui seria en-US.
    ctx.add_init_script("localStorage.setItem('essencia_lang', 'pt-BR')")
    page = ctx.new_page()
    page.on("console", lambda m: console_errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errs.append(str(e)))
    entrar(page, f"ui-p-{SUF}@demo.com")
    check("login do profissional entrou no dashboard", "/dashboard/profissional" in page.url, page.url)
    page.goto(f"{BASE}/dashboard/profissional", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1500)
    # Os protocolos ficam numa aba própria do dashboard.
    page.locator("text=Protocolos").first.click()
    page.wait_for_timeout(1500)

    tem_checkin = page.locator("text=Fazer check-in").count() > 0
    check("profissional vê o botão 'Fazer check-in'", tem_checkin)
    badge_espera = page.locator("text=Aguardando check-in").count() > 0
    check("badge mostra 'Aguardando check-in' antes da chegada", badge_espera)
    page.screenshot(path=f"{OUT}/1-profissional-checkin.png", full_page=True)

    # clica no check-in
    if tem_checkin:
        page.locator("text=Fazer check-in").first.click()
        page.wait_for_timeout(2500)
        tem_checkout = page.locator("text=Finalizar plantão").count() > 0
        check("após o check-in aparece 'Finalizar plantão (check-out)'", tem_checkout)
        check("timestamp do check-in aparece no card", page.locator("text=Chegada").count() > 0)
        badge_em = page.locator("text=Em plantão").count() > 0
        check("badge muda para 'Em plantão' depois do check-in", badge_em)
        page.screenshot(path=f"{OUT}/2-profissional-checkout.png", full_page=True)
    ctx.close()

    # ── contratante: deve ver "Confirmar presença" ───────────────────────
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_init_script("localStorage.setItem('essencia_lang', 'pt-BR')")
    page = ctx.new_page()
    page.on("console", lambda m: console_errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errs.append(str(e)))
    entrar(page, f"ui-c-{SUF}@demo.com")
    check("login do contratante entrou no dashboard", "/dashboard/contratante" in page.url, page.url)
    page.goto(f"{BASE}/dashboard/contratante", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1500)
    page.locator("text=Protocolos").first.click()
    page.wait_for_timeout(1500)
    tem_presenca = page.locator("text=Confirmar presença").count() > 0
    check("contratante vê 'Confirmar presença'", tem_presenca)
    page.screenshot(path=f"{OUT}/3-contratante-presenca.png", full_page=True)
    ctx.close()

    browser.close()

check("sem erros de console no navegador", len(console_errs) == 0, "; ".join(console_errs[:3]))
print(f"\n  screenshots em {OUT}")
if ERROS:
    print("\n  FALHAS: " + "; ".join(ERROS))
    sys.exit(1)
print("\n  UI DE CHECK-IN/CHECK-OUT OK")
