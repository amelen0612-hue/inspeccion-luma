import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const workerPath = new URL('../preview/sistema-campo-anadir-geoapify-temporal.worker.mjs', import.meta.url);
const workerSource = fs.readFileSync(workerPath, 'utf8');
const workerModule = await import(pathToFileURL(workerPath.pathname));

function extractRoute() {
  const startToken = 'const PAGINA = ';
  const start = workerSource.indexOf(startToken) + startToken.length;
  const end = workerSource.indexOf(';\n\nconst LUGARES_SIMULADOS', start);
  const page = JSON.parse(workerSource.slice(start, end));
  const pagesStart = page.indexOf('const PAGES=') + 'const PAGES='.length;
  const pagesEnd = page.indexOf(';\nlet current=', pagesStart);
  return JSON.parse(page.slice(pagesStart, pagesEnd)).ruta;
}

test('el endpoint temporal usa solamente los ocho lugares simulados', async () => {
  const response = await workerModule.default.fetch(new Request('https://temporal.invalid/api/places/search?q=prueba'), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.results.length, 8);
  assert.ok(body.results.every(item => item.provider === 'simulado'));
});

test('sin flag y sin clave nunca intenta consultar Geoapify', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls += 1; throw new Error('No debe salir a red'); };
  try {
    const response = await workerModule.default.fetch(new Request('https://temporal.invalid/api/places/search?q=farmacia'), {});
    assert.equal(response.status, 200);
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('el iframe consulta el adaptador y no conserva el buscador directo anterior', () => {
  assert.match(workerSource, /installGeoapifyPlaceSearch/);
  assert.match(workerSource, /getAccessToken/);
  assert.doesNotMatch(workerSource, /await new Promise\(r=>setTimeout\(r,350\)\)/);
});

test('el indicador calcula la misma próxima parada utilizada por el botón', () => {
  const route = extractRoute();
  assert.match(route, /const proximo=indiceSiguiente\(ruta,ruta\.tramo\)/);
  assert.match(route, /Siguiente parada: '\+ruta\.puntos\[proximo\]\.name/);
  assert.match(route, /const indice=indiceSiguiente\(ruta,ruta\.tramo\)/);
});

test('añadir una parada ya visitada conserva su estado', () => {
  const route = extractRoute();
  assert.match(route, /if\(existente\.visitado\)\{toast\([^}]+se conserva en el historial[^}]+return;\}/);
  assert.doesNotMatch(route, /if\(existente\.visitado\)\{deshacerVisitada/);
});

test('la vista temporal mantiene bloqueados datos reales de Supabase', () => {
  assert.match(workerSource, /Vista temporal aislada: datos remotos bloqueados/);
  assert.match(workerSource, /if\(prop==='functions'\)/);
  assert.match(workerSource, /return bloqueado; \/\/ from, rpc, storage, channel, realtime, schema, rest y cualquier otro/);
});

test('la activación real exige flag y el handler protegido compartido', () => {
  assert.match(workerSource, /if\(env\.GEOAPIFY_ENABLED==='true'\)return handleGeoapifySearch/);
});

test('el HTML entregado no rompe el script que contiene las páginas embebidas', async () => {
  const vm=await import('node:vm');
  const html=await (await workerModule.default.fetch(new Request('https://preview.invalid/'),{})).text();
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    assert.doesNotThrow(()=>new vm.Script(match[1]));
  }
});
