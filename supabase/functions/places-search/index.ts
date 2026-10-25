// Búsqueda de lugares de Puerto Rico para «+ Añadir parada» (Geoapify). La clave vive solo como secreto de esta función
// (GEOAPIFY_API_KEY); el navegador nunca la ve. Desplegar con verify_jwt activado, igual que ors-optimize.
const ALLOWED_ORIGINS = new Set([
  "https://amelen0612-hue.github.io",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
  "http://localhost:8766",
  "http://127.0.0.1:8766",
]);
const GEOAPIFY_AUTOCOMPLETE = "https://api.geoapify.com/v1/geocode/autocomplete";
const LIMIT = 8;
const MAX_QUERY = 120;
const RATE_LIMIT = 30; // por usuario y minuto (por instancia); el tope real es la cuota diaria de Geoapify
const PR_BOUNDS = { minLat: 17.5, maxLat: 18.7, minLon: -67.5, maxLon: -65.0 };

type Env = (name: string) => string | undefined;
type Deps = { fetchImpl?: typeof fetch; getEnv?: Env; now?: () => number };

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://amelen0612-hue.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

function isPuertoRico(p: any) {
  const lat = Number(p?.lat), lon = Number(p?.lon);
  return String(p?.country_code || "").toLowerCase() === "pr" && Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= PR_BOUNDS.minLat && lat <= PR_BOUNDS.maxLat && lon >= PR_BOUNDS.minLon && lon <= PR_BOUNDS.maxLon;
}

function mapFeature(feature: any) {
  const p = feature?.properties || {};
  const direccion = p.formatted || [p.address_line1, p.address_line2].filter(Boolean).join(", ");
  return {
    provider: "geoapify",
    providerId: p.place_id || null,
    nombre: p.name || p.address_line1 || direccion || "Lugar",
    direccion: direccion || "",
    lat: Number(p.lat),
    lng: Number(p.lon),
    tipo: p.result_type || "place",
    fuente: "Geoapify · OpenStreetMap",
  };
}

export function createHandler(deps: Deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getEnv: Env = deps.getEnv ?? ((name) => (globalThis as any).Deno?.env.get(name));
  const now = deps.now ?? (() => Date.now());
  const ventanas = new Map<string, { inicio: number; usos: number }>();

  function limitar(usuario: string) {
    const t = now();
    const v = ventanas.get(usuario);
    if (!v || t - v.inicio >= 60_000) { ventanas.set(usuario, { inicio: t, usos: 1 }); return true; }
    v.usos += 1;
    return v.usos <= RATE_LIMIT;
  }

  async function usuarioValido(req: Request): Promise<string | null> {
    const auth = req.headers.get("authorization") || "";
    const url = getEnv("SUPABASE_URL"), anon = getEnv("SUPABASE_ANON_KEY");
    if (!auth.startsWith("Bearer ") || !url || !anon) return null;
    const r = await fetchImpl(`${url}/auth/v1/user`, { headers: { authorization: auth, apikey: anon }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? String(u.id) : null;
  }

  return async function handler(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

    let usuario: string | null;
    try { usuario = await usuarioValido(req); } catch { return json(req, { error: "SEARCH_TEMPORARILY_UNAVAILABLE" }, 503); }
    if (!usuario) return json(req, { error: "UNAUTHORIZED" }, 401);

    const apiKey = getEnv("GEOAPIFY_API_KEY");
    if (!apiKey) return json(req, { error: "SEARCH_NOT_CONFIGURED" }, 503);

    let body: any;
    try { body = await req.json(); } catch { return json(req, { error: "INVALID_QUERY" }, 400); }
    const q = String(body?.q ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
    if (q.length < 3 || q.length > MAX_QUERY) return json(req, { error: "INVALID_QUERY" }, 400);
    if (!limitar(usuario)) return json(req, { error: "RATE_LIMITED" }, 429, { "Retry-After": "60" });

    const up = new URL(GEOAPIFY_AUTOCOMPLETE);
    up.searchParams.set("text", q);
    up.searchParams.set("filter", "countrycode:pr");
    up.searchParams.set("bias", "proximity:-66.1057,18.2208");
    up.searchParams.set("lang", "es");
    up.searchParams.set("limit", String(LIMIT));
    up.searchParams.set("format", "geojson");
    up.searchParams.set("apiKey", apiKey);

    let resp: Response;
    try { resp = await fetchImpl(up, { headers: { accept: "application/geo+json, application/json" }, signal: AbortSignal.timeout(8000) }); }
    catch { return json(req, { error: "SEARCH_TEMPORARILY_UNAVAILABLE" }, 503); }
    if (!resp.ok) return json(req, { error: resp.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR" }, resp.status === 429 ? 429 : 502);

    let payload: any;
    try { payload = await resp.json(); } catch { return json(req, { error: "PROVIDER_ERROR" }, 502); }
    if (!Array.isArray(payload?.features)) return json(req, { error: "PROVIDER_ERROR" }, 502);
    const results = payload.features.filter((f: any) => isPuertoRico(f?.properties)).slice(0, LIMIT).map(mapFeature);
    return json(req, { results, attribution: "Powered by Geoapify · OpenStreetMap contributors" });
  };
}

if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.serve) (globalThis as any).Deno.serve(createHandler());
