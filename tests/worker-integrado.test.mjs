// Worker de PRUEBA de la versión integrada: sirve el index.html limpio con el guard una sola vez y expone /api/places/search protegido.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../preview/guard-vista-temporal.js', import.meta.url), 'utf8');
const worker = (await import('../preview/sistema-campo-anadir-integrado.worker.mjs')).default;

test('sirve index.html + guard una sola vez, sin caché, sin buscador ficticio y con la marca de Geoapify activa/inactiva', async () => {
  for (const activo of [true, false]) {
    const r = await worker.fetch(new Request('https://prueba.example/?verify=buttons'), { GEOAPIFY_ENABLED: activo ? 'true' : 'false' });
    const html = await r.text();
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(html.replace(`<head><script>window.CAMPO_GEOAPIFY_ACTIVO=${activo};</script>`, '<head>').replace(`<script>\n${guard}</script>`, ''), source, 'sin guard ni marca, es exactamente el index.html de la rama');
    assert.equal(html.split('integrado-v1').length - 1, 1); assert.equal(html.includes('campoBuscarLugares'), false); assert.equal(html.includes('PRUEBA ·'), false);
  }
  assert.equal((await worker.fetch(new Request('https://prueba.example/otra'), {})).status, 404);
});

test('/api/places/search: sin configuración 503, sin sesión 401 y nunca consulta Geoapify sin autorización', async () => {
  const llamadas = []; const real = globalThis.fetch; globalThis.fetch = async (u) => { llamadas.push(String(u)); return new Response('{}', { status: 401 }); };
  try {
    const env = { GEOAPIFY_ENABLED: 'true', GEOAPIFY_API_KEY: 'x', SUPABASE_URL: 'https://proyecto.example', SUPABASE_ANON_KEY: 'a', PLACES_RATE_LIMITER: { limit: async () => ({ success: true }) } };
    assert.equal((await worker.fetch(new Request('https://prueba.example/api/places/search?q=walmart'), { GEOAPIFY_ENABLED: 'false' })).status, 503);
    assert.equal((await worker.fetch(new Request('https://prueba.example/api/places/search?q=walmart'), env)).status, 401);
    assert.equal((await worker.fetch(new Request('https://prueba.example/api/places/search?q=walmart', { headers: { authorization: 'Bearer falso' } }), env)).status, 401);
    assert.equal(llamadas.some((u) => u.includes('geoapify')), false);
  } finally { globalThis.fetch = real; }
});
