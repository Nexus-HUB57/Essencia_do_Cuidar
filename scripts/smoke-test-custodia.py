#!/usr/bin/env python3
"""
Smoke test da jornada de custódia — matching → pagamento → check-in →
check-out → liberação.

Roda contra uma API no ar (dev, staging ou produção) e valida o caminho
COMPLETO do dinheiro: o pagamento entra pela custódia (nunca por fora), o
check-in e o check-out das duas partes acontecem na ordem certa, a
avaliação chega na reputação do matching e a liberação acontece uma única
vez.

Uso:
    node backend/src/index.js &
    python3 scripts/smoke-test-custodia.py [http://localhost:4000]

Sai com código 1 se qualquer verificação falhar.
"""
import json, urllib.request, urllib.error, base64, sys, time

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000"
FAIL = []

def call(method, path, token=None, body=None):
    req = urllib.request.Request(B + path, method=method)
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
            return e.code, {"raw": raw[:300]}

def check(label, cond, detail=""):
    print(f"  {'✓' if cond else '✗'} {label}" + (f"  — {detail}" if detail else ""))
    if not cond:
        FAIL.append(label)

def jid(token):
    p = token.split(".")[1]
    p += "=" * (-len(p) % 4)
    return json.loads(base64.urlsafe_b64decode(p))["id"]

print("═════ JORNADA E2E: matching → custódia → check-in → check-out → liberação ═════\n")

SUF = str(int(time.time()))[-6:]
for tipo, email, nome in [
    ("contratante", f"e2e-c-{SUF}@demo.com", "E2E Contratante"),
    ("profissional", f"e2e-p-{SUF}@demo.com", "E2E Profissional"),
]:
    call("POST", "/api/auth/cadastro", body={
        "tipo_usuario": tipo, "nome": nome, "email": email,
        "senha": "demo1234", "telefone": "11988887777"})

_, r = call("POST", "/api/auth/login", body={"email": f"e2e-c-{SUF}@demo.com", "senha": "demo1234"})
TC = r.get("token", "")
_, r = call("POST", "/api/auth/login", body={"email": f"e2e-p-{SUF}@demo.com", "senha": "demo1234"})
TP = r.get("token", "")
_, r = call("POST", "/api/auth/login", body={"email": "admin@demo.com", "senha": "admin1234"})
TA = r.get("token", "")
check("tokens de acesso obtidos", bool(TC and TP and TA))

PROF_ID = jid(TP)

st, _ = call("PUT", "/api/profissionais/me", TP, {
    "profissao": "tecnico_enfermagem", "regiao": "São Paulo - SP", "cidade": "São Paulo",
    "disponibilidade": ["manha", "tarde"], "especialidades": ["Pós-operatório", "Geriatria"]})
check("perfil do profissional salvo", st == 200)

st, r = call("POST", "/api/vagas", TC, {
    "paciente_sexo": "F", "paciente_idade": 79,
    "paciente_diagnostico": "Pós-operatório de quadril", "complexidade": "baixa",
    "servico_descricao": "Cuidados pós-operatórios e curativos",
    "profissional_desejado": "Técnico de Enfermagem",
    "jornada_horario": "08h às 12h", "jornada_escala": "Seg a Sex", "tipo_contrato": "PJ",
    "remuneracao_tipo": "hora", "remuneracao_valor": 150,
    "regiao": "São Paulo - SP", "cidade": "São Paulo"})
VAGA = r.get("vaga", {}).get("id")
check("vaga criada", st == 201 and bool(VAGA), f"id={VAGA}")

st, _ = call("POST", "/api/candidaturas", TP, {"id_vaga": VAGA, "mensagem": "Especializado"})
check("candidatura enviada", st == 201)

st, r = call("GET", f"/api/vagas/{VAGA}/recomendar", TC)
recs = r.get("recomendacoes", [])
top = recs[0] if recs else {}
check("matching ranqueia profissionais", len(recs) >= 1,
      f"{len(recs)} recomendação(ões), top score={top.get('score')} nível={top.get('nivel')}")

st, r = call("GET", f"/api/candidaturas/vaga/{VAGA}", TC)
cands = r.get("candidatos", [])
CID = cands[0]["id"] if cands else None
check("contratante vê a candidatura", st == 200 and bool(CID), f"id={CID}")

st, _ = call("PATCH", f"/api/candidaturas/{CID}", TC, {"status_candidatura": "aceita"})
check("candidatura aceita (PCP + PCM criados)", st == 200)

st, r = call("GET", "/api/protocolos?tipo=PCM", TP)
envios = [p for p in r.get("protocolos", []) if p["status"] == "enviado"]
PCM = envios[0]["id"] if envios else None
st, r = call("POST", f"/api/protocolos/{PCM}/aceitar", TP)
PDC = r.get("pdc", {}).get("id")
check("PCM aceito → PDC gerado", st == 200 and bool(PDC), f"pcm={PCM} pdc={PDC}")

st, r = call("POST", "/api/pagamentos", TC, {"id_vaga": VAGA, "metodo": "pix"})
check("pagamento responde", st == 201, f"via={r.get('via')} pix_flow={r.get('pix_flow')}")
check("pagamento delegou ao protocolo (custódia)", r.get("via") == "protocolo" and r.get("protocolo_id") == PDC)

st, r = call("GET", f"/api/protocolos/{PDC}", TC)
st_pdc = r.get("protocolo", {}).get("status")
check("protocolo em custódia (aguardando check-in)", st_pdc == "checkout_pendente", f"status={st_pdc}")
check("prazo de expiração zerado após o pagamento", r.get("protocolo", {}).get("expira_em") is None)

st, r = call("POST", f"/api/protocolos/{PDC}/checkin", TP,
             {"latitude": -23.5505, "longitude": -46.6333, "observacao": "Chegada no endereço"})
ci = r.get("checkin", {})
check("CHECK-IN registrado com geolocalização", st == 200 and ci.get("latitude") == -23.5505,
      f"em={ci.get('confirmado_em')}")

st, r = call("POST", f"/api/protocolos/{PDC}/checkin", TP, {})
check("check-in é idempotente", st == 200 and r.get("ja_feito") is True)

st, r = call("POST", f"/api/protocolos/{PDC}/checkin", TC, {})
check("presença confirmada pelo contratante", st == 200 and r.get("checkin", {}).get("tipo_user") == "contratante")

# O contratante não pode fechar o plantão antes do profissional (senão o
# protocolo fica em 'checkout_contratante', que nenhum cron processa).
st, r = call("POST", f"/api/protocolos/{PDC}/checkout", TC, {"nota": 5})
check("check-out fora de ordem é bloqueado", st == 400, str(r.get("error", ""))[:70])

st, r = call("POST", f"/api/protocolos/{PDC}/checkout", TP, {"comentario": "Plantão concluído."})
check("CHECK-OUT do profissional", st == 200 and r.get("protocolo", {}).get("status") == "checkout_profissional")

st, r = call("POST", f"/api/protocolos/{PDC}/checkout", TC,
             {"nota": 5, "comentario": "Excelente profissional, muito cuidadoso."})
check("CHECK-OUT do contratante → completo", st == 200 and r.get("checkout_completo") is True)

st, r = call("POST", f"/api/protocolos/{PDC}/liberar", TA)
check("liberação executada", st == 200, f"rail={r.get('rail')} transfer={r.get('transfer_id')}")
st, r = call("POST", f"/api/protocolos/{PDC}/liberar", TA)
check("liberação é idempotente", st == 200 and r.get("ja_liberado") is True)

print("\n  ── Estado final ──")
st, r = call("GET", f"/api/protocolos/{PDC}", TC)
check("protocolo liberado", r.get("protocolo", {}).get("status") == "liberado")
check("custódia liberada ao profissional", r.get("pagamento", {}).get("status") == "liberado_profissional")

st, r = call("GET", f"/api/protocolos/{PDC}/checkins", TC)
check("2 check-ins registrados", len(r.get("checkins", [])) == 2,
      ", ".join(f"{c['tipo_user']}@{c['confirmado_em']}" for c in r.get("checkins", [])))

st, r = call("GET", f"/api/protocolos/{PDC}/checkouts", TC)
check("2 check-outs registrados", len(r.get("checkouts", [])) == 2)

st, r = call("GET", f"/api/avaliacoes/profissional/{PROF_ID}")
check("avaliação do checkout gravada", r.get("stats", {}).get("total") == 1 and r.get("stats", {}).get("media") == 5,
      f"média={r.get('stats', {}).get('media')}")

st, r = call("GET", f"/api/profissionais/{PROF_ID}")
stats = r.get("stats", {})
check("reputação visível no perfil público", stats.get("media") == 5, f"media={stats.get('media')}")
check("atendimentos concluídos contabilizados", stats.get("vagas_concluidas", 0) >= 1,
      f"vagas_concluidas={stats.get('vagas_concluidas')}")

# O matcher não recomenda quem já se candidatou — então a reputação é
# medida numa segunda vaga, para a qual o profissional ainda não se candidatou.
st, r = call("POST", "/api/vagas", TC, {
    "paciente_sexo": "M", "paciente_idade": 81, "paciente_diagnostico": "Geriatria",
    "complexidade": "baixa", "servico_descricao": "Cuidados geriátricos domiciliares",
    "profissional_desejado": "Técnico de Enfermagem", "jornada_horario": "08h às 12h",
    "jornada_escala": "Seg a Sex", "tipo_contrato": "PJ", "remuneracao_tipo": "hora",
    "remuneracao_valor": 150, "regiao": "São Paulo - SP", "cidade": "São Paulo"})
VAGA2 = r.get("vaga", {}).get("id")
st, r = call("GET", f"/api/vagas/{VAGA2}/recomendar", TC)
recs = r.get("recomendacoes", [])
alvo = next((x for x in recs if x["profissional"]["id"] == PROF_ID), None)
reput = [m for m in (alvo or {}).get("motivosDetalhados", []) if m["codigo"].startswith("reputacao")]
check("matching recomenda o profissional em nova vaga", alvo is not None,
      f"score={alvo.get('score') if alvo else 'n/a'}")
check("matching enxerga a reputação do check-out", bool(reput) and reput[0]["pontos"] and reput[0]["pontos"] > 0,
      f"reputacao={reput[0]['pontos'] if reput else 'n/a'}")

print("\n" + ("═" * 62))
if FAIL:
    print(f"FALHAS ({len(FAIL)}): " + "; ".join(FAIL))
    sys.exit(1)
print("JORNADA E2E COMPLETA: TUDO OK")
