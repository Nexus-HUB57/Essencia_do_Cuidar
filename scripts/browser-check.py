#!/usr/bin/env python3
"""
Varredura de erros de runtime no app rodando (console + page errors +
requisições falhas). Usado para achar bugs que a suíte não pega.

Uso: python3 scripts/browser-check.py http://localhost:4000
"""
import sys, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000"
anon = sys.argv[2] if len(sys.argv) > 2 else None

RUNTIMES = []
PAGE_ERRORS = []
FAILED_REQ = []
CONSOLE_ERROR = []


def hook(page):
    page.on("console", lambda m: CONSOLE_ERROR.append(f"[{page.url}] {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: PAGE_ERRORS.append(f"[{page.url}] {e}"))
    page.on("requestfailed", lambda r: FAILED_REQ.append(f"[{page.url}] {r.method} {r.url} — {r.failure}"))
    page.on(
        "response",
        lambda r: FAILED_REQ.append(f"[{page.url}] {r.status} {r.request.method} {r.url}")
        if r.status >= 400
        else None,
    )


def visit(ctx, path, label, login=None):
    page = ctx.new_page()
    hook(page)
    try:
        if login:
            page.goto(f"{BASE}/login", wait_until="networkidle", timeout=30000)
            page.fill('input[type="email"]', login[0])
            page.fill('input[type="password"]', login[1])
            page.click('button[type="submit"]')
            page.wait_for_timeout(2500)
        page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1200)
        print(f"  ✓ {label:28s} {path}")
    except Exception as e:
        print(f"  ✗ {label:28s} {path} — {type(e).__name__}: {str(e)[:90]}")
    finally:
        page.close()


with sync_playwright() as p:
    browser = p.chromium.launch()

    print("\n› Páginas públicas")
    ctx = browser.new_context()
    for path, label in [
        ("/", "landing"),
        ("/como-funciona", "como funciona"),
        ("/vagas", "vagas públicas"),
        ("/login", "login"),
        ("/cadastro", "cadastro"),
    ]:
        visit(ctx, path, label)
    ctx.close()

    print("\n› Profissional logado")
    ctx = browser.new_context()
    visit(ctx, "/dashboard/profissional", "dashboard profissional", login=("ana@demo.com", "demo1234"))
    ctx.close()

    print("\n› Contratante logado")
    ctx = browser.new_context()
    visit(ctx, "/dashboard/contratante", "dashboard contratante", login=("maria@demo.com", "demo1234"))
    ctx.close()

    print("\n› Perfil público")
    ctx = browser.new_context()
    visit(ctx, "/profissional/3", "perfil profissional")
    visit(ctx, "/vagas/1", "detalhe da vaga")
    ctx.close()

    browser.close()

print("\n" + "=" * 64)
print(f"console.error:  {len(CONSOLE_ERROR)}")
for e in CONSOLE_ERROR[:25]:
    print("   ", e[:190])
print(f"pageerror:      {len(PAGE_ERRORS)}")
for e in PAGE_ERRORS[:25]:
    print("   ", e[:190])
print(f"req falha/4xx+: {len(FAILED_REQ)}")
for e in FAILED_REQ[:25]:
    print("   ", e[:190])
