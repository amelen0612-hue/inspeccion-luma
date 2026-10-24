import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pagesStart = source.indexOf('const PAGES=') + 'const PAGES='.length;
const pagesEnd = source.indexOf(';\nlet current=', pagesStart);
assert.ok(pagesStart > 11 && pagesEnd > pagesStart, 'PAGES debe seguir siendo JSON extraíble');
const pages = JSON.parse(source.slice(pagesStart, pagesEnd));
const route = pages.ruta;

function extractFunction(text, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(text);
  assert.ok(match, `No se encontró ${name}`);
  const start = match.index;
  const open = text.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`Función incompleta: ${name}`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('la navegación de Ruta usa la misma pestaña y conserva el tramo antes de salir', () => {
  const openLeg = extractFunction(route, 'abrirTramoORS');
  const openSegments = extractFunction(route, 'abrirRutasEnTramos');
  assert.doesNotMatch(openLeg, /window\.open|['_"]_blank['_"]/);
  assert.doesNotMatch(openSegments, /window\.open|['_"]_blank['_"]/);
  assert.match(openLeg, /localStorage\.setItem\('ruta_ors_ultima'/);
  assert.ok(openLeg.indexOf("localStorage.setItem('ruta_ors_ultima'") < openLeg.indexOf('abrirNavegacionMismaPestana(url)'), 'el progreso debe persistirse antes de abrir Maps');
  assert.match(openLeg, /ruta\.tramo=tramoAnterior/);
  assert.match(openSegments, /target=['"]_top['"]/);

  const writes = [];
  const navigations = [];
  const context = {
    encodeURIComponent,
    localStorage: { setItem: (key, value) => writes.push([key, JSON.parse(value)]) },
    actualizarNavegacionORS: () => {},
    window: { parent: { abrirNavegacionMismaPestana: (url) => navigations.push(url) } },
  };
  vm.createContext(context);
  vm.runInContext(`${openLeg}; globalThis.openLeg=abrirTramoORS;`, context);
  const activeRoute = { tramo: 1, puntos: [{ lat: 18.4, lng: -66.1 }, { lat: 18.5, lng: -66.2 }] };
  context.openLeg(activeRoute, 1);
  assert.equal(activeRoute.tramo, 1);
  assert.equal(writes[0][0], 'ruta_ors_ultima');
  assert.equal(writes[0][1].tramo, 1);
  assert.equal(navigations.length, 1);

  context.window.parent.abrirNavegacionMismaPestana = () => { throw new Error('navegación bloqueada'); };
  const rollbackRoute = { tramo: 0, puntos: activeRoute.puntos };
  assert.throws(() => context.openLeg(rollbackRoute, 1), /navegación bloqueada/);
  assert.equal(rollbackRoute.tramo, 0, 'un fallo sin salida no debe adelantar la ruta');
});

test('el contenedor restaura la sesión con reintentos acotados al volver de iPhone', async () => {
  const sessionFunction = extractFunction(source, 'obtenerSesionCampo');
  assert.match(sessionFunction, /intento<3/);
  assert.match(sessionFunction, /setTimeout\(resolve,150\)/);
  assert.match(source, /addEventListener\('pageshow'/);
  assert.match(source, /addEventListener\('visibilitychange'/);
  assert.match(route, /window\.parent\.obtenerSesionCampo\(\)/);

  let calls = 0;
  const context = {
    window: { campoSupabase: { auth: { getSession: async () => {
      calls += 1;
      return calls < 3 ? { data: { session: null }, error: null } : { data: { session: { user: { id: 'u1' } } }, error: null };
    } } } },
    setTimeout: (callback) => { callback(); },
    console,
  };
  vm.createContext(context);
  vm.runInContext(`let campoSesionEnCurso=null; ${sessionFunction}; globalThis.run=obtenerSesionCampo;`, context);
  const session = await context.run();
  assert.equal(session.user.id, 'u1');
  assert.equal(calls, 3);
});

test('solo se permite Google Maps y la ruta interna queda preparada para el regreso', () => {
  const navigateFunction = extractFunction(source, 'abrirNavegacionMismaPestana');
  const assigned = [];
  const replaced = [];
  const context = {
    URL,
    location: { href: 'https://campo.example/#ruta', assign: (url) => assigned.push(url) },
    history: { replaceState: (...args) => replaced.push(args) },
    Error,
  };
  vm.createContext(context);
  vm.runInContext(`${navigateFunction}; globalThis.go=abrirNavegacionMismaPestana;`, context);
  context.go('https://www.google.com/maps/dir/?api=1&destination=18,-66');
  assert.equal(assigned.length, 1);
  assert.equal(replaced[0][2], '#ruta');
  assert.throws(() => context.go('https://example.com/maps/dir/?api=1'), /no permitido/);
});

test('optimizador, coordenadas, orden y sincronización conservan la versión estable', () => {
  const expected = {
    sincronizarRuta: '59f94cdfdf16c48a4d37430388abd0b25483ece5858c9ca12d663b37ba87a0fc',
    ordenListaRuta: '0a986fe23c9a487f50f1d05eaf03c789878a2e4fab015dddb32697bf2622889c',
    solicitudORS: '40bf0f1f7f73a16cefa7c876759e3170ab1d3656aad77ab9a8bd0c08c2436b34',
    itinerarioORS: '1a69bb418b447a5ad9cbd3c6f4bce0538e71c17ace6813ccc8e35837377b0b1b',
    generarRuta: '5b2a42a5a8048c2768b1a64461e0caaece91911404e8125461e4b23131b4d809',
  };
  for (const [name, hash] of Object.entries(expected)) assert.equal(sha256(extractFunction(route, name)), hash, `${name} cambió`);
});

test('todos los scripts incrustados mantienen sintaxis JavaScript válida', () => {
  const outerScript = source.match(/<script>\n([\s\S]*)<\/script>\n<\/body>/)?.[1];
  assert.ok(outerScript);
  assert.doesNotThrow(() => new vm.Script(outerScript, { filename: 'index.outer.js' }));
  for (const [pageName, html] of Object.entries(pages)) {
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1])
      .filter((script) => script.trim());
    scripts.forEach((script, index) => assert.doesNotThrow(
      () => new vm.Script(script, { filename: `${pageName}.${index}.js` }),
      `${pageName}.${index} debe compilar`,
    ));
  }
});
