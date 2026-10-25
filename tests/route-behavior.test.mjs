import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../preview/sistema-campo-anadir-geoapify-temporal.worker.mjs',import.meta.url),'utf8');
const start=source.indexOf('const PAGINA = ')+15;
const page=JSON.parse(source.slice(start,source.indexOf(';\n\nconst LUGARES_SIMULADOS',start)));
const p=page.indexOf('const PAGES=')+12;
const route=JSON.parse(page.slice(p,page.indexOf(';\nlet current=',p))).ruta;
const fn=name=>{const match=route.match(new RegExp('^function '+name+'\\([^]*?^}', 'm'));assert.ok(match,name);return match[0];};
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
function context(){const localStorage=storage();return vm.createContext({localStorage,console,URL,location:{href:'https://preview.invalid'},window:{},toast:()=>{},getPuntos:()=>JSON.parse(localStorage.getItem('ruta_puntos')||'[]')});}
test('invalidar y recuperar itinerario no borra visitadas, fotos ni puntos añadidos',()=>{
 const c=context();const a=page.indexOf('  const verifyButtons=');const b=page.indexOf('  // Adaptador compatible');
 vm.runInContext(page.slice(a,b)+';globalThis.preparar=prepararRutaFicticia;',c);
 c.preparar();const data=c.getPuntos();data[0].visitado=true;data[0].fotos=['foto-local'];data.push({id:999,contador:'Nueva',coord:'18.4,-66.1',visitado:false});
 c.localStorage.setItem('ruta_puntos',JSON.stringify(data));c.localStorage.removeItem('ruta_ors_ultima');
 c.preparar();assert.deepEqual(c.getPuntos(),data);const saved=JSON.parse(c.localStorage.getItem('ruta_ors_ultima'));assert.ok(saved.puntos.some(p=>p.id==='999'));assert.ok(!saved.puntos.some(p=>p.id==='910001'));
});
test('insertar antes del regreso conserva destino, visitadas y omitidas',()=>{
 const c=context();vm.runInContext(fn('insertarParadaEnRuta'),c);
 const r={tramo:1,puntos:[{id:'o'},{id:'a'},{id:'fin'}],omitidas:['b'],pendientes:['a']};
 c.insertarParadaEnRuta(r,{id:9,contador:'Nueva'},{lat:18.4,lng:-66.1});assert.equal(r.puntos[r.tramo].id,'a');assert.deepEqual(r.omitidas,['b']);assert.equal(r.puntos[2].id,'9');
});
test('reanudar mantiene destino y siguiente salta visitadas u omitidas tras recarga',()=>{
 const c=context();for(const n of ['esExtremoRuta','estaOmitida','indiceSiguiente','iniciarRutaORS'])vm.runInContext(fn(n),c);
 c.localStorage.setItem('ruta_puntos',JSON.stringify([{id:'a',visitado:true},{id:'b',visitado:false},{id:'c',visitado:false}]));
 const r={tramo:1,puntos:[{id:'o'},{id:'a'},{id:'b'},{id:'c'},{id:'__ors_llegada'}],omitidas:['b']};
 assert.equal(c.indiceSiguiente(r,1),3);c.itinerarioORS=()=>r;c.abrirTramoORS=(_,i)=>{c.opened=i;};c.estaAgregada=()=>false;c.iniciarRutaORS();assert.equal(c.opened,1);
});
test('añadir una visitada no reabre ni duplica la parada',()=>{
 const c=context();for(const n of ['coordenadasRuta','paradaExistentePorCoord','anadirParada'])vm.runInContext(fn(n),c);
 const data=[{id:1,contador:'Completada',coord:'18.4,-66.1',visitado:true}];c.localStorage.setItem('ruta_puntos',JSON.stringify(data));c.cerrarAnadirParada=()=>{};
 c.anadirParada({nombre:'Otra etiqueta',lat:18.4,lng:-66.1},'pendiente');assert.deepEqual(c.getPuntos(),data);
});
test('añadir cuando ya se navega al regreso no retrocede y permite la nueva parada',()=>{
 const c=context();vm.runInContext(fn('insertarParadaEnRuta'),c);
 const r={tramo:2,puntos:[{id:'o'},{id:'a'},{id:'__ors_llegada'}],pendientes:['a']};
 c.insertarParadaEnRuta(r,{id:9,contador:'Nueva'},{lat:18.4,lng:-66.1});assert.equal(r.tramo,2);assert.equal(r.puntos[r.tramo].id,'__ors_llegada');assert.equal(r.puntos[r.tramo+1].id,'9');assert.equal(r.puntos.at(-1).id,'__ors_llegada');
});
