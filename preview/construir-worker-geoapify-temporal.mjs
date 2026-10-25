import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(dir, 'sistema-campo-anadir-prueba.worker.js');
const outputPath = path.join(dir, 'sistema-campo-anadir-geoapify-temporal.worker.mjs');

function replaceExactly(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`No se encontró: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`Coincidencia duplicada: ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function extractPage(worker) {
  const startToken = 'const PAGINA = ';
  const start = worker.indexOf(startToken) + startToken.length;
  const end = worker.indexOf(';\nconst CABECERAS', start);
  if (start < startToken.length || end < 0) throw new Error('No se pudo extraer PAGINA');
  return { page: JSON.parse(worker.slice(start, end)), start, end };
}

function extractPages(page) {
  const startToken = 'const PAGES=';
  const start = page.indexOf(startToken) + startToken.length;
  const end = page.indexOf(';\nlet current=', start);
  if (start < startToken.length || end < 0) throw new Error('No se pudo extraer PAGES');
  return { pages: JSON.parse(page.slice(start, end)), start, end };
}

let worker = fs.readFileSync(sourcePath, 'utf8').replace(/\r?\n--[a-f0-9]{40,}--\r?\n?$/i, '');
const extracted = extractPage(worker);
let page = extracted.page;

const mockStart = page.indexOf('  // Buscador de lugares FICTICIO');
const mockEnd = page.indexOf('  window.CAMPO_PREPARAR_RUTA_FICTICIA=', mockStart);
if (mockStart < 0 || mockEnd < 0) throw new Error('No se encontró el buscador ficticio original');
page = page.slice(0, mockStart) + `  // Adaptador compatible con Geoapify. El Worker temporal responde simulaciones hasta activar explícitamente Geoapify.\n  window.campoBuscarLugares=async(texto)=>{\n    const headers={accept:'application/json'};\n    try{\n      const sesion=await window.campoSupabase?.auth?.getSession?.();\n      const token=sesion?.data?.session?.access_token;\n      if(token)headers.authorization='Bearer '+token;\n    }catch(e){}\n    const respuesta=await fetch('/api/places/search?q='+encodeURIComponent(String(texto||'').trim()),{headers,credentials:'same-origin'});\n    const cuerpo=await respuesta.json().catch(()=>({}));\n    if(!respuesta.ok)throw new Error(cuerpo.error||'No se pudo buscar el lugar');\n    return Array.isArray(cuerpo.results)?cuerpo.results:[];\n  };\n` + page.slice(mockEnd);

const pageParts = extractPages(page);
const pages = pageParts.pages;
let route = pages.ruta;

const oldStatus = `    estado.textContent=(ruta.tramo===0?'Ruta optimizada: '+ultimo+' tramos. Lista para iniciar.':'Destino '+ruta.tramo+' de '+ultimo+': '+ruta.puntos[ruta.tramo].name+(ruta.tramo===ultimo?' — Última parada.':''))+(manual?' · Navegando a: '+(manual.contador||'parada')+' (elegida a mano)':'');`;
const newStatus = `    if(ruta.tramo===0){\n      const primero=indiceSiguiente(ruta,0);\n      estado.textContent='Ruta optimizada: '+ultimo+' tramos. Próxima parada al iniciar: '+ruta.puntos[primero].name;\n    }else{\n      let texto='Destino actual: '+ruta.puntos[ruta.tramo].name+(ruta.tramo===ultimo?' — Última parada.':'');\n      if(ruta.tramo<ultimo){const proximo=indiceSiguiente(ruta,ruta.tramo);texto+=' · Siguiente parada: '+ruta.puntos[proximo].name;}\n      if(manual)texto+=' · Navegando a: '+(manual.contador||'parada')+' (elegida a mano)';\n      estado.textContent=texto;\n    }`;
route = replaceExactly(route, oldStatus, newStatus, 'indicador de próxima parada');

const oldVisited = `      if(existente.visitado){deshacerVisitada(existente.id);return;}\n      if(estaOmitida(rutaGuardada(),existente.id)){retomarParada(existente.id);return;}`;
const newVisited = `      if(existente.visitado){toast((existente.contador||'Esa parada')+' ya está visitada; se conserva en el historial');return;}\n      if(estaOmitida(rutaGuardada(),existente.id)){retomarParada(existente.id);return;}`;
route = replaceExactly(route, oldVisited, newVisited, 'preservación de parada visitada');

pages.ruta = route;
page = page.slice(0, pageParts.start) + JSON.stringify(pages) + page.slice(pageParts.end);
worker = worker.slice(0, extracted.start) + JSON.stringify(page) + worker.slice(extracted.end);

const provider = `
const LUGARES_SIMULADOS = [
  {nombre:'PRUEBA · Panadería La Esquina (ficticia)',direccion:'Calle Ficticia 1, San Juan, PR',lat:18.4641,lng:-66.1052},
  {nombre:'PRUEBA · Café del Puerto (ficticio)',direccion:'Avenida Prueba 22, San Juan, PR',lat:18.4688,lng:-66.1177},
  {nombre:'PRUEBA · Farmacia Central (ficticia)',direccion:'Calle Demo 305, Santurce, PR',lat:18.4512,lng:-66.0733},
  {nombre:'PRUEBA · Ferretería Los Pinos (ficticia)',direccion:'Carretera 1, Río Piedras, PR',lat:18.4026,lng:-66.0505},
  {nombre:'PRUEBA · Gasolinera Isla (ficticia)',direccion:'Carretera 2, Bayamón, PR',lat:18.3989,lng:-66.1561},
  {nombre:'PRUEBA · Plaza del Mercado (ficticia)',direccion:'Calle Mercado 8, Caguas, PR',lat:18.3811,lng:-66.0485},
  {nombre:'PRUEBA · Clínica Vista Mar (ficticia)',direccion:'Avenida Costa 90, Carolina, PR',lat:18.4362,lng:-65.9981},
  {nombre:'PRUEBA · Restaurante El Yunque (ficticio)',direccion:'Carretera 191, Río Grande, PR',lat:18.3796,lng:-65.8312}
];
const normalizarBusqueda=(texto)=>String(texto||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
function respuestaJson(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
async function buscarLugaresTemporal(request,env){
  const q=String(new URL(request.url).searchParams.get('q')||'').normalize('NFKC').replace(/\\s+/g,' ').trim();
  if(q.length<3||q.length>120)return respuestaJson({error:'INVALID_QUERY'},400);
  // Activación real bloqueada por defecto. Requiere flag y secret explícitos, además de sesión Supabase válida.
  if(env.GEOAPIFY_ENABLED==='true'&&env.GEOAPIFY_API_KEY){
    const auth=request.headers.get('authorization')||'';
    if(!auth.startsWith('Bearer ')||!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY)return respuestaJson({error:'UNAUTHORIZED'},401);
    const usuario=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers:{authorization:auth,apikey:env.SUPABASE_ANON_KEY}});
    if(!usuario.ok)return respuestaJson({error:'UNAUTHORIZED'},401);
    const limite=env.PLACES_RATE_LIMITER?.limit?await env.PLACES_RATE_LIMITER.limit({key:'places:'+(await usuario.json()).id}):{success:true};
    if(!limite.success)return respuestaJson({error:'RATE_LIMITED'},429);
    const url=new URL('https://api.geoapify.com/v1/geocode/autocomplete');
    Object.entries({text:q,filter:'countrycode:pr',bias:'proximity:-66.1057,18.2208',lang:'es',limit:'8',format:'geojson',apiKey:env.GEOAPIFY_API_KEY}).forEach(([k,v])=>url.searchParams.set(k,v));
    const upstream=await fetch(url,{headers:{accept:'application/geo+json, application/json'}});
    if(!upstream.ok)return respuestaJson({error:upstream.status===429?'PROVIDER_RATE_LIMITED':'PROVIDER_ERROR'},upstream.status===429?429:502);
    const payload=await upstream.json();
    const dentro=p=>String(p.country_code||'').toLowerCase()==='pr'&&Number(p.lat)>=17.5&&Number(p.lat)<=18.7&&Number(p.lon)>=-67.5&&Number(p.lon)<=-65;
    const results=(Array.isArray(payload.features)?payload.features:[]).filter(f=>dentro(f.properties||{})).slice(0,8).map(f=>{const p=f.properties||{},direccion=p.formatted||[p.address_line1,p.address_line2].filter(Boolean).join(', ');return {provider:'geoapify',providerId:p.place_id||null,nombre:p.name||p.address_line1||direccion||'Lugar',direccion:direccion||'',lat:Number(p.lat),lng:Number(p.lon),tipo:p.result_type||'place',fuente:'Geoapify · OpenStreetMap'};});
    return respuestaJson({results,attribution:'Powered by Geoapify · OpenStreetMap contributors'});
  }
  const terminos=normalizarBusqueda(q).split(/\\s+/).filter(Boolean);
  const results=LUGARES_SIMULADOS.filter(l=>terminos.every(t=>normalizarBusqueda(l.nombre+' '+l.direccion).includes(t))).map(l=>({...l,provider:'simulado',providerId:null,tipo:'place',fuente:'Lugares ficticios de prueba'}));
  return respuestaJson({results,attribution:'Datos ficticios de prueba'});
}
`;
worker = replaceExactly(worker, 'const CABECERAS = {', provider + '\nconst CABECERAS = {', 'proveedor temporal');
worker = replaceExactly(worker, `    if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('No encontrado', { status: 404, headers: CABECERAS });`, `    if (url.pathname === '/api/places/search') return buscarLugaresTemporal(request, env);\n    if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('No encontrado', { status: 404, headers: CABECERAS });`, 'ruta de búsqueda');
worker = replaceExactly(worker, '  async fetch(request) {', '  async fetch(request, env) {', 'entorno del Worker');

fs.writeFileSync(outputPath, worker.replace(/\n+$/, '') + '\n');
console.log(JSON.stringify({ outputPath, bytes: Buffer.byteLength(worker), mode: 'simulado' }));
