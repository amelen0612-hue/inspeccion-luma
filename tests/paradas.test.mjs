// Ruta del Día — paradas: volver a la parada actual, ir a cualquier parada, marcar visitada (con historial y deshacer), omitir/retomar
// y optimizar solo las pendientes. El orden de ORS, «Iniciar ruta» y «Siguiente parada» se conservan y nada se borra.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const a = source.indexOf('const PAGES=') + 'const PAGES='.length;
const route = JSON.parse(source.slice(a, source.indexOf(';\nlet current=', a))).ruta;

function extractFunction(text, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(text);
  assert.ok(match, `No se encontró ${name}`);
  const open = text.indexOf('{', match.index); let depth = 0; let quote = null; let escaped = false;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c; else if (c === '{') depth += 1; else if (c === '}' && --depth === 0) return text.slice(match.index, i + 1);
  }
  throw new Error(name);
}

const OFICINA = { id: '__ors_salida', name: 'Oficina', lat: 18.444, lng: -66.086 };
const PARADAS = [1, 2, 3, 4, 5, 6].map((n) => ({ id: String(910000 + n), name: `PRUEBA-00${n}`, lat: 18.4 + n / 100, lng: -66.1 + n / 50 }));
const ids = (...n) => n.map((x) => String(910000 + x));

function entorno({ app = 'google', gps = { lat: 18.5, lng: -66.2 }, fallaNavegacion = false } = {}) {
  const datos = new Map(); let reloj = 1_000_000; const navegaciones = []; const avisos = []; const llamadasORS = [];
  datos.set('ruta_nav_app', app);
  datos.set('ruta_puntos', JSON.stringify(PARADAS.map((p) => ({ id: Number(p.id), contador: p.name, coord: `${p.lat},${p.lng}`, fotos: [], visitado: false }))));
  datos.set('ruta_ors_ultima', JSON.stringify({ firma: '{}', puntos: [OFICINA, ...PARADAS, OFICINA], url: '', tramo: 0, pendientes: PARADAS.map((p) => p.id) }));
  const controles = { 'ruta-circular': { checked: true }, 'ruta-salida': { value: 'oficina' }, 'ruta-llegada': { value: 'oficina' }, 'ruta-llegada-otro': { value: '' }, 'ruta-oficina': { value: `${OFICINA.lat},${OFICINA.lng}` } };
  const contexto = {
    encodeURIComponent, Number, Math, Error, JSON, console, Set, Array, String, Promise, Date: class extends Date { static now() { return reloj; } },
    navigator: { userAgent: '', geolocation: gps ? { getCurrentPosition: (ok) => ok({ coords: { latitude: gps.lat, longitude: gps.lng } }) } : { getCurrentPosition: (_ok, no) => no(new Error('denegado')) } },
    localStorage: { getItem: (k) => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => datos.set(k, String(v)), removeItem: (k) => datos.delete(k) },
    document: { getElementById: (id) => controles[id] ?? null, addEventListener() {} },
    toast: (t) => avisos.push(String(t)), renderLista() {}, actualizarNavegacionORS() {}, marcarPuntoDirty: (p) => { p._dirty = true; }, programarSyncRuta() {},
    confirmarAccion: (_t, cb) => cb(),
    window: { parent: { abrirNavegacionMismaPestana: (u) => { if (fallaNavegacion) throw new Error('navegación bloqueada'); navegaciones.push(u); } } },
  };
  contexto.obtenerSesionRuta = async () => ({}); contexto.optimizandoORS = false;
  vm.createContext(contexto);
  const nombres = ['getPuntos', 'savePuntos', 'coordenadasRuta', 'extremoRuta', 'navAppActual', 'coordenadaNavegacion', 'urlAppleMaps', 'urlNavegacionTramo', 'itinerarioORS', 'abrirTramoORS',
    'puntoPorId', 'esExtremoRuta', 'estaOmitida', 'rutaGuardada', 'indiceSiguiente', 'toqueNavegacionPermitido', 'iniciarRutaORS', 'siguienteParadaORS', 'destinoActual', 'navegarDesdeUbicacionActual',
    'volverAParadaActual', 'irAParada', 'marcarVisitada', 'deshacerVisitada', 'omitirParada', 'retomarParada', 'obtenerUbicacionActualRuta', 'optimizarPendientes', 'ejecutarOptimizarPendientes', 'solicitudORS', 'estaAgregada', 'insertarParadaEnRuta', 'paradaExistentePorCoord', 'anadirParada'];
  vm.runInContext(`const NAV_APPS=['google','waze','apple'];let ultimoToqueNavegacion=0;let ubicacionRuta=null;
    async function abrirORS(){globalThis.llamadasORS.push({body:solicitudORS(),circular:document.getElementById('ruta-circular').checked,salida:document.getElementById('ruta-salida').value,llegada:document.getElementById('ruta-llegada').value,llegadaOtro:document.getElementById('ruta-llegada-otro').value,ubicacion:ubicacionRuta});localStorage.setItem('ruta_ors_ultima',JSON.stringify({firma:'{}',puntos:[{id:'__ors_salida',name:'Mi ubicación',lat:ubicacionRuta.lat,lng:ubicacionRuta.lng},{id:'910003',name:'PRUEBA-003',lat:18.43,lng:-66.04},{id:'__ors_llegada',name:'Otro punto (llegada)',lat:18.444,lng:-66.086}],url:'',tramo:0,pendientes:['910003']}));}
    function actualizarOpcionesRutaCircular(){}
    function cerrarAnadirParada(){globalThis.cerrado=(globalThis.cerrado||0)+1;}\n${nombres.map((n) => extractFunction(route, n)).join('\n')}
    globalThis.api={${nombres.join(',')},getUbicacion:()=>ubicacionRuta};`, contexto);
  contexto.llamadasORS = llamadasORS;
  const api = contexto.api;
  const ruta = () => JSON.parse(datos.get('ruta_ors_ultima')); const puntos = () => JSON.parse(datos.get('ruta_puntos'));
  const tocar = (fn, ...args) => { reloj += 2000; return fn(...args); }; // cada acción es un toque distinto (supera el antirrebote)
  return { api, datos, navegaciones, avisos, ruta, puntos, tocar, controles, llamadasORS, avanzar: (ms) => { reloj += ms; } };
}
const destinoGoogle = (url) => new URL(url).searchParams.get('destination');
const coord = (p) => `${p.lat},${p.lng}`;

test('«Volver a esta parada» reabre el navegador desde la ubicación actual sin avanzar «Siguiente parada» ni tocar el orden', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS);
  assert.equal(e.ruta().tramo, 1);
  const antes = JSON.stringify(e.ruta().puntos);
  e.tocar(e.api.volverAParadaActual); e.tocar(e.api.volverAParadaActual);
  assert.equal(e.navegaciones.length, 3);
  for (const url of e.navegaciones.slice(1)) { assert.equal(destinoGoogle(url), coord(PARADAS[0])); assert.equal(new URL(url).searchParams.get('origin'), null, 'sin origen: parte de donde estás'); }
  assert.equal(e.ruta().tramo, 1, 'el tramo no avanza'); assert.equal(JSON.stringify(e.ruta().puntos), antes);
  e.tocar(e.api.siguienteParadaORS); assert.equal(e.ruta().tramo, 2, 'Siguiente parada sigue con la parada 2');
});

test('«Volver» sin ruta iniciada avisa y no abre ningún navegador', () => {
  const e = entorno(); e.tocar(e.api.volverAParadaActual);
  assert.equal(e.navegaciones.length, 0); assert.match(e.avisos.at(-1), /no has iniciado/i);
});

test('ir a cualquier parada pendiente navega desde la ubicación actual, conserva el orden y deja las demás pendientes', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS);
  e.tocar(e.api.irAParada, PARADAS[3].id);
  assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(PARADAS[3])); assert.equal(new URL(e.navegaciones.at(-1)).searchParams.get('origin'), null);
  assert.equal(e.ruta().tramo, 1, 'el tramo original no cambia'); assert.equal(e.ruta().destinoManual, PARADAS[3].id);
  assert.deepEqual(e.ruta().puntos.map((p) => p.id), [OFICINA.id, ...PARADAS.map((p) => p.id), OFICINA.id], 'el orden original no cambia');
  assert.ok(e.puntos().every((p) => p.visitado === false), 'ninguna se marcó completada');
  e.tocar(e.api.volverAParadaActual); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(PARADAS[3]), 'volver apunta a la elegida a mano');
  e.tocar(e.api.siguienteParadaORS); assert.equal(e.ruta().tramo, 2, 'Siguiente parada continúa la secuencia original'); assert.equal(e.ruta().destinoManual, undefined, 'el destino manual se reemplaza');
});

test('con Waze y Apple Maps las paradas elegidas usan solo el destino (sin origen)', () => {
  const w = entorno({ app: 'waze' }); w.tocar(w.api.iniciarRutaORS); w.tocar(w.api.irAParada, PARADAS[4].id);
  assert.equal(w.navegaciones.at(-1), `https://waze.com/ul?ll=${coord(PARADAS[4])}&navigate=yes`);
  const m = entorno({ app: 'apple' }); m.tocar(m.api.iniciarRutaORS); m.tocar(m.api.irAParada, PARADAS[4].id);
  assert.equal(m.navegaciones.at(-1), `https://maps.apple.com/directions?destination=${coord(PARADAS[4])}&mode=driving`);
});

test('marcar visitada excluye la parada de las siguientes, la conserva en el historial y se puede deshacer sin perder datos', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS);
  e.api.marcarVisitada(PARADAS[1].id);
  const marcada = e.puntos().find((p) => String(p.id) === PARADAS[1].id);
  assert.equal(marcada.visitado, true); assert.ok(marcada.visitadoEn); assert.equal(e.puntos().length, 6, 'no se borra nada');
  e.tocar(e.api.siguienteParadaORS); assert.equal(e.ruta().tramo, 3, 'salta la visitada'); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(PARADAS[2]));
  assert.equal(new URL(e.navegaciones.at(-1)).searchParams.get('origin'), null, 'al saltar una parada parte de la ubicación actual, no de la parada saltada');
  e.tocar(e.api.siguienteParadaORS); assert.equal(e.ruta().tramo, 4); assert.match(e.navegaciones.at(-1), /origin=/, 'el avance normal conserva el origen de ORS');
  e.api.deshacerVisitada(PARADAS[1].id);
  assert.equal(e.puntos().find((p) => String(p.id) === PARADAS[1].id).visitado, false); assert.equal(e.puntos().find((p) => String(p.id) === PARADAS[1].id).visitadoEn, undefined);
  e.tocar(e.api.irAParada, PARADAS[1].id); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(PARADAS[1]), 'tras deshacer se puede volver a ella');
  e.api.marcarVisitada(PARADAS[0].id); const estadoAntes = [e.datos.get('ruta_ors_ultima'), e.datos.get('ruta_puntos')]; e.tocar(e.api.irAParada, PARADAS[0].id);
  assert.equal(e.navegaciones.length, 5, 'una visitada también es accesible'); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(PARADAS[0]));
  assert.deepEqual([e.datos.get('ruta_ors_ultima'), e.datos.get('ruta_puntos')], estadoAntes, 'volver a una visitada no cambia ningún dato');
});

test('marcar visitada la parada elegida a mano limpia el destino manual; marcar o deshacer dos veces no duplica nada', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS); e.tocar(e.api.irAParada, PARADAS[2].id);
  e.api.marcarVisitada(PARADAS[2].id); assert.equal(e.ruta().destinoManual, undefined);
  const t = e.puntos().find((p) => String(p.id) === PARADAS[2].id).visitadoEn;
  e.api.marcarVisitada(PARADAS[2].id); assert.equal(e.puntos().find((p) => String(p.id) === PARADAS[2].id).visitadoEn, t, 'segundo toque sin efecto');
  e.api.deshacerVisitada(PARADAS[2].id); e.api.deshacerVisitada(PARADAS[2].id); assert.equal(e.puntos().filter((p) => p.visitado).length, 0);
  e.api.marcarVisitada('999'); assert.match(e.avisos.at(-1), /ya no existe/);
});

test('omitir por ahora no marca visitada ni borra: «Siguiente parada» la salta y se puede retomar', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS);
  e.api.omitirParada(PARADAS[1].id);
  assert.deepEqual(e.ruta().omitidas, [PARADAS[1].id]); assert.equal(e.puntos().find((p) => String(p.id) === PARADAS[1].id).visitado, false); assert.equal(e.puntos().length, 6);
  e.tocar(e.api.siguienteParadaORS); assert.equal(e.ruta().tramo, 3);
  e.api.omitirParada(PARADAS[1].id); assert.deepEqual(e.ruta().omitidas, [PARADAS[1].id], 'no se duplica');
  e.tocar(e.api.irAParada, PARADAS[1].id); assert.deepEqual(e.ruta().omitidas ?? [], [], 'ir a una omitida la retoma');
  e.api.omitirParada(PARADAS[4].id); e.api.retomarParada(PARADAS[4].id); assert.deepEqual(e.ruta().omitidas, []);
  e.api.retomarParada(PARADAS[4].id); assert.match(e.avisos.at(-1), /no estaba omitida/);
});

test('omitir sin ruta optimizada avisa sin cambiar nada', () => {
  const e = entorno(); e.datos.delete('ruta_ors_ultima'); e.api.omitirParada(PARADAS[0].id);
  assert.match(e.avisos.at(-1), /optimiza la ruta/i); assert.equal(e.datos.has('ruta_ors_ultima'), false);
});

test('«Iniciar ruta» y «Siguiente parada» saltan visitadas y omitidas, y la última parada nunca se salta', () => {
  const e = entorno(); e.api.marcarVisitada(PARADAS[0].id); e.api.omitirParada(PARADAS[1].id);
  e.tocar(e.api.iniciarRutaORS); assert.equal(e.ruta().tramo, 3); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(PARADAS[2]));
  for (const n of [3, 4, 5, 6]) if (n > 3) e.api.marcarVisitada(PARADAS[n - 1].id);
  e.tocar(e.api.siguienteParadaORS); assert.equal(e.ruta().tramo, 7, 'solo queda el regreso a la oficina'); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(OFICINA));
  e.tocar(e.api.siguienteParadaORS); assert.match(e.avisos.at(-1), /última parada/);
});

test('el antirrebote evita saltos y aperturas dobles por toques repetidos', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS);
  e.tocar(e.api.siguienteParadaORS); e.api.siguienteParadaORS(); e.avanzar(300); e.api.siguienteParadaORS();
  assert.equal(e.ruta().tramo, 2); assert.equal(e.navegaciones.length, 2);
  e.avanzar(2000); e.api.volverAParadaActual(); e.api.volverAParadaActual(); assert.equal(e.navegaciones.length, 3);
});

test('si el navegador no abre, el progreso y el destino manual anteriores se restauran', () => {
  const e = entorno({ fallaNavegacion: true });
  e.tocar(e.api.iniciarRutaORS); assert.equal(e.ruta().tramo, 0);
  const ok = entorno(); ok.tocar(ok.api.iniciarRutaORS); ok.tocar(ok.api.irAParada, PARADAS[2].id);
  const antes = ok.datos.get('ruta_ors_ultima'); ok.contexto = null;
  const f = entorno({ fallaNavegacion: true }); f.datos.set('ruta_ors_ultima', antes); f.tocar(f.api.irAParada, PARADAS[4].id);
  assert.equal(f.datos.get('ruta_ors_ultima'), antes, 'queda como estaba'); assert.match(f.avisos.at(-1), /bloqueada/);
});

test('el progreso queda guardado: un entorno nuevo con el mismo almacenamiento continúa donde estaba', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS); e.tocar(e.api.siguienteParadaORS); e.api.marcarVisitada(PARADAS[2].id); e.api.omitirParada(PARADAS[3].id); e.tocar(e.api.irAParada, PARADAS[5].id);
  const r = entorno(); for (const [k, v] of e.datos) r.datos.set(k, v);
  assert.equal(r.ruta().tramo, 2); assert.equal(r.ruta().destinoManual, PARADAS[5].id); assert.deepEqual(r.ruta().omitidas, [PARADAS[3].id]);
  r.tocar(r.api.siguienteParadaORS); assert.equal(r.ruta().tramo, 5, 'salta 3 (visitada) y 4 (omitida)'); assert.equal(destinoGoogle(r.navegaciones.at(-1)), coord(PARADAS[4]));
});

test('secuencias aleatorias de acciones en cualquier orden: sin duplicados, sin saltos a visitadas, sin borrados y con el orden de ORS intacto', () => {
  let semilla = 12345; const azar = (n) => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla % n; };
  for (let corrida = 0; corrida < 150; corrida++) {
    const e = entorno({ app: ['google', 'waze', 'apple'][corrida % 3] }); const ordenOriginal = JSON.stringify(e.ruta().puntos); e.tocar(e.api.iniciarRutaORS);
    for (let paso = 0; paso < 25; paso++) {
      const id = PARADAS[azar(6)].id; const antes = e.navegaciones.length; const visitadasAntes = new Set(e.puntos().filter((p) => p.visitado).map((p) => String(p.id)));
      const accion = azar(8);
      if (accion === 0) e.tocar(e.api.siguienteParadaORS); else if (accion === 1) e.tocar(e.api.volverAParadaActual); else if (accion === 2) e.tocar(e.api.irAParada, id);
      else if (accion === 3) e.api.marcarVisitada(id); else if (accion === 4) e.api.deshacerVisitada(id); else if (accion === 5) e.api.omitirParada(id); else if (accion === 6) e.api.retomarParada(id); else e.tocar(e.api.irAParada, id);
      assert.equal(e.puntos().length, 6, 'nunca se borra una parada'); assert.equal(JSON.stringify(e.ruta().puntos), ordenOriginal, 'el orden de ORS no cambia');
      assert.ok(e.navegaciones.length - antes <= 1, 'a lo sumo una navegación por acción');
      if (accion === 0 && e.navegaciones.length > antes && e.ruta().tramo < 7) assert.ok(!visitadasAntes.has(String(e.ruta().puntos[e.ruta().tramo].id)), 'Siguiente parada nunca va a una visitada');
      if ((accion === 2 || accion === 7) && visitadasAntes.has(id)) { assert.equal(e.navegaciones.length, antes + 1, 'una visitada siempre se puede revisitar'); assert.equal(e.puntos().find((p) => String(p.id) === id).visitado, true, 'y sigue visitada'); }
      const t = e.ruta().tramo; assert.ok(Number.isInteger(t) && t >= 0 && t <= 7);
      assert.equal(new Set(e.ruta().omitidas ?? []).size, (e.ruta().omitidas ?? []).length, 'sin omitidas duplicadas');
    }
  }
});

test('Optimizar pendientes: solo a petición, desde el GPS, con el final vigente, y restaura los controles del usuario', async () => {
  const e = entorno(); e.controles['ruta-oficina'] = { value: `${OFICINA.lat},${OFICINA.lng}` };
  await e.api.ejecutarOptimizarPendientes();
  assert.equal(e.llamadasORS.length, 1); const c = e.llamadasORS[0];
  assert.deepEqual([c.circular, c.salida, c.llegada], [false, 'ubicacion', 'otro']); assert.equal(c.llegadaOtro, `${OFICINA.lat},${OFICINA.lng}`, 'conserva el final (oficina en una ruta circular)');
  assert.equal(JSON.stringify(c.ubicacion), JSON.stringify({ lat: 18.5, lng: -66.2 }));
  assert.deepEqual([e.controles['ruta-circular'].checked, e.controles['ruta-salida'].value, e.controles['ruta-llegada'].value, e.controles['ruta-llegada-otro'].value], [true, 'oficina', 'oficina', ''], 'controles restaurados');
  assert.equal(e.api.getUbicacion(), null, 'ubicación previa restaurada');
  const ultimo = e.ruta().puntos.at(-1); assert.equal(ultimo.name, 'Oficina', 'el final conserva su nombre'); assert.equal(ultimo.id, '__ors_llegada'); assert.equal(ultimo.lat, OFICINA.lat);
  // Elegir, volver, marcar u omitir NUNCA optimizan.
  const f = entorno(); f.tocar(f.api.iniciarRutaORS); f.tocar(f.api.irAParada, PARADAS[3].id); f.tocar(f.api.volverAParadaActual); f.api.marcarVisitada(PARADAS[0].id); f.api.omitirParada(PARADAS[1].id); f.tocar(f.api.siguienteParadaORS);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.llamadasORS.length, 0, 'ninguna otra acción llama al optimizador');
});

test('Optimizar pendientes: sin GPS no cambia nada y no llama al optimizador; sin pendientes avisa', async () => {
  const e = entorno({ gps: null }); const antes = e.datos.get('ruta_ors_ultima'); await e.api.ejecutarOptimizarPendientes();
  assert.equal(e.llamadasORS.length, 0); assert.equal(e.datos.get('ruta_ors_ultima'), antes); assert.match(e.avisos.at(-1), /ubicación/i);
  const f = entorno(); PARADAS.forEach((p) => f.api.marcarVisitada(p.id)); f.api.optimizarPendientes(); assert.match(f.avisos.at(-1), /no hay paradas pendientes/i); assert.equal(f.llamadasORS.length, 0);
});

test('volver a una visitada: cualquier proveedor, desde la ubicación actual, sin cambiar estado, progreso, orden ni optimizar', async () => {
  for (const app of ['google', 'waze', 'apple']) {
    const e = entorno({ app }); e.tocar(e.api.iniciarRutaORS); e.tocar(e.api.siguienteParadaORS); e.api.marcarVisitada(PARADAS[0].id); e.api.omitirParada(PARADAS[4].id);
    const antes = [e.datos.get('ruta_ors_ultima'), e.datos.get('ruta_puntos')];
    e.tocar(e.api.irAParada, PARADAS[0].id);
    const esperado = { google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coord(PARADAS[0]))}&travelmode=driving&dir_action=navigate`, waze: `https://waze.com/ul?ll=${coord(PARADAS[0])}&navigate=yes`, apple: `https://maps.apple.com/directions?destination=${coord(PARADAS[0])}&mode=driving` }[app];
    assert.equal(e.navegaciones.at(-1), esperado, app); assert.deepEqual([e.datos.get('ruta_ors_ultima'), e.datos.get('ruta_puntos')], antes, app + ': nada cambia');
    e.tocar(e.api.siguienteParadaORS); assert.equal(e.ruta().tramo, 3, app + ': Siguiente parada continúa donde iba (salta 2 visitadas/omitidas ya contadas)');
    await new Promise((r) => setTimeout(r, 10)); assert.equal(e.llamadasORS.length, 0, 'sin optimizar');
  }
});

test('con las seis paradas completadas se puede volver a cualquiera, deshacer una y continuar sin reiniciar', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS); PARADAS.forEach((p) => e.api.marcarVisitada(p.id));
  assert.equal(e.puntos().filter((p) => p.visitado).length, 6);
  for (const p of PARADAS) { const n = e.navegaciones.length; e.tocar(e.api.irAParada, p.id); assert.equal(e.navegaciones.length, n + 1, p.name); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(p)); }
  assert.equal(e.puntos().filter((p) => p.visitado).length, 6, 'siguen las seis visitadas'); assert.equal(e.ruta().tramo, 1); assert.equal(e.puntos().length, 6);
  e.tocar(e.api.volverAParadaActual); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(PARADAS[0]), 'volver a la parada actual sigue funcionando');
  e.api.deshacerVisitada(PARADAS[3].id); assert.equal(e.puntos().filter((p) => !p.visitado).map((p) => p.contador).join(), 'PRUEBA-004');
  e.tocar(e.api.siguienteParadaORS); assert.equal(e.ruta().tramo, 4, 'Siguiente parada va a la única pendiente'); assert.match(e.navegaciones.at(-1), /origin=|destination=/);
});

test('Optimizar pendientes no incorpora paradas visitadas hasta que se deshace la visita', async () => {
  const e = entorno(); e.api.marcarVisitada(PARADAS[0].id); e.api.marcarVisitada(PARADAS[5].id);
  await e.api.ejecutarOptimizarPendientes();
  assert.deepEqual(e.llamadasORS[0].body.stops.map((p) => p.id).filter((x) => !x.startsWith('__')), ids(2, 3, 4, 5), 'solo las pendientes');
  e.api.deshacerVisitada(PARADAS[5].id); await e.api.ejecutarOptimizarPendientes();
  assert.deepEqual(e.llamadasORS[1].body.stops.map((p) => p.id).filter((x) => !x.startsWith('__')), ids(2, 3, 4, 5, 6), 'la deshecha vuelve a entrar');
});

test('las paradas omitidas se reincorporan como pendientes normales al reoptimizar (comportamiento documentado)', async () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS); e.api.omitirParada(PARADAS[2].id);
  await e.api.ejecutarOptimizarPendientes();
  assert.ok(e.llamadasORS[0].body.stops.some((p) => p.id === PARADAS[2].id), 'la omitida se envía al optimizador');
  assert.equal(e.puntos().find((p) => String(p.id) === PARADAS[2].id).visitado, false);
});

test('retirar inRoute y el Google Maps inferior no dejó nada roto: cada botón llama a una función existente y cada id usado existe', () => {
  const funciones = new Set([...route.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  const html = route.slice(0, route.indexOf('<script>'));
  const llamadas = [...route.matchAll(/onclick="([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]);
  assert.ok(llamadas.length > 15);
  for (const nombre of new Set(llamadas)) assert.ok(funciones.has(nombre) || ['confirmOk', 'confirmCancelar'].includes(nombre) || funciones.has(nombre), `onclick → ${nombre}() no existe`);
  const idsHtml = new Set([...route.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]));
  const usados = [...route.matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1]);
  for (const id of new Set(usados)) assert.ok(idsHtml.has(id), `getElementById('${id}') no tiene elemento`);
  assert.ok(html.length > 1000);
});

// ===== Añadir parada =====
const NUEVA = { nombre: 'PRUEBA · Panadería (ficticia)', lat: 18.41, lng: -66.1 };
const idsRuta = (e) => e.ruta().puntos.map((p) => p.id);
const sinNuevas = (e, originales) => idsRuta(e).filter((x) => originales.includes(x));

test('añadir a pendientes con la ruta iniciada: se inserta antes del final, el orden, el progreso y los estados no cambian', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS); e.tocar(e.api.siguienteParadaORS); e.api.marcarVisitada(PARADAS[0].id); e.api.omitirParada(PARADAS[3].id);
  const originales = idsRuta(e); const antes = e.ruta();
  e.api.anadirParada(NUEVA, 'pendientes');
  const r = e.ruta(); const nuevo = e.puntos().find((p) => p.contador === NUEVA.nombre);
  assert.ok(nuevo && nuevo.visitado === false && nuevo.coord === '18.41,-66.1' && Array.isArray(nuevo.fotos) && nuevo._dirty === true, 'punto nuevo pendiente, listo para sincronizar');
  assert.equal(e.puntos().length, 7); assert.equal(r.tramo, antes.tramo, 'progreso intacto'); assert.deepEqual(r.omitidas, antes.omitidas);
  assert.equal(r.puntos.at(-1).id, OFICINA.id); assert.equal(String(r.puntos.at(-2).id), String(nuevo.id), 'justo antes del regreso final');
  assert.deepEqual(sinNuevas(e, originales), originales, 'orden de ORS intacto'); assert.ok(r.pendientes.includes(String(nuevo.id)) && r.agregadas.includes(String(nuevo.id)));
  assert.equal(e.puntos().filter((p) => p.visitado).length, 1); assert.equal(e.navegaciones.length, 2, 'añadir no abre ningún navegador');
  assert.doesNotThrow(() => e.api.itinerarioORS(), 'Iniciar ruta / Siguiente parada siguen habilitados (no exige reoptimizar)');
});

test('la parada añadida se alcanza con Siguiente parada desde la ubicación actual, antes del regreso final, y se puede visitar', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS); e.api.anadirParada(NUEVA, 'pendientes');
  for (const p of PARADAS.slice(1)) e.api.marcarVisitada(p.id);
  e.tocar(e.api.siguienteParadaORS); const u = e.navegaciones.at(-1);
  assert.equal(destinoGoogle(u), '18.41,-66.1'); assert.equal(new URL(u).searchParams.get('origin'), null, 'sale de donde estás, no de la parada anterior');
  e.api.marcarVisitada(String(e.puntos().find((p) => p.contador === NUEVA.nombre).id));
  e.tocar(e.api.siguienteParadaORS); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(OFICINA), 'después, el regreso final');
});

test('«Ir ahora»: navega desde la ubicación actual, la parada queda pendiente y el progreso no cambia', () => {
  for (const app of ['google', 'waze', 'apple']) {
    const e = entorno({ app }); e.tocar(e.api.iniciarRutaORS); const tramo = e.ruta().tramo;
    e.tocar(e.api.anadirParada, NUEVA, 'ahora');
    const u = e.navegaciones.at(-1); const nuevo = e.puntos().find((p) => p.contador === NUEVA.nombre);
    assert.equal(u, { google: 'https://www.google.com/maps/dir/?api=1&destination=18.41%2C-66.1&travelmode=driving&dir_action=navigate', waze: 'https://waze.com/ul?ll=18.41,-66.1&navigate=yes', apple: 'https://maps.apple.com/directions?destination=18.41,-66.1&mode=driving' }[app], app);
    assert.equal(nuevo.visitado, false, 'no se marca visitada por navegar'); assert.equal(e.ruta().tramo, tramo); assert.equal(e.ruta().destinoManual, String(nuevo.id));
    e.tocar(e.api.volverAParadaActual); assert.equal(e.navegaciones.at(-1), u, 'Volver a la parada actual apunta a la añadida');
  }
});

test('pocas pendientes: con una sola pendiente, o con todas completadas y rumbo al final, la añadida entra sin perder nada', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS); PARADAS.slice(0, 5).forEach((p) => e.api.marcarVisitada(p.id));
  e.api.anadirParada(NUEVA, 'pendientes'); assert.equal(e.puntos().filter((p) => !p.visitado).length, 2);
  e.tocar(e.api.siguienteParadaORS); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(PARADAS[5]));
  // todas completadas y ya en el último tramo (regreso)
  const f = entorno(); f.tocar(f.api.iniciarRutaORS); PARADAS.forEach((p) => f.api.marcarVisitada(p.id));
  f.tocar(f.api.siguienteParadaORS); assert.equal(f.ruta().tramo, 7, 'rumbo al regreso'); const visitadas = f.puntos().filter((p) => p.visitado).length;
  f.api.anadirParada(NUEVA, 'pendientes'); assert.equal(f.ruta().tramo, 7, 'el destino actual (regreso) conserva su posición'); assert.equal(f.ruta().puntos.length, 10, 'añadida + regreso final repetido'); assert.equal(f.ruta().puntos[7].id, OFICINA.id);
  f.tocar(f.api.siguienteParadaORS); assert.equal(destinoGoogle(f.navegaciones.at(-1)), '18.41,-66.1'); assert.equal(f.puntos().filter((p) => p.visitado).length, visitadas, 'visitadas intactas');
  f.api.marcarVisitada(String(f.puntos().find((p) => p.contador === NUEVA.nombre).id)); f.tocar(f.api.siguienteParadaORS); assert.equal(destinoGoogle(f.navegaciones.at(-1)), coord(OFICINA));
});

test('sin duplicados: coordenadas ya existentes reutilizan la parada (ahora, pendientes, visitada u omitida)', () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS); e.api.marcarVisitada(PARADAS[1].id); e.api.omitirParada(PARADAS[2].id);
  const P = (n) => ({ nombre: 'otro nombre', lat: PARADAS[n].lat, lng: PARADAS[n].lng });
  e.api.anadirParada(P(1), 'pendientes'); assert.equal(e.puntos().find((p) => String(p.id) === PARADAS[1].id).visitado, true, 'una visitada se conserva (deshacer es explícito)'); assert.match(e.avisos.at(-1), /ya está visitada/);
  e.api.anadirParada(P(2), 'pendientes'); assert.deepEqual(e.ruta().omitidas, [], 'una omitida se retoma');
  e.api.anadirParada(P(4), 'pendientes'); assert.match(e.avisos.at(-1), /ya está en pendientes/);
  e.tocar(e.api.anadirParada, P(4), 'ahora'); assert.equal(destinoGoogle(e.navegaciones.at(-1)), coord(PARADAS[3 + 1]));
  assert.equal(e.puntos().length, 6, 'no se creó ninguna parada'); assert.equal(idsRuta(e).length, 8);
  e.api.anadirParada({ nombre: 'x', lat: 1, lng: 1, idExistente: PARADAS[5].id }, 'pendientes'); assert.equal(e.puntos().length, 6);
});

test('coordenadas inválidas no crean nada; sin ruta optimizada solo se guarda el punto; los identificadores no se repiten', () => {
  const e = entorno(); const antes = [e.datos.get('ruta_puntos'), e.datos.get('ruta_ors_ultima')];
  for (const mala of [{ lat: 'x', lng: 1 }, { lat: 95, lng: 0 }, { lat: 0, lng: 181 }, { lat: null, lng: null }, { lat: '', lng: '' }]) { e.api.anadirParada({ nombre: 'mala', ...mala }, 'pendientes'); assert.match(e.avisos.at(-1), /coordenadas/i); }
  assert.deepEqual([e.datos.get('ruta_puntos'), e.datos.get('ruta_ors_ultima')], antes, 'nada cambia');
  const s = entorno(); s.datos.delete('ruta_ors_ultima'); s.api.anadirParada(NUEVA, 'pendientes'); s.api.anadirParada({ nombre: 'B', lat: 18.3, lng: -66.3 }, 'pendientes');
  assert.equal(s.puntos().length, 8); assert.equal(s.datos.has('ruta_ors_ultima'), false, 'no se inventa una ruta');
  assert.equal(new Set(s.puntos().map((p) => p.id)).size, 8, 'ids únicos aunque se añadan en el mismo milisegundo');
  const ids2 = entorno(); ids2.api.anadirParada(NUEVA, 'pendientes'); ids2.api.anadirParada({ nombre: 'C', lat: 18.2, lng: -66.2 }, 'pendientes'); assert.equal(new Set(ids2.ruta().puntos.map((p) => p.id)).size, 9);
});

test('añadir nunca optimiza; Optimizar pendientes posterior incluye la añadida y excluye visitadas', async () => {
  const e = entorno(); e.tocar(e.api.iniciarRutaORS); e.api.marcarVisitada(PARADAS[0].id); e.api.anadirParada(NUEVA, 'pendientes'); e.tocar(e.api.anadirParada, { nombre: 'B', lat: 18.3, lng: -66.3 }, 'ahora');
  await new Promise((r) => setTimeout(r, 20)); assert.equal(e.llamadasORS.length, 0, 'ninguna optimización automática');
  await e.api.ejecutarOptimizarPendientes(); const nombres = e.llamadasORS[0].body.stops.map((p) => p.name);
  assert.ok(nombres.includes(NUEVA.nombre) && nombres.includes('B')); assert.ok(!nombres.includes('PRUEBA-001'), 'visitadas fuera'); assert.equal(e.llamadasORS.length, 1);
});

test('secuencias aleatorias con paradas añadidas: sin duplicados, orden de ORS intacto, nada se pierde', () => {
  let semilla = 777; const azar = (n) => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla % n; };
  for (let corrida = 0; corrida < 120; corrida++) {
    const e = entorno({ app: ['google', 'waze', 'apple'][corrida % 3] }); const originales = idsRuta(e); e.tocar(e.api.iniciarRutaORS); let creadas = 0;
    for (let paso = 0; paso < 25; paso++) {
      const id = PARADAS[azar(6)].id; const k = azar(10); const antesN = e.navegaciones.length; const visitadasAntes = e.puntos().filter((p) => p.visitado).length;
      if (k === 0) e.tocar(e.api.siguienteParadaORS); else if (k === 1) e.tocar(e.api.irAParada, id); else if (k === 2) e.api.marcarVisitada(id); else if (k === 3) e.api.deshacerVisitada(id);
      else if (k === 4) e.api.omitirParada(id); else if (k === 5) e.api.retomarParada(id); else if (k === 6) e.tocar(e.api.volverAParadaActual);
      else { creadas++; e.tocar(e.api.anadirParada, { nombre: 'N' + creadas, lat: 18.2 + creadas / 100, lng: -66.3 + creadas / 100 }, k === 7 ? 'ahora' : 'pendientes'); }
      const r = e.ruta(); const todos = e.puntos().map((p) => String(p.id));
      assert.equal(new Set(todos).size, todos.length, 'ids de puntos únicos'); assert.equal(todos.length, 6 + creadas); assert.equal(new Set(r.puntos.filter((p) => p.id !== OFICINA.id).map((p) => String(p.id))).size, r.puntos.filter((p) => p.id !== OFICINA.id).length, 'solo la oficina se repite');
      assert.deepEqual(sinNuevas(e, originales), originales, 'orden de ORS intacto'); assert.equal(r.puntos[0].id, OFICINA.id); assert.equal(r.puntos.at(-1).id, OFICINA.id);
      assert.ok(e.navegaciones.length - antesN <= 1); if (k >= 7) assert.ok(e.puntos().filter((p) => p.visitado).length === visitadasAntes, 'añadir no cambia visitadas');
      assert.ok(r.tramo >= 0 && r.tramo < r.puntos.length); assert.doesNotThrow(() => e.api.itinerarioORS());
    }
  }
});
