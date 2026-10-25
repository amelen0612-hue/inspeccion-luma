const GEOAPIFY_AUTOCOMPLETE = 'https://api.geoapify.com/v1/geocode/autocomplete';
const DEFAULT_LIMIT = 8;
const MAX_QUERY_LENGTH = 120;

const PR_BOUNDS = Object.freeze({
  minLat: 17.5,
  maxLat: 18.7,
  minLon: -67.5,
  maxLon: -65.0,
});

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function normalizedQuery(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function isPuertoRicoResult(properties) {
  const lat = Number(properties?.lat);
  const lon = Number(properties?.lon);
  const countryCode = String(properties?.country_code || '').toLowerCase();
  return countryCode === 'pr'
    && Number.isFinite(lat)
    && Number.isFinite(lon)
    && lat >= PR_BOUNDS.minLat
    && lat <= PR_BOUNDS.maxLat
    && lon >= PR_BOUNDS.minLon
    && lon <= PR_BOUNDS.maxLon;
}

function mapFeature(feature) {
  const p = feature?.properties || {};
  const address = p.formatted || [p.address_line1, p.address_line2].filter(Boolean).join(', ');
  return {
    provider: 'geoapify',
    providerId: p.place_id || null,
    nombre: p.name || p.address_line1 || address || 'Lugar',
    direccion: address || '',
    lat: Number(p.lat),
    lng: Number(p.lon),
    tipo: p.result_type || 'place',
    fuente: 'Geoapify · OpenStreetMap',
  };
}

async function verifySupabaseSession(request, env, fetchImpl) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  const response = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization: auth,
      apikey: env.SUPABASE_ANON_KEY,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? { id: user.id } : null;
}

async function consumeRateLimit(env, userId) {
  if (!env.PLACES_RATE_LIMITER?.limit) return { success: true };
  return env.PLACES_RATE_LIMITER.limit({ key: `places:${userId}` });
}

export function createGeoapifySearchHandler({ fetchImpl = fetch, verifySession = verifySupabaseSession } = {}) {
  return async function handleGeoapifySearch(request, env) {
    if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'GET' });

    let user;
    try { user = await verifySession(request, env, fetchImpl); }
    catch { return json({ error: 'AUTH_TEMPORARILY_UNAVAILABLE' }, 503); }
    if (!user) return json({ error: 'UNAUTHORIZED' }, 401);

    if (!env.GEOAPIFY_API_KEY) {
      return json({ error: 'SEARCH_NOT_CONFIGURED' }, 503);
    }

    const query = normalizedQuery(new URL(request.url).searchParams.get('q'));
    if (query.length < 3 || query.length > MAX_QUERY_LENGTH) {
      return json({ error: 'INVALID_QUERY', minLength: 3, maxLength: MAX_QUERY_LENGTH }, 400);
    }

    if (!env.PLACES_RATE_LIMITER?.limit) return json({ error: 'RATE_LIMIT_NOT_CONFIGURED' }, 503);
    let rate;
    try { rate = await consumeRateLimit(env, user.id); }
    catch { return json({ error: 'SEARCH_TEMPORARILY_UNAVAILABLE' }, 503); }
    if (!rate.success) return json({ error: 'RATE_LIMITED' }, 429, { 'retry-after': '60' });

    const upstream = new URL(GEOAPIFY_AUTOCOMPLETE);
    upstream.searchParams.set('text', query);
    upstream.searchParams.set('filter', 'countrycode:pr');
    upstream.searchParams.set('bias', 'proximity:-66.1057,18.2208');
    upstream.searchParams.set('lang', 'es');
    upstream.searchParams.set('limit', String(DEFAULT_LIMIT));
    upstream.searchParams.set('format', 'geojson');
    upstream.searchParams.set('apiKey', env.GEOAPIFY_API_KEY);

    let response;
    try {
      response = await fetchImpl(upstream, {
        headers: { accept: 'application/geo+json, application/json' },
        cf: { cacheTtl: 300, cacheEverything: true },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return json({ error: 'SEARCH_TEMPORARILY_UNAVAILABLE' }, 503);
    }

    if (!response.ok) {
      const status = response.status === 429 ? 429 : 502;
      return json({ error: status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_ERROR' }, status);
    }

    let payload;
    try { payload = await response.json(); }
    catch { return json({ error: 'PROVIDER_ERROR' }, 502); }
    if (!Array.isArray(payload?.features)) return json({ error: 'PROVIDER_ERROR' }, 502);
    const results = (Array.isArray(payload?.features) ? payload.features : [])
      .filter(feature => isPuertoRicoResult(feature?.properties))
      .slice(0, DEFAULT_LIMIT)
      .map(mapFeature);

    return json({ results, attribution: 'Powered by Geoapify · OpenStreetMap contributors' });
  };
}

export const handleGeoapifySearch = createGeoapifySearchHandler();
