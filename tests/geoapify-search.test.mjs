import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeoapifySearchHandler } from '../worker/geoapify-search.mjs';

const USER = { id: 'usuario-prueba' };
const baseEnv = { GEOAPIFY_API_KEY: 'clave-simulada' };
const request = (query = 'panaderia') => new Request(`https://prueba.invalid/api/places/search?q=${encodeURIComponent(query)}`);

function geoResponse(features, status = 200) {
  return new Response(JSON.stringify({ features }), { status, headers: { 'content-type': 'application/json' } });
}

function feature(overrides = {}) {
  return {
    properties: {
      place_id: 'pr-1',
      name: 'Panadería de prueba',
      formatted: 'Calle Prueba, San Juan, Puerto Rico',
      lat: 18.4,
      lon: -66.07,
      country_code: 'pr',
      result_type: 'amenity',
      ...overrides,
    },
  };
}

test('no llama a Geoapify cuando falta la clave protegida', async () => {
  let calls = 0;
  const handler = createGeoapifySearchHandler({
    verifySession: async () => USER,
    fetchImpl: async () => { calls += 1; return geoResponse([]); },
  });
  const response = await handler(request(), {});
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test('exige sesión autenticada antes de consultar al proveedor', async () => {
  let calls = 0;
  const handler = createGeoapifySearchHandler({
    verifySession: async () => null,
    fetchImpl: async () => { calls += 1; return geoResponse([]); },
  });
  const response = await handler(request(), baseEnv);
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test('rechaza búsquedas demasiado cortas sin consumir créditos', async () => {
  let calls = 0;
  const handler = createGeoapifySearchHandler({
    verifySession: async () => USER,
    fetchImpl: async () => { calls += 1; return geoResponse([]); },
  });
  const response = await handler(request('ab'), baseEnv);
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test('fuerza Puerto Rico, español y máximo de ocho resultados', async () => {
  let outbound;
  const handler = createGeoapifySearchHandler({
    verifySession: async () => USER,
    fetchImpl: async url => {
      outbound = new URL(url);
      return geoResponse(Array.from({ length: 12 }, (_, i) => feature({ place_id: `pr-${i}` })));
    },
  });
  const response = await handler(request('farmacia'), baseEnv);
  const body = await response.json();
  assert.equal(outbound.searchParams.get('filter'), 'countrycode:pr');
  assert.equal(outbound.searchParams.get('lang'), 'es');
  assert.equal(outbound.searchParams.get('limit'), '8');
  assert.equal(body.results.length, 8);
});

test('descarta resultados fuera de Puerto Rico aunque el proveedor los devuelva', async () => {
  const handler = createGeoapifySearchHandler({
    verifySession: async () => USER,
    fetchImpl: async () => geoResponse([
      feature(),
      feature({ place_id: 'us-1', country_code: 'us', lat: 25.76, lon: -80.19 }),
      feature({ place_id: 'bad-coordinates', lat: 91 }),
    ]),
  });
  const body = await (await handler(request('panaderia'), baseEnv)).json();
  assert.deepEqual(body.results.map(item => item.providerId), ['pr-1']);
});

test('el límite del Worker bloquea la consulta antes de consumir crédito', async () => {
  let calls = 0;
  const handler = createGeoapifySearchHandler({
    verifySession: async () => USER,
    fetchImpl: async () => { calls += 1; return geoResponse([]); },
  });
  const response = await handler(request(), {
    ...baseEnv,
    PLACES_RATE_LIMITER: { limit: async () => ({ success: false }) },
  });
  assert.equal(response.status, 429);
  assert.equal(calls, 0);
});

test('normaliza la respuesta sin exponer la clave de Geoapify', async () => {
  const handler = createGeoapifySearchHandler({
    verifySession: async () => USER,
    fetchImpl: async () => geoResponse([feature()]),
  });
  const response = await handler(request(), baseEnv);
  const raw = await response.text();
  assert.doesNotMatch(raw, /clave-simulada/);
  const body = JSON.parse(raw);
  assert.equal(body.results[0].fuente, 'Geoapify · OpenStreetMap');
  assert.equal(body.results[0].lat, 18.4);
  assert.equal(body.results[0].lng, -66.07);
});

test('un fallo del proveedor no se presenta como resultado válido', async () => {
  const handler = createGeoapifySearchHandler({
    verifySession: async () => USER,
    fetchImpl: async () => { throw new Error('red simulada'); },
  });
  const response = await handler(request(), baseEnv);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'SEARCH_TEMPORARILY_UNAVAILABLE' });
});
