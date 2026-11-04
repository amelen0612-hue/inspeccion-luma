import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';

const fixture=name=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url)));
const real=fixture('ors-cayey-respuestas-reales.json');
const measured=fixture('ors-cayey-directions-medida.json');
const osrm=fixture('ruta-cayey-osrm-verificada.json');
const ids=['__ors_salida','1793729372688','1793729574714','1793794516310','1793794575766'];
const chosen=[0,3,2,4,1,0];
const permutations=a=>a.length?a.flatMap((x,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[x,...p])):[[]];
const circuits=matrix=>permutations([1,2,3,4]).map(p=>{
  const order=[0,...p,0];return {order,
    seconds:order.slice(1).reduce((s,b,i)=>s+matrix.durations[order[i]][b],0),
    meters:order.slice(1).reduce((s,b,i)=>s+matrix.distances[order[i]][b],0)};
}).sort((a,b)=>a.seconds-b.seconds);

test('27 respuestas reales: 24 órdenes originales y tres solicitudes idénticas dan misma secuencia y costo',()=>{
  assert.equal(real.runs.length,27);
  assert.equal(new Set(real.runs.slice(0,24).map(r=>r.input_ids.join('|'))).size,24);
  assert.equal(new Set(real.runs.slice(24).map(r=>r.input_ids.join('|'))).size,1);
  for(const r of real.runs){
    assert.equal(r.status,200);assert.equal(r.ok,true);assert.equal(r.directions_status,200);
    assert.deepEqual(r.route.map(p=>p.id),chosen.map(i=>ids[i]));
    assert.deepEqual(r.summary,{distance:107500.2,duration:8274.8});
    assert.equal(r.route[0].role,'start');assert.equal(r.route.at(-1).role,'end');
    for(const p of r.route){assert.deepEqual([p.lat,p.lng],measured.coords[ids.indexOf(p.id)]);}
  }
});

test('matriz medida conserva 20 tramos dirigidos válidos, con una tarea de costo cero en el origen',()=>{
  assert.equal(measured.records.length,20);
  assert.equal(new Set(measured.records.map(r=>r.from+','+r.to)).size,20);
  for(const r of measured.records){
    assert.notEqual(r.from,r.to);assert.equal(r.status,200);assert.equal(r.directions_status,200);
    const [start,job,end]=r.request.stops;
    assert.deepEqual([start.lat,start.lng],measured.coords[r.from]);
    assert.deepEqual([job.lat,job.lng],measured.coords[r.from]);
    assert.deepEqual([end.lat,end.lng],measured.coords[r.to]);
    assert.equal(r.request.circular,false);assert.equal(r.route.length,3);
    assert.equal(measured.durations[r.from][r.to],r.summary.duration);
    assert.equal(measured.distances[r.from][r.to],r.summary.distance);
  }
});

test('circuito elegido es mínimo de los 24 en ORS Directions, y coincide con respuesta completa incluido regreso',()=>{
  const all=circuits(measured);assert.equal(all.length,24);
  assert.deepEqual(all[0].order,chosen);assert.equal(all[0].seconds,8274.8);assert.equal(all[0].meters,107500.2);
  assert.equal(measured.distances[1][0],9830.7);assert.equal(measured.durations[1][0],868.8);
  const observed=all.find(r=>r.order.join(',')==='0,3,2,1,4,0');
  assert.ok(Math.abs(observed.meters-118592.3)<1e-6);assert.ok(Math.abs(observed.seconds-9077.3)<1e-6);
  assert.ok(Math.abs(observed.meters-all[0].meters-11092.1)<1e-6);
  assert.ok(Math.abs(observed.seconds-all[0].seconds-802.5)<1e-6);
});

test('OSRM y ORS no son matrices intercambiables ni comparten el mismo mejor circuito',()=>{
  const bestOsrm=circuits(osrm)[0],bestOrs=circuits(measured)[0];
  assert.deepEqual(bestOsrm.order,[0,1,4,2,3,0]);assert.notDeepEqual(bestOsrm.order,bestOrs.order);
  assert.equal(bestOsrm.seconds,7989.4);assert.equal(bestOsrm.meters,103179.7);
  assert.deepEqual(measured.coords[1],[18.136767,-66.100621]);
});

const backend=stripTypeScriptTypes(fs.readFileSync(new URL('./fixtures/ors-optimize-v3.txt',import.meta.url),'utf8').replace(/^import .*;\n/,''));
async function server(mode){
  let handle;const calls=[];
  const body={stops:measured.coords.map(([lat,lng],i)=>({id:ids[i],lat,lng})),circular:true,startId:ids[0],endId:ids[0]};
  const context=vm.createContext({Response,Request,console,Deno:{env:{get:()=> 'TEST_ONLY'},serve:f=>handle=f},fetch:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    if(url.endsWith('/vroom/v0')){
      if(mode==='optimization-error')throw Error('simulated outage');
      return Response.json({routes:[{steps:[3,2,4,1].map(id=>({type:'job',id})),distance:120000,duration:9000}]});
    }
    if(mode==='directions-error')return Response.json({error:'simulated'}, {status:503});
    return Response.json({features:[{geometry:null,properties:{summary:{distance:107500.2,duration:8274.8}}}]});
  }});
  vm.runInContext(backend,context);
  const response=await handle(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(body)}));
  return {status:response.status,data:await response.json(),calls};
}

test('backend fijado envía regreso ANTES de VROOM y Directions conserva la secuencia completa',async()=>{
  const r=await server('ok');assert.equal(r.status,200);assert.equal(r.calls.length,2);
  const vehicle=r.calls[0].body.vehicles[0];assert.deepEqual(vehicle.start,[-66.1517,18.1167]);assert.deepEqual(vehicle.end,vehicle.start);
  assert.equal(r.calls[0].body.jobs.length,4);
  assert.deepEqual(r.calls[1].body.coordinates,chosen.map(i=>[measured.coords[i][1],measured.coords[i][0]]));
  assert.deepEqual(r.data.route.map(p=>p.id),chosen.map(i=>ids[i]));
});

test('fallo de VROOM no activa otro proveedor ni heurística local',async()=>{
  const r=await server('optimization-error');assert.equal(r.status,502);assert.equal(r.data.ok,false);assert.equal(r.calls.length,1);assert.equal(r.data.route,undefined);
});

test('fallo de Directions solo conserva resumen VROOM: no sustituye ni reordena el recorrido',async()=>{
  const r=await server('directions-error');assert.equal(r.status,200);assert.equal(r.data.ok,true);
  assert.equal(r.data.directions_status,503);assert.deepEqual(r.data.summary,{distance:120000,duration:9000});
  assert.deepEqual(r.data.route.map(p=>p.id),chosen.map(i=>ids[i]));assert.equal(r.calls.length,2);
});
