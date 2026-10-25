import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import worker from '../preview/sistema-campo-anadir-geoapify-temporal.worker.mjs';
const adapter=fs.readFileSync(new URL('../worker/geoapify-client-adapter.mjs',import.meta.url),'utf8').replace('export function ','function ');
test('el adaptador envía el token vigente por Authorization y renueva tras 401',async()=>{
 const calls=[];let refreshed=false;
 const ctx=vm.createContext({window:{},fetch:async(url,options)=>{calls.push(options.headers.authorization);return new Response('{}',{status:calls.length===1?401:200});}});
 vm.runInContext(adapter+';window.install=installGeoapifyPlaceSearch;',ctx);
 ctx.window.install({getAccessToken:async(options)=>{refreshed=options?.refresh||false;return refreshed?'renewed-token':'current-token';}});
 await ctx.window.campoBuscarLugares('San Juan');
 assert.deepEqual(calls,['Bearer current-token','Bearer renewed-token']);assert.equal(refreshed,true);
});
test('sin sesión no se envía una búsqueda anónima',async()=>{
 let calls=0;const ctx=vm.createContext({window:{},fetch:async()=>{calls++;}});
 vm.runInContext(adapter+';window.install=installGeoapifyPlaceSearch;',ctx);
 ctx.window.install({getAccessToken:async()=>null});
 await assert.rejects(()=>ctx.window.campoBuscarLugares('San Juan'),/iniciar sesión/);assert.equal(calls,0);
});
test('Geoapify activo fuerza sesión real y conserva el aislamiento de datos',async()=>{
 const html=await (await worker.fetch(new Request('https://preview.invalid/?verify=buttons'),{GEOAPIFY_ENABLED:'true'})).text();
 assert.match(html,/window.CAMPO_GEOAPIFY_ACTIVO=true/);
 assert.match(html,/if\(!verifyButtons\|\|window.CAMPO_GEOAPIFY_ACTIVO\)return target.auth/);
 assert.match(html,/return bloqueado; \/\/ from, rpc, storage, channel, realtime, schema, rest y cualquier otro/);
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi))assert.doesNotThrow(()=>new vm.Script(script[1]));
});
