#!/usr/bin/env python3
"""
Verificação da camada PWA + realtime.

Cobre o que quebrou em produção e não aparece no smoke test de API:
  1. /sw.js precisa ser servido como JavaScript (não HTML do fallback SPA)
  2. o service worker precisa registrar e ficar ATIVO
  3. o handler de push precisa estar no SW effective (direto ou via
     importScripts) — sem ele a notificação nunca aparece
  4. /manifest.webmanifest precisa responder JSON válido
  5. o handshake do Socket.IO precisa passar (realtime no mesmo origin)

Uso: python3 scripts/pwa-check.py http://localhost:5173
"""
import sys, json, re
import urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
ERROS = []
CONSOLE = []


def check(label, cond, detail=""):
    print(f"  {'✓' if cond else '✗'} {label}" + (f"  — {detail}" if detail else ""))
    if not cond:
        ERROS.append(label)


def fetch(path):
    req = urllib.request.Request(BASE + path)
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status, r.headers.get("content-type", ""), r.read().decode("utf-8", "replace")


print(f"\n› PWA e realtime em {BASE}")

# ── 1. /sw.js ────────────────────────────────────────────────────────────
status, ctype, body = fetch("/sw.js")
check("/sw.js responde 200", status == 200, f"status={status}")
check("/sw.js é JavaScript (não o HTML do fallback SPA)",
      "javascript" in ctype.lower(), f"content-type={ctype}")
check("/sw.js não é o index.html", "<!doctype html" not in body.lower())

# ── 2. o handler de push está no SW effective ───────────────────────────
tem_push_direto = "addEventListener('push'" in body or 'addEventListener("push"' in body
importa = re.search(r'importScripts\(["\']/?([\w./-]+)["\']\)', body)
check("o SW efetivo tem handler de push (direto ou importado)",
      tem_push_direto or bool(importa),
      "importScripts -> /" + importa.group(1) if importa and not tem_push_direto else "")

if importa and not tem_push_direto:
    hstatus, hctype, hbody = fetch("/" + importa.group(1))
    check(f"/{importa.group(1)} responde 200", hstatus == 200, f"status={hstatus}")
    check(f"/{importa.group(1)} é JavaScript", "javascript" in hctype.lower(), hctype)
    check(f"/{importa.group(1)} registra o listener de push",
          "addEventListener('push'" in hbody or 'addEventListener("push"' in hbody)
    check(f"/{importa.group(1)} registra o clique na notificação",
          "notificationclick" in hbody)

# ── 3. manifest ──────────────────────────────────────────────────────────
mstatus, mctype, mbody = fetch("/manifest.webmanifest")
check("/manifest.webmanifest responde 200", mstatus == 200, f"status={mstatus}")
check("manifest tem Content-Type de manifest/JSON",
      "json" in mctype.lower(), f"content-type={mctype}")
try:
    man = json.loads(mbody)
    check("manifest é JSON válido", True)
    check("manifest declara name e start_url",
          bool(man.get("name")) and bool(man.get("start_url")),
          f"name={man.get('name')} start_url={man.get('start_url')}")
except Exception as e:
    check("manifest é JSON válido", False, str(e))

# ── 4. handshake do Socket.IO ───────────────────────────────────────────
try:
    sstatus, sctype, sbody = fetch("/socket.io/?EIO=4&transport=polling")
    check("handshake do Socket.IO responde", sstatus == 200, f"status={sstatus}")
    check("handshake do Socket.IO não é HTML",
          "<!doctype html" not in sbody.lower() and sbody.startswith("0{"),
          sbody[:60].replace("\n", " "))
except Exception as e:
    check("handshake do Socket.IO responde", False, str(e))

# ── 5. registro e ativação do service worker no navegador ───────────────
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_init_script("localStorage.setItem('essencia_lang', 'pt-BR')")
    page = ctx.new_page()
    page.on("console", lambda m: CONSOLE.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: CONSOLE.append(str(e)))

    page.goto(BASE + "/", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(3000)

    reg = page.evaluate("""async () => {
        const reg = await navigator.serviceWorker.getRegistration('/');
        if (!reg) return { existe: false };
        const alvo = reg.active || reg.installing || reg.waiting;
        return {
            existe: true,
            estado: alvo ? alvo.state : null,
            scope: reg.scope,
            temPush: !!reg.pushManager
        };
    }""")
    check("service worker registrado", reg.get("existe"), json.dumps(reg, ensure_ascii=False))
    check("service worker ATIVO", reg.get("estado") in ("activated", "redundant"), f"estado={reg.get('estado')}")
    check("scope cobre a raiz", str(reg.get("scope", "")).endswith("/"),
          reg.get("scope", ""))

    # ServiceWorkerRegistration.pushManager disponível?
    tem_pm = page.evaluate("""async () => {
        const reg = await navigator.serviceWorker.getRegistration('/');
        if (!reg) return false;
        return !!(reg.pushManager);
    }""")
    check("pushManager disponível no registration", tem_pm)

    ctx.close()
    browser.close()

check("sem erros de console", len(CONSOLE) == 0, "; ".join(CONSOLE[:3]))
print()
if ERROS:
    print("FALHAS: " + "; ".join(ERROS))
    sys.exit(1)
print("CAMADA PWA/REALTIME OK")
