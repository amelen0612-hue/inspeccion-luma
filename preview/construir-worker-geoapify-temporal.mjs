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


// La ruta puede invalidarse por controles o nuevas paradas. Nunca reiniciar los puntos existentes.
page = replaceExactly(page,
  "      if(!nueva&&rutaUsable())return false;\n      localStorage.setItem('ruta_puntos',JSON.stringify(puntosFicticios()));",
  `      if(!nueva&&rutaUsable())return false;
      if(!nueva&&Array.isArray(leer('ruta_puntos'))){
        const actuales=leer('ruta_puntos');
        const pendientes=actuales.filter(p=>!p.visitado).map(p=>{const [lat,lng]=String(p.coord).split(',').map(Number);return {id:String(p.id),name:p.contador||'Parada',lat,lng};});
        localStorage.setItem(KEY_RUTA,JSON.stringify({puntos:[oficina,...pendientes,oficina],tramo:0,pendientes:pendientes.map(p=>p.id),url:''}));
        return true;
      }
      localStorage.setItem('ruta_puntos',JSON.stringify(puntosFicticios()));`, 'recuperación sin borrar visitas');

const pageParts = extractPages(page);
const pages = pageParts.pages;
let route = pages.ruta;

const oldStatus = `    estado.textContent=(ruta.tramo===0?'Ruta optimizada: '+ultimo+' tramos. Lista para iniciar.':'Destino '+ruta.tramo+' de '+ultimo+': '+ruta.puntos[ruta.tramo].name+(ruta.tramo===ultimo?' — Última parada.':''))+(manual?' · Navegando a: '+(manual.contador||'parada')+' (elegida a mano)':'');`;
const newStatus = `    if(ruta.tramo===0){\n      const primero=indiceSiguiente(ruta,0);\n      estado.textContent='Ruta optimizada: '+ultimo+' tramos. Próxima parada al iniciar: '+ruta.puntos[primero].name;\n    }else{\n      let texto='Destino actual: '+ruta.puntos[ruta.tramo].name+(ruta.tramo===ultimo?' — Última parada.':'');\n      if(ruta.tramo<ultimo){const proximo=indiceSiguiente(ruta,ruta.tramo);texto+=' · Siguiente parada: '+ruta.puntos[proximo].name;}\n      if(manual)texto+=' · Navegando a: '+(manual.contador||'parada')+' (elegida a mano)';\n      estado.textContent=texto;\n    }`;
route = replaceExactly(route, oldStatus, newStatus, 'indicador de próxima parada');

const oldVisited = `      if(existente.visitado){deshacerVisitada(existente.id);return;}\n      if(estaOmitida(rutaGuardada(),existente.id)){retomarParada(existente.id);return;}`;
const newVisited = `      if(existente.visitado){toast((existente.contador||'Esa parada')+' ya está visitada; se conserva en el historial');return;}\n      if(estaOmitida(rutaGuardada(),existente.id)){retomarParada(existente.id);return;}`;
route = replaceExactly(route, oldVisited, newVisited, 'preservación de parada visitada');


// Conservar la identidad del destino aunque se inserte antes del regreso.
route = replaceExactly(route,
  '  if(ruta.tramo>=fin)ruta.tramo=Math.max(0,fin-1);',
  `  if(ruta.tramo>=fin){
    const regreso=ruta.puntos.splice(fin+1,1)[0];
    ruta.puntos.splice(fin,0,regreso);
    ruta.puntos.push({...regreso});
  }`, 'destino estable al insertar');
// Al iniciar otra vez, continuar en la parada actual en lugar de retroceder.
route = replaceExactly(route,
  'const ruta=itinerarioORS(),indice=indiceSiguiente(ruta,0);abrirTramoORS',
  'const ruta=itinerarioORS(),indice=ruta.tramo>0?ruta.tramo:indiceSiguiente(ruta,0);abrirTramoORS', 'reanudar ruta');
// Una búsqueda invalidada no puede reaparecer al cerrar o volver a abrir el modal.
route = replaceExactly(route, '  paradaCandidata=null;resultadosParada=[];', '  busquedaParadaId++;paradaCandidata=null;resultadosParada=[];', 'reinicio de búsqueda');
route = replaceExactly(route, "function cerrarAnadirParada(){document", "function cerrarAnadirParada(){busquedaParadaId++;document", 'cancelación de búsqueda');
route = replaceExactly(route, "  lista.replaceChildren();resultadosParada=[];", "  const turno=++busquedaParadaId;lista.replaceChildren();resultadosParada=[];", 'invalidar consulta anterior');
route = replaceExactly(route, "  const turno=++busquedaParadaId;msg.textContent='Buscando…';", "  msg.textContent='Buscando…';", 'turno único');

pages.ruta = route;
page = page.slice(0, pageParts.start) + JSON.stringify(pages).replace(/</g, '\\u003c') + page.slice(pageParts.end);
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
  if(request.method!=='GET')return new Response(null,{status:405,headers:{allow:'GET'}});
  const q=String(new URL(request.url).searchParams.get('q')||'').normalize('NFKC').replace(/\\s+/g,' ').trim();
  if(q.length<3||q.length>120)return respuestaJson({error:'INVALID_QUERY'},400);
  // Activación real bloqueada por defecto. Requiere flag y secret explícitos, además de sesión Supabase válida.
  if(env.GEOAPIFY_ENABLED==='true')return handleGeoapifySearch(request,env);
  const terminos=normalizarBusqueda(q).split(/\\s+/).filter(Boolean);
  const results=LUGARES_SIMULADOS.filter(l=>terminos.every(t=>normalizarBusqueda(l.nombre+' '+l.direccion).includes(t))).map(l=>({...l,provider:'simulado',providerId:null,tipo:'place',fuente:'Lugares ficticios de prueba'}));
  return respuestaJson({results,attribution:'Datos ficticios de prueba'});
}
`;
worker = replaceExactly(worker, 'const CABECERAS = {', provider + '\nconst CABECERAS = {', 'proveedor temporal');
worker = replaceExactly(worker, `    if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('No encontrado', { status: 404, headers: CABECERAS });`, `    if (url.pathname === '/api/places/search') return buscarLugaresTemporal(request, env);\n    if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('No encontrado', { status: 404, headers: CABECERAS });`, 'ruta de búsqueda');
worker = replaceExactly(worker, '  async fetch(request) {', '  async fetch(request, env) {', 'entorno del Worker');

worker = "import { handleGeoapifySearch } from '../worker/geoapify-search.mjs';\n" + worker;
fs.writeFileSync(outputPath, worker.replace(/\n+$/, '') + '\n');
console.log(JSON.stringify({ outputPath, bytes: Buffer.byteLength(worker), mode: 'simulado' }));
