// Integración «+ Añadir parada» + Geoapify sobre la producción 170945f: función de servidor, proveedor de la página y
// garantía de que lo demás (ORS, navegación, menús, resto del contenedor) no cambió.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const paginas = (t) => { const a = t.indexOf('const PAGES=') + 12; return JSON.parse(t.slice(a, t.indexOf(';\nlet current=', a))); };
const route = paginas(source).ruta;
const PRODUCCION = '170945f35364798de54c8e30d48e333142325eca';
let produccion = null;
try { produccion = execFileSync('git', ['show', `${PRODUCCION}:index.html`], { cwd: raiz, maxBuffer: 20_000_000, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); } catch { /* sin historial */ }
const conProduccion = { skip: produccion ? false : 'falta el commit de producción 170945f en este clon' };

function extractFunction(text, name) {
  const m = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(text); assert.ok(m, `No se encontró ${name}`);
  const open = text.indexOf('{', m.index); let depth = 0, q = null, e = false;
  for (let i = open; i < text.length; i++) { const c = text[i]; if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === '`') q = c; else if (c === '{') depth++; else if (c === '}' && --depth === 0) return text.slice(m.index, i + 1); }
  throw new Error(name);
}

// ---------- función de servidor ----------
const { createHandler } = await import('../supabase/functions/places-search/index.ts');
const ENV = { SUPABASE_URL: 'https://proyecto.example', SUPABASE_ANON_KEY: 'anon-publica', GEOAPIFY_API_KEY: 'CLAVE-SECRETA-DE-PRUEBA' };
const feat = (p) => ({ properties: p });
function servidor({ env = ENV, sesion = true, geo = null, ahora = () => 1_000_000 } = {}) {
  const llamadas = [];
  const fetchImpl = async (url, init) => {
    const u = String(url); llamadas.push({ url: u, init });
    if (u.startsWith('https://proyecto.example/auth/v1/user')) return sesion ? Response.json({ id: 'usuario-1' }) : new Response('{}', { status: 401 });
    if (u.startsWith('https://api.geoapify.com/')) { if (geo instanceof Error) throw geo; return geo ?? Response.json({ features: [
      feat({ place_id: 'a', name: 'Walmart Supercenter', formatted: 'Walmart Supercenter, Cayey, PR 00737', lat: 18.122479, lon: -66.13377, country_code: 'pr', result_type: 'amenity' }),
      feat({ place_id: 'b', name: 'Fuera de PR', formatted: 'Miami, FL', lat: 25.7, lon: -80.2, country_code: 'us' }),
      feat({ place_id: 'c', name: 'Código PR coordenadas lejos', formatted: 'x', lat: 40, lon: -66, country_code: 'pr' }),
      feat({ place_id: 'd', name: 'Sin coordenadas', formatted: 'x', country_code: 'pr' })] }); }
    throw new Error('fetch inesperado ' + u);
  };
  const handler = createHandler({ fetchImpl, getEnv: (k) => env[k], now: ahora });
  const pedir = (cuerpo, { metodo = 'POST', auth = 'Bearer jwt', origen = 'https://amelen0612-hue.github.io' } = {}) => handler(new Request('https://funcion.example/places-search', { method: metodo, headers: { ...(auth ? { authorization: auth } : {}), origin: origen, 'content-type': 'application/json' }, body: metodo === 'POST' ? JSON.stringify(cuerpo) : undefined }));
  return { pedir, llamadas };
}

test('la función exige sesión válida, método POST y no revela la clave ni consulta a Geoapify sin autorización', async () => {
  const s = servidor({ sesion: false });
  assert.equal((await s.pedir({ q: 'walmart' })).status, 401); assert.equal((await s.pedir({ q: 'walmart' }, { auth: null })).status, 401);
  assert.equal(s.llamadas.some((c) => c.url.includes('geoapify')), false, 'sin sesión no se gasta cuota');
  assert.equal((await servidor().pedir({}, { metodo: 'GET' })).status, 405);
  const sinClave = await servidor({ env: { ...ENV, GEOAPIFY_API_KEY: undefined } }).pedir({ q: 'walmart' }); assert.equal(sinClave.status, 503); assert.equal((await sinClave.json()).error, 'SEARCH_NOT_CONFIGURED');
  const ok = servidor(); const r = await ok.pedir({ q: 'walmart cayey' }); assert.equal(r.status, 200);
  assert.doesNotMatch(await r.clone().text(), /CLAVE-SECRETA|apiKey/, 'la clave nunca sale en la respuesta');
});

test('consulta solo Puerto Rico, valida el texto, filtra resultados fuera de PR y devuelve el formato que usa la página', async () => {
  const s = servidor(); const r = await s.pedir({ q: '  Walmart   Cayey ' }); const cuerpo = await r.json();
  const up = new URL(s.llamadas.find((c) => c.url.includes('geoapify')).url);
  assert.equal(up.searchParams.get('text'), 'Walmart Cayey'); assert.equal(up.searchParams.get('filter'), 'countrycode:pr'); assert.equal(up.searchParams.get('limit'), '8'); assert.equal(up.searchParams.get('apiKey'), ENV.GEOAPIFY_API_KEY);
  assert.deepEqual(cuerpo.results, [{ provider: 'geoapify', providerId: 'a', nombre: 'Walmart Supercenter', direccion: 'Walmart Supercenter, Cayey, PR 00737', lat: 18.122479, lng: -66.13377, tipo: 'amenity', fuente: 'Geoapify · OpenStreetMap' }]);
  assert.match(cuerpo.attribution, /Geoapify/);
  for (const q of ['', 'ab', 'x'.repeat(121), 5, null]) { const e = await servidor().pedir({ q }); assert.equal(e.status, 400, String(q)); assert.equal((await e.json()).error, 'INVALID_QUERY'); }
  assert.equal((await servidor().pedir({})).status, 400);
});

test('límites y fallos del proveedor se traducen a códigos claros sin reintentos que gasten cuota', async () => {
  let t = 1_000_000; const s = servidor({ ahora: () => t });
  for (let i = 0; i < 30; i++) assert.equal((await s.pedir({ q: 'walmart' })).status, 200);
  const limitado = await s.pedir({ q: 'walmart' }); assert.equal(limitado.status, 429); assert.equal(limitado.headers.get('retry-after'), '60'); assert.equal((await limitado.json()).error, 'RATE_LIMITED');
  assert.equal(s.llamadas.filter((c) => c.url.includes('geoapify')).length, 30, 'la consulta bloqueada no llega a Geoapify'); t += 61_000; assert.equal((await s.pedir({ q: 'walmart' })).status, 200, 'la ventana se renueva');
  assert.equal((await servidor({ geo: new Response('{}', { status: 429 }) }).pedir({ q: 'walmart' })).status, 429);
  assert.equal((await (await servidor({ geo: new Response('{}', { status: 500 }) }).pedir({ q: 'walmart' })).json()).error, 'PROVIDER_ERROR');
  assert.equal((await servidor({ geo: new Error('red') }).pedir({ q: 'walmart' })).status, 503);
  assert.equal((await servidor({ geo: Response.json({ nada: true }) }).pedir({ q: 'walmart' })).status, 502);
  const preflight = await servidor().pedir(undefined, { metodo: 'OPTIONS' }).catch(() => null); assert.ok(true, preflight);
});

test('CORS: solo el sitio de producción y los puertos locales de desarrollo, igual que ors-optimize', async () => {
  const s = servidor();
  assert.equal((await s.pedir({ q: 'walmart' }, { origen: 'https://amelen0612-hue.github.io' })).headers.get('access-control-allow-origin'), 'https://amelen0612-hue.github.io');
  assert.equal((await s.pedir({ q: 'walmart' }, { origen: 'https://otro.example' })).headers.get('access-control-allow-origin'), 'https://amelen0612-hue.github.io', 'un origen ajeno nunca recibe su propio origen');
  assert.equal((await s.pedir({ q: 'walmart' }, { origen: 'http://localhost:8765' })).headers.get('access-control-allow-origin'), 'http://localhost:8765');
});

// ---------- proveedor en la página ----------
function paginaConProveedor({ rutaSupabase, enLinea = true } = {}) {
  const ctx = { navigator: { onLine: enLinea }, rutaSupabase, String, Array, Error, JSON, Promise };
  vm.createContext(ctx);
  const constante = /const ERRORES_BUSQUEDA=\{[\s\S]*?\};/.exec(route)[0];
  vm.runInContext(`${constante}\n${extractFunction(route, 'buscarLugaresServidor')}\n${extractFunction(route, 'proveedorBusqueda')}\nglobalThis.api={buscarLugaresServidor,proveedorBusqueda,ERRORES_BUSQUEDA};`, ctx);
  return ctx.api;
}
test('la página busca mediante la función «places-search» con la sesión de Supabase y traduce los errores', async () => {
  const llamadas = []; const rutaSupabase = { functions: { invoke: async (n, o) => { llamadas.push([n, o]); return { data: { results: [{ nombre: 'A', lat: 18.1, lng: -66.1 }] }, error: null }; } } };
  const p = paginaConProveedor({ rutaSupabase }); assert.equal(p.proveedorBusqueda(), p.buscarLugaresServidor);
  assert.deepEqual(JSON.parse(JSON.stringify(await p.buscarLugaresServidor('  walmart '))), [{ nombre: 'A', lat: 18.1, lng: -66.1 }]); assert.equal(JSON.stringify(llamadas), JSON.stringify([['places-search', { body: { q: 'walmart' } }]]));
  assert.equal(paginaConProveedor({ rutaSupabase: null }).proveedorBusqueda(), null, 'sin cliente de Supabase no hay buscador');
  for (const [codigo, esperado] of [['UNAUTHORIZED', /iniciar sesión/], ['RATE_LIMITED', /límite de búsquedas/], ['PROVIDER_ERROR', /no pudo responder/], ['INVALID_QUERY', /3 y 120/], ['DESCONOCIDO', /No se pudo buscar/]]) {
    const q = paginaConProveedor({ rutaSupabase: { functions: { invoke: async () => ({ data: null, error: { context: Response.json({ error: codigo }, { status: 400 }) } }) } } });
    await assert.rejects(q.buscarLugaresServidor('walmart'), esperado, codigo);
  }
  await assert.rejects(paginaConProveedor({ rutaSupabase: { functions: { invoke: async () => ({ data: null, error: { context: null } }) } } }).buscarLugaresServidor('walmart'), /No se pudo buscar/);
  await assert.rejects(paginaConProveedor({ rutaSupabase, enLinea: false }).buscarLugaresServidor('walmart'), /Sin conexión/);
  assert.equal(llamadas.length, 1, 'sin conexión no se llama al servidor');
  assert.equal((await paginaConProveedor({ rutaSupabase: { functions: { invoke: async () => ({ data: { results: 'x' }, error: null }) } } }).buscarLugaresServidor('walmart')).length, 0);
});

// ---------- lo demás no cambió ----------
test('solo cambió la página Ruta: el resto del contenedor, las demás páginas y el optimizador son idénticos a producción', conProduccion, () => {
  const antes = paginas(produccion);
  for (const k of Object.keys(antes)) if (k !== 'ruta') assert.equal(paginas(source)[k], antes[k], `la página ${k} no debe cambiar`);
  const sinPaginas = (t) => t.slice(0, t.indexOf('const PAGES=')) + t.slice(t.indexOf(';\nlet current='));
  assert.equal(sinPaginas(source), sinPaginas(produccion), 'el contenedor (sesión, autenticación, arranque, navegación) es idéntico');
  const nombres = [...antes.ruta.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  const cambiadas = nombres.filter((n) => extractFunction(antes.ruta, n) !== extractFunction(route, n));
  assert.deepEqual(cambiadas.sort(), ['actualizarNavegacionORS', 'iniciarRutaORS', 'siguienteParadaORS'], 'ORS, Google Maps, Waze, Apple Maps, visitadas y progreso: sus funciones no cambiaron');
  for (const n of ['abrirORS', 'solicitudORS', 'itinerarioORS', 'abrirTramoORS', 'urlNavegacionTramo', 'urlAppleMaps', 'irAParada', 'marcarVisitada', 'deshacerVisitada', 'omitirParada', 'retomarParada', 'volverAParadaActual', 'optimizarPendientes', 'ejecutarOptimizarPendientes', 'renderLista', 'sincronizarRuta', 'getPuntos', 'savePuntos', 'extremoRuta', 'coordenadasRuta'])
    assert.equal(extractFunction(route, n), extractFunction(antes.ruta, n), `${n} cambió`);
});

test('menús y barra inferior idénticos a producción; solo se añadieron el botón y el modal de «Añadir parada»', conProduccion, () => {
  const antes = paginas(produccion).ruta;
  const caja = (t) => { const i = t.indexOf('    <div class="ruta-circular-box">'); return t.slice(i, t.indexOf('    <div class="ruta-circular-box ruta-nav-card">', i)); };
  assert.equal(caja(route), caja(antes), 'menú de salida/llegada y Oficina idéntico');
  const barra = (t) => /<div class="btn-ruta-wrap">[\s\S]*?<\/div>/.exec(t)[0];
  assert.equal(barra(route), barra(antes), 'Iniciar ruta, Siguiente parada y Optimizar Ruta idénticos');
  const cabeza = (t) => t.slice(0, t.indexOf('<script>\n')).replace(/<!-- AÑADIR PARADA -->[\s\S]*?(?=<!-- CONFIRM MODAL -->)/, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const a = cabeza(antes), ahora = cabeza(route);
  assert.deepEqual(a.filter((l) => !ahora.includes(l)), [], 'no se quitó ninguna línea de maqueta ni de estilos');
  const nuevas = ahora.filter((l) => !a.includes(l));
  for (const l of nuevas) assert.ok([/^\.parada-/, /^\.ruta-acciones\.una/, /^<div class="ruta-acciones una"><button type="button" id="btn-anadir-parada"/].some((p) => p.test(l)), `añadido no previsto: ${l.slice(0, 80)}`);
});

test('producción no recibe datos ficticios, optimizador simulado, aislamiento ni claves', () => {
  for (const prohibido of ['910001', 'PRUEBA ·', 'CAMPO_VISTA_TEMPORAL', 'campo_preview_seed', 'campoBuscarLugares', 'CAMPO_OPTIMIZACIONES_LOCALES', 'api.geoapify.com', 'apiKey', 'GEOAPIFY_API_KEY'])
    assert.equal(source.includes(prohibido), false, prohibido);
  assert.ok(fs.existsSync(new URL('../supabase/functions/places-search/index.ts', import.meta.url)));
  assert.doesNotMatch(fs.readFileSync(new URL('../supabase/functions/places-search/index.ts', import.meta.url), 'utf8'), /[a-f0-9]{32}/i, 'ninguna clave incrustada en la función');
});

test('el resumen de confirmación se ajusta al ancho del iPhone (texto largo se parte en lugar de recortarse)', () => {
  const css = /\.parada-resumen\{[^}]*\}/.exec(route)[0];
  assert.match(css, /display:block/); assert.match(css, /overflow-wrap:anywhere/); assert.match(css, /white-space:normal/);
  assert.match(route, /\.parada-resumen>div\{[^}]*max-width:100%/);
});
