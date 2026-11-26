/**
 * Diagnóstico da conta Render via API (usa RENDER_API_KEY do ambiente).
 *
 * Mostra: serviços existentes (nome, id, suspenso?), e os últimos deploys
 * de cada web service. Usado pelo workflow .github/workflows/diag-render.yml
 * para explicar estados "no-deploy" / 502 instantâneo / suspensão por
 * limite de horas do plano free.
 *
 * Uso manual:
 *   RENDER_API_KEY=... python3 scripts/diag-render.py
 */
const AUTH = { headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}` } };

async function get(url) {
  const res = await fetch(url, AUTH);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

const services = await get('https://api.render.com/v1/services?limit=20');
const lista = Array.isArray(services) ? services : services.services || [];

console.log('== Serviços da conta ==');
const webIds = [];
for (const item of lista) {
  const s = item.service || item;
  console.log('- id:', s.id);
  console.log('  nome:', s.name);
  console.log('  tipo:', s.type || (s.serviceDetails || {}).type);
  console.log('  suspenso:', s.suspended, '| motivo:', s.suspendReason || '-');
  console.log('  url:', (s.serviceDetails || {}).url || s.slug || '-');
  if ((s.type || '').includes('web') || s.type === 'web_service') webIds.push([s.id, s.name]);
}

console.log('\n== Últimos 5 deploys por web service ==');
for (const [id, nome] of webIds) {
  console.log(`--- ${nome} (${id}) ---`);
  try {
    const deploys = await get(`https://api.render.com/v1/services/${id}/deploys?limit=5`);
    const arr = Array.isArray(deploys) ? deploys : deploys.deploys || [];
    for (const item of arr) {
      const d = item.deploy || item;
      const msg = d.commit ? (d.commit.message || '').slice(0, 60) : '';
      console.log('  ', d.createdAt, '|', d.status, '|', msg);
    }
  } catch (e) {
    console.log('   erro ao listar deploys:', e.message);
  }
}
