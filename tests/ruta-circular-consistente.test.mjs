import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Mismo harness antes y después. Los servicios se simulan; la matriz vial es la
// respuesta OSRM conservada durante la auditoría, no un servicio nuevo del producto.
const source=fs.readFileSync(process.env.RUTA_SOURCE || new URL('../index.html',import.meta.url),'utf8');
function pages(s){const a=s.indexOf('const PAGES=')+12;return JSON.parse(s.slice(a,s.indexOf(';\nlet current=',a)));}
const route=pages(source).ruta;
function extract(text,name){
  const match=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(').exec(text);
  assert.ok(match,name);const end=text.indexOf('\n}',match.index)+2;
  return text.slice(match.index,end);
}
const office={lat:18.1167,lng:-66.1517};
const stops=[
  {id:101,contador:'Ramón — Guavate',coord:'18.135767,-66.100621',visitado:false},
  {id:102,contador:'Feila — Doña Elena',coord:'18.261543,-66.22252',visitado:false},
  {id:103,contador:'Leila — Los Robles',coord:'18.122996,-66.232047',visitado:false},
  {id:104,contador:'Arnaldo — Sabanera',coord:'18.189022,-66.115197',visitado:false},
];
const plain=x=>JSON.parse(JSON.stringify(x));
function permutations(a){return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[v,...p])):[[]];}
function env({points=stops,circular=true,response=null,onInvoke=null,text=route}={}){
  const data=new Map([['ruta_puntos',JSON.stringify(points)],['ruta_oficina',`${office.lat},${office.lng}`]]),messages=[],urls=[],calls=[];
  const controls={
    'ruta-circular':{checked:circular},'ruta-salida':{value:'oficina'},'ruta-llegada':{value:'otro'},
    'ruta-oficina':{value:`${office.lat},${office.lng}`},'ruta-llegada-otro':{value:'18.2,-66.3'},
    'btn-ors':{},'ruta-tramos':{replaceChildren(){}},'btn-iniciar-ruta':{},'btn-siguiente-parada':{},'btn-volver-parada':{},'ruta-navegacion':{},
  };
  const context={console,URL,Set,Map,document:{getElementById:id=>controls[id]},navigator:{userAgent:''},
    localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)},
    toast:x=>messages.push(x),renderLista(){},obtenerSesionRuta:async()=>({user:{id:'test-only'}}),
    window:{parent:{abrirNavegacionMismaPestana:url=>urls.push(url)}},
    rutaSupabase:{functions:{invoke:async(name,{body})=>{
      calls.push({name,body:plain(body)});if(onInvoke)await onInvoke({data,body});
      if(response)return typeof response==='function'?response(body):response;
      // Simulador intencionalmente sensible al orden de trabajos, para observar
      // el contrato de entrada; no representa el algoritmo VROOM real.
      const start=body.stops.find(s=>s.id===body.startId),end=body.stops.find(s=>s.id===body.endId);
      return {data:{ok:true,route:[start,...body.stops.filter(s=>s.id!==start.id&&s.id!==end.id),end],summary:{distance:1,duration:1}},error:null};
    }}},
  };
  vm.createContext(context);
  const names=['getPuntos','coordenadasRuta','extremoRuta','solicitudORS','abrirORS','itinerarioORS','ordenListaRuta','actualizarNavegacionORS','navAppActual','coordenadaNavegacion','urlAppleMaps','urlNavegacionTramo','abrirTramoORS','puntoPorId','esExtremoRuta','estaOmitida','indiceSiguiente','toqueNavegacionPermitido','estaAgregada','iniciarRutaORS','siguienteParadaORS'];
  vm.runInContext("let ubicacionRuta=null,optimizandoORS=false,ultimoToqueNavegacion=-Infinity;const NAV_APPS=['google','waze','apple'];"+names.map(n=>extract(text,n)).join('\n'),context);
  return {data,controls,messages,urls,calls,context,run:s=>vm.runInContext(s,context),saved:()=>JSON.parse(data.get('ruta_ors_ultima')||'null')};
}

test('24 órdenes de las mismas cuatro paradas generan un único payload circular',()=>{
  const bodies=permutations(stops).map(points=>JSON.stringify(env({points}).run('solicitudORS()')));
  assert.equal(new Set(bodies).size,1);
});

test('sincronizar solo el orden de almacenamiento mientras responde ORS no invalida la ruta',async()=>{
  const e=env({onInvoke:({data})=>data.set('ruta_puntos',JSON.stringify([...stops].reverse()))});
  await e.run('abrirORS()');assert.ok(e.saved(),'debe guardar una respuesta válida con las mismas coordenadas');
  assert.ok(!e.messages.some(m=>m.includes('Los puntos cambiaron')));
});

test('cambiar coordenadas durante la solicitud sí rechaza la respuesta',async()=>{
  const e=env({onInvoke:({data})=>data.set('ruta_puntos',JSON.stringify(stops.map((p,i)=>i? p:{...p,coord:'18.14,-66.11'})))});
  await e.run('abrirORS()');assert.equal(e.saved(),null);assert.ok(e.messages.some(m=>m.includes('Los puntos cambiaron')));
});

test('24 entradas y dos contextos independientes conservan secuencia, tarjetas y regreso con proveedor simulado',async()=>{
  const sequences=[];
  for(const points of permutations(stops)){
    const e=env({points});await e.run('abrirORS()');
    const saved=e.saved();assert.ok(saved);assert.equal(saved.puntos.length,6);
    assert.deepEqual([saved.puntos[0].lat,saved.puntos[0].lng],[office.lat,office.lng]);
    assert.deepEqual(saved.puntos.at(-1),saved.puntos[0]);
    const expected=saved.puntos.slice(1,-1).map(p=>p.id);
    assert.deepEqual(plain(e.run('ordenListaRuta(getPuntos()).puntos')).map(p=>String(p.id)),expected);
    e.run('iniciarRutaORS()');
    // Antirrebote se rearma en VM entre acciones separadas del usuario.
    for(let i=0;i<4;i++)e.run('ultimoToqueNavegacion=-Infinity;siguienteParadaORS()');
    assert.equal(e.urls.length,5);
    e.urls.forEach((url,i)=>assert.equal(new URL(url).searchParams.get('destination'),saved.puntos[i+1].lat+','+saved.puntos[i+1].lng));
    const resumed=env({points});resumed.data.set('ruta_ors_ultima',e.data.get('ruta_ors_ultima'));
    assert.deepEqual(plain(resumed.run('itinerarioORS().puntos')),saved.puntos);
    sequences.push(saved.puntos.map(p=>p.id).join('|'));
  }
  assert.equal(new Set(sequences).size,1);
});

test('Ruta Abierta conserva las 24 solicitudes originales y sus extremos distintos',()=>{
  // La fixture guarda el contrato anterior de Ruta Abierta: stops en orden local,
  // salida/llegada agregadas al final; sin tocar sus IDs, perfil o coordenadas.
  for(const points of permutations(stops)){
    const e=env({points,circular:false}),body=plain(e.run('solicitudORS()'));
    assert.deepEqual(body,{stops:[...points.map(p=>({id:String(p.id),name:p.contador,lat:Number(p.coord.split(',')[0]),lng:Number(p.coord.split(',')[1])})),{...office,name:'Oficina',id:'__ors_salida'},{lat:18.2,lng:-66.3,name:'Otro punto (llegada)',id:'__ors_llegada'}],circular:false,startId:'__ors_salida',endId:'__ors_llegada'});
  }
});

test('Circular desde GPS y Otro punto incluye ese origen también como llegada',()=>{
  for(const tipo of ['ubicacion','otro']){
    const e=env();e.controls['ruta-salida'].value=tipo;e.controls['ruta-salida-otro']={value:'18.15,-66.16'};
    e.run('ubicacionRuta={lat:18.15,lng:-66.16}');const body=plain(e.run('solicitudORS()'));
    assert.equal(body.startId,body.endId);assert.equal(body.circular,true);
    assert.deepEqual(body.stops.find(p=>p.id===body.startId),{id:'__ors_salida',lat:18.15,lng:-66.16,name:tipo==='ubicacion'?'Mi ubicación':'Otro punto (salida)'});
  }
});

test('coordenadas coincidentes y IDs distintos eligen el mismo extremo en cada permutación',()=>{
  const points=[{id:3,contador:'C',coord:`${office.lat},${office.lng}`},{id:2,contador:'B',coord:`${office.lat},${office.lng}`},stops[0]];
  const bodies=permutations(points).map(points=>plain(env({points}).run('solicitudORS()')));
  assert.equal(new Set(bodies.map(JSON.stringify)).size,1);assert.equal(bodies[0].startId,'2');
});

test('coordenadas o IDs inválidos no se envían al proveedor',async()=>{
  for(const points of [[{...stops[0],coord:'inválida'}],[stops[0],stops[0]]]){
    const e=env({points});await e.run('abrirORS()');assert.equal(e.calls.length,0);assert.equal(e.saved(),null);
  }
});

test('servicio caído o respuesta sin regreso avisa y no crea un itinerario ficticio',async()=>{
  for(const response of [{data:null,error:{message:'offline'}},body=>({data:{ok:true,route:body.stops},error:null})]){
    const e=env({response});await e.run('abrirORS()');assert.equal(e.saved(),null);assert.ok(e.messages.some(m=>m.startsWith('⛔')));
  }
});

test('24 circuitos de la matriz vial auditada: comparación de costos completos sin inventar tráfico',()=>{
  const m=JSON.parse(fs.readFileSync(new URL('./fixtures/ruta-cayey-osrm.json',import.meta.url)));
  assert.equal(m.code,'Ok');assert.equal(m.durations.length,5);
  const cost=order=>{const r=[0,...order,0];return {seconds:r.slice(1).reduce((s,b,i)=>s+m.durations[r[i]][b],0),meters:r.slice(1).reduce((s,b,i)=>s+m.distances[r[i]][b],0)};};
  const all=permutations([1,2,3,4]).map(order=>({order,...cost(order)})).sort((a,b)=>a.seconds-b.seconds);
  assert.equal(all.length,24);assert.deepEqual(all[0].order,[1,4,2,3]);assert.equal(all[0].seconds,8020.6);assert.equal(all[0].meters,103397.2);
  assert.ok(Math.abs(cost([3,2,1,4]).seconds-8914.8)<1e-6);assert.ok(Math.abs(cost([3,2,4,1]).seconds-8040.4)<1e-6);
  assert.ok(cost([3,2,1,4]).meters>all[0].meters);
});

test('toda la serialización y los scripts inline del index se analizan sin errores',()=>{
  const p=pages(source);assert.deepEqual(Object.keys(p),['inicio','certificaciones','inspecciones','ruta','citas']);
  const compile=text=>{for(const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].trim())new vm.Script(match[1]);}};
  compile(source);for(const html of Object.values(p))compile(html);
});
