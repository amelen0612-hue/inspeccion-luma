// Genera el Worker de PRUEBA con la versión integrada: index.html limpio + guard de aislamiento (6 paradas ficticias, ORS local, Supabase solo Auth)
// + endpoint /api/places/search que valida la sesión de Supabase y consulta Geoapify con el secreto del Worker.
// Uso: node preview/construir-worker-integrado.mjs  →  preview/sistema-campo-anadir-integrado.worker.mjs
import fs from 'node:fs';
const raiz = new URL('..', import.meta.url);
const html = fs.readFileSync(new URL('index.html', raiz), 'utf8');
const guard = fs.readFileSync(new URL('preview/guard-vista-temporal.js', raiz), 'utf8');
const libreria = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
const inicio = html.indexOf(libreria); const fin = inicio < 0 ? -1 : html.indexOf('</script>', inicio) + '</script>'.length;
if (inicio < 0 || fin < '</script>'.length) throw new Error('No se encontró la librería de Supabase en index.html');
const pagina = html.slice(0, fin) + `<script>\n${guard}</script>` + html.slice(fin);
const salida = `import { handleGeoapifySearch } from '../worker/geoapify-search.mjs';
// GENERADO por preview/construir-worker-integrado.mjs — no editar a mano. Vista de prueba aislada.
const PAGINA = ${JSON.stringify(pagina)};
const CABECERAS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/places/search') {
      if (env.GEOAPIFY_ENABLED !== 'true') return new Response(JSON.stringify({ error: 'SEARCH_NOT_CONFIGURED' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      return handleGeoapifySearch(request, env);
    }
    if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('No encontrado', { status: 404, headers: CABECERAS });
    const activo = '<head><script>window.CAMPO_GEOAPIFY_ACTIVO=' + JSON.stringify(env.GEOAPIFY_ENABLED === 'true') + ';</script>';
    return new Response(PAGINA.replace('<head>', activo), { headers: { ...CABECERAS, 'Content-Type': 'text/html; charset=utf-8', Pragma: 'no-cache', 'Permissions-Policy': 'camera=(), microphone=()' } });
  },
};
`;
fs.writeFileSync(new URL('preview/sistema-campo-anadir-integrado.worker.mjs', raiz), salida);
console.log('Worker generado:', salida.length, 'bytes');
