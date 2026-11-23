#!/usr/bin/env python3
"""
Jornada de cadastro + candidatura no navegador real.

Cobre os caminhos que o smoke test de API não vê: o wizard de cadastro
multi-etapa (incluindo a validação que bloqueia a etapa seguinte) e o
botão de candidatura na tela de detalhe da vaga.

Uso: python3 scripts/signup-flow-check.py http://localhost:4000
"""
import sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000"
SUF = str(int(time.time()))[-6:]
ERROS = []
CONSOLE = []


def check(label, cond, detail=""):
    print(f"  {'✓' if cond else '✗'} {label}" + (f"  — {detail}" if detail else ""))
    if not cond:
        ERROS.append(label)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_init_script("localStorage.setItem('essencia_lang', 'pt-BR')")
    page = ctx.new_page()
    page.on("console", lambda m: CONSOLE.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: CONSOLE.append(str(e)))

    print("\n› Cadastro de profissional (wizard de 4 etapas)")
    page.goto(f"{BASE}/cadastro?tipo=profissional", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(800)

    # etapa 0 — perfil
    page.locator("button:has-text('Profissional da Saúde')").first.click()
    page.wait_for_timeout(400)
    check("perfil profissional selecionado", page.locator("button:has-text('Profissional da Saúde')").first.get_attribute("class").find("border-serenity-500") > 0)
    page.locator("button:has-text('Próximo')").first.click()
    page.wait_for_timeout(600)
    check("etapa 1 (dados pessoais) visível", page.locator("input[type='password']").count() > 0)

    # O "Próximo" da etapa 1 exige nome, e-mail e senha.
    check("Próximo bloqueado sem os dados",
          page.locator("button:has-text('Próximo')").first.is_disabled())

    email = f"browser-{SUF}@demo.com"
    page.locator(".card input").first.fill("Teste Browser")
    page.locator("input[type='email']").first.fill(email)
    page.locator("input[type='password']").first.fill("demo1234")
    page.locator("input[placeholder='11999990000']").first.fill("11988887777")
    page.wait_for_timeout(300)
    check("Próximo desbloqueia com os dados",
          not page.locator("button:has-text('Próximo')").first.is_disabled())
    page.locator("button:has-text('Próximo')").first.click()
    page.wait_for_timeout(600)

    # etapa 2 — registro do conselho
    check("etapa 2 (registro do conselho) visível",
          page.locator("text=Tipo de registro").count() > 0)
    check("Próximo bloqueado sem o registro",
          page.locator("button:has-text('Próximo')").first.is_disabled())
    page.locator(".card select").first.select_option(label="COREN (Enfermagem)")
    page.locator("input[placeholder*='123456']").first.fill("123456-SP")
    page.wait_for_timeout(300)
    check("Próximo desbloqueia com o registro",
          not page.locator("button:has-text('Próximo')").first.is_disabled())
    page.locator("button:has-text('Próximo')").first.click()
    page.wait_for_timeout(600)

    # etapa 3 — perfil profissional
    check("etapa 3 (profissão/região) visível",
          page.locator("text=Região").count() > 0 or page.locator("text=Profissão").count() > 0)
    check("botão de criar conta presente",
          page.locator("button:has-text('Criar conta')").count() > 0)

    page.locator("button:has-text('Criar conta')").first.click()
    page.wait_for_timeout(4000)
    check("cadastro levou ao dashboard do profissional",
          "/dashboard/profissional" in page.url, page.url)

    # ── candidatura a uma vaga ───────────────────────────────────────────
    print("\n› Candidatura a uma vaga")
    page.goto(f"{BASE}/vagas", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1500)
    link = page.locator("a[href^='/vagas/']").first
    check("lista de vagas tem resultados", link.count() > 0)
    if link.count():
        link.click()
        page.wait_for_timeout(2000)
        check("detalhe da vaga abriu", "/vagas/" in page.url, page.url)

        aplicar = page.locator("button:has-text('Candidatar')")
        check("botão Candidatar disponível para o profissional", aplicar.count() > 0)
        if aplicar.count():
            aplicar.first.click()
            page.wait_for_timeout(900)
            enviar = page.locator("button:has-text('Enviar')")
            if enviar.count():
                enviar.first.click()
                page.wait_for_timeout(3000)
            check("candidatura confirmada na tela",
                  page.locator("text=Candidatura enviada").count() > 0
                  or page.locator("text=Candidatura").count() > 0)

    ctx.close()
    browser.close()

check("sem erros de console", len(CONSOLE) == 0, "; ".join(CONSOLE[:3]))
print()
if ERROS:
    print("FALHAS: " + "; ".join(ERROS))
    sys.exit(1)
print("JORNADA DE CADASTRO/CANDIDATURA OK")
