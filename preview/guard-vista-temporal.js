(()=>{
  const verifyButtons=new URL(location.href).searchParams.get('verify')==='buttons';
  // ---- Ruta ficticia (solo almacenamiento local de esta vista temporal; no toca Supabase ni el optimizador) ----
  // La app invalida 'ruta_ors_ultima' cuando se toca cualquier control de salida/llegada y, con el optimizador bloqueado, no habria
  // forma de recuperarla. Por eso la ruta se prepara en CADA carga, al volver de Maps y cada vez que la app la borra.
  const SEED='integrado-v1';
  const KEY_RUTA='ruta_ors_ultima';
  const oficina={id:'__ors_salida',name:'Oficina',lat:18.444000,lng:-66.086000};
  // Seis paradas ficticias en orden «optimizado» inicial (PRUEBA-001 a PRUEBA-006).
  const paradas=[
    {id:'910001',name:'PRUEBA-001',lat:18.465500,lng:-66.105700},
    {id:'910002',name:'PRUEBA-002',lat:18.451200,lng:-66.068900},
    {id:'910003',name:'PRUEBA-003',lat:18.420300,lng:-66.058100},
    {id:'910004',name:'PRUEBA-004',lat:18.398800,lng:-66.152200},
    {id:'910005',name:'PRUEBA-005',lat:18.380100,lng:-66.120600},
    {id:'910006',name:'PRUEBA-006',lat:18.433900,lng:-66.017300}
  ];
  const stops=[...paradas,{lat:oficina.lat,lng:oficina.lng,name:oficina.name,id:oficina.id}];
  const puntosFicticios=()=>paradas.map(p=>({id:Number(p.id),contador:p.name,coord:p.lat.toFixed(6)+','+p.lng.toFixed(6),fotos:[],visitado:false,_dirty:false,_syncedAt:'preview-local',creado:new Date().toISOString()}));
  const rutaFicticia=()=>({
    firma:JSON.stringify({stops,circular:true,startId:oficina.id,endId:oficina.id}),
    puntos:[oficina,...paradas,oficina],
    url:'',tramo:0,pendientes:paradas.map(p=>p.id)
  });
  // Optimizador LOCAL falso (vecino más cercano de inicio a fin). Reemplaza a 'ors-optimize': no usa red, cuotas ni credenciales.
  const distancia=(a,b)=>Math.hypot(a.lat-b.lat,a.lng-b.lng);
  function optimizarLocal(body){
    const por=new Map(body.stops.map(p=>[String(p.id),p]));
    const inicio=por.get(body.startId),fin=por.get(body.endId);
    const libres=body.stops.filter(p=>p.id!==body.startId&&p.id!==body.endId);
    const ruta=[inicio];let actual=inicio;
    while(libres.length){libres.sort((a,b)=>distancia(actual,a)-distancia(actual,b));actual=libres.shift();ruta.push(actual);}
    ruta.push(fin);
    return ruta.map(p=>({id:p.id,name:p.name,lat:p.lat,lng:p.lng}));
  }
  const leer=(clave)=>{try{return JSON.parse(localStorage.getItem(clave)||'null');}catch(e){return null;}};
  // Mismas condiciones que itinerarioORS() de la app: si se cumplen, "Iniciar ruta" queda habilitado.
  function rutaUsable(){
    const ruta=leer(KEY_RUTA),actuales=leer('ruta_puntos');
    if(!ruta||!Array.isArray(ruta.puntos)||ruta.puntos.length<2||!Array.isArray(actuales))return false;
    if(actuales.some(p=>!p.visitado&&!ruta.puntos.some(s=>String(s.id)===String(p.id))))return false;
    return !ruta.puntos.filter(p=>!ruta.pendientes||ruta.pendientes.includes(String(p.id))).some(p=>!actuales.some(a=>String(a.id)===String(p.id)&&String(a.coord).split(',').length===2&&Number(String(a.coord).split(',')[0])===Number(p.lat)&&Number(String(a.coord).split(',')[1])===Number(p.lng)));
  }
  function prepararRutaFicticia(){
    try{
      const nueva=localStorage.getItem('campo_preview_seed')!==SEED;
      if(!nueva&&rutaUsable())return false;
      // La ruta puede invalidarse por los controles o por nuevas paradas: nunca reiniciar los puntos existentes.
      if(!nueva&&Array.isArray(leer('ruta_puntos'))){
        const actuales=leer('ruta_puntos');
        const pendientes=actuales.filter(p=>!p.visitado).map(p=>{const [lat,lng]=String(p.coord).split(',').map(Number);return {id:String(p.id),name:p.contador||'Parada',lat,lng};});
        localStorage.setItem(KEY_RUTA,JSON.stringify({puntos:[oficina,...pendientes,oficina],tramo:0,pendientes:pendientes.map(p=>p.id),url:''}));
        return true;
      }
      localStorage.setItem('ruta_puntos',JSON.stringify(puntosFicticios()));
      localStorage.removeItem('ruta_puntos_tombstones');
      localStorage.setItem('ruta_oficina',oficina.lat+','+oficina.lng);
      localStorage.setItem(KEY_RUTA,JSON.stringify(rutaFicticia()));
      localStorage.setItem('campo_preview_seed',SEED);
      return true;
    }catch(e){console.error('Vista temporal: no se pudo preparar la ruta ficticia',e);return false;}
  }
  window.CAMPO_PREPARAR_RUTA_FICTICIA=prepararRutaFicticia;
  prepararRutaFicticia();
  const refrescarRuta=(ventana)=>{try{if(typeof ventana.renderLista==='function')ventana.renderLista();else if(typeof ventana.actualizarNavegacionORS==='function')ventana.actualizarNavegacionORS();}catch(e){}};
  const vigilarIframe=()=>{
    const marco=document.getElementById('app');
    if(!marco)return;
    const alCargar=()=>{
      const ventana=marco.contentWindow;
      if(!ventana)return;
      let almacenamiento;
      try{almacenamiento=ventana.Storage&&ventana.Storage.prototype;}catch(e){return;}
      if(almacenamiento&&!almacenamiento.__campoRutaFicticia){
        const quitar=almacenamiento.removeItem;
        almacenamiento.removeItem=function(clave){
          const resultado=quitar.apply(this,arguments);
          if(String(clave)===KEY_RUTA&&this===ventana.localStorage)prepararRutaFicticia();
          return resultado;
        };
        Object.defineProperty(almacenamiento,'__campoRutaFicticia',{value:true});
      }
      try{envolverLibreria(ventana.supabase);}catch(e){}
      if(prepararRutaFicticia())refrescarRuta(ventana);
    };
    marco.addEventListener('load',alCargar);
    // Si el iframe ya terminó de cargar antes de registrar el listener, prepararlo ahora.
    try{if(marco.contentDocument&&marco.contentDocument.readyState==='complete'&&marco.contentWindow.location.href==='about:srcdoc')alCargar();}catch(e){}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',vigilarIframe);else vigilarIframe();
  window.addEventListener('pageshow',()=>{if(prepararRutaFicticia()){const marco=document.getElementById('app');if(marco&&marco.contentWindow)refrescarRuta(marco.contentWindow);}});
  // ---- Aislamiento de datos remotos: solo se permite auth; todo lo demás queda bloqueado ----
  // Se aplica a CUALQUIER cliente que cree la libreria, aunque llegue tarde (p. ej. por el respaldo de otro CDN), y a las
  // librerias cargadas dentro del iframe. Un cliente sin aislar nunca se conserva (ver el control al terminar de cargar).
  const guardados=new WeakSet();
  const MENSAJE_BLOQUEO='Vista temporal aislada: datos remotos bloqueados';
  // Cualquier cadena (storage.from(), realtime.connect(), rest.from()...) termina lanzando el bloqueo al invocarse.
  const bloqueado=new Proxy(function(){},{
    apply(){throw new Error(MENSAJE_BLOQUEO);},
    construct(){throw new Error(MENSAJE_BLOQUEO);},
    get(destino,prop){if(typeof prop==='symbol'||prop==='then'||prop==='toJSON')return undefined;return bloqueado;},
    set(){return false;},
  });
  function aislarCliente(real){
    const proxy=new Proxy(real,{
      get(target,prop,receiver){
        if(prop==='auth'){
          if(!verifyButtons||window.CAMPO_GEOAPIFY_ACTIVO)return target.auth;
          return new Proxy(target.auth,{get(authTarget,authProp,authReceiver){
            if(authProp==='getSession')return async()=>({data:{session:{user:{id:'preview-verification',email:'prueba@local.invalid',user_metadata:{nombre:'Prueba local',rol:'Prueba'}}}},error:null});
            const value=Reflect.get(authTarget,authProp,authReceiver);
            return typeof value==='function'?value.bind(authTarget):value;
          }});
        }
        if(prop==='functions')return {invoke:async(nombre,opciones)=>{
          // 'places-search' (función de servidor en producción) llega aquí al endpoint del Worker de prueba con la sesión real.
          if(String(nombre)==='places-search'&&opciones&&opciones.body){
            let token='';try{const {data}=await receiver.auth.getSession();token=(data&&data.session&&data.session.access_token)||'';}catch(e){}
            const r=await fetch('/api/places/search?q='+encodeURIComponent(opciones.body.q),{headers:{authorization:'Bearer '+token,accept:'application/json'},cache:'no-store'});
            return r.ok?{data:await r.json(),error:null}:{data:null,error:{context:r}};
          }
          if(String(nombre)==='ors-optimize'&&opciones&&opciones.body){
            (window.CAMPO_OPTIMIZACIONES_LOCALES=window.CAMPO_OPTIMIZACIONES_LOCALES||[]).push(JSON.parse(JSON.stringify(opciones.body)));
            return {data:{ok:true,route:optimizarLocal(opciones.body)},error:null};
          }
          (window.CAMPO_INVOCACIONES_BLOQUEADAS=window.CAMPO_INVOCACIONES_BLOQUEADAS||[]).push(String(nombre));return {data:null,error:{message:'Vista temporal aislada'}};}};
        if(typeof prop==='symbol'||prop==='then'||prop==='toJSON')return undefined;
        return bloqueado; // from, rpc, storage, channel, realtime, schema, rest y cualquier otro
      },
      set(){return false;},
      defineProperty(){return false;},
    });
    guardados.add(proxy);
    return proxy;
  }
  function envolverLibreria(libreria){
    if(!libreria||typeof libreria.createClient!=='function'||libreria.__campoAislado)return libreria;
    const crear=libreria.createClient.bind(libreria);
    libreria.createClient=(...args)=>aislarCliente(crear(...args));
    Object.defineProperty(libreria,'__campoAislado',{value:true});
    return libreria;
  }
  window.CAMPO_ENVOLVER_SUPABASE=envolverLibreria;
  const sinAislar=()=>{if(window.campoSupabase&&!guardados.has(window.campoSupabase)){window.campoSupabase=null;console.error('Vista temporal: cliente de Supabase sin aislar descartado');}};
  sinAislar();
  window.addEventListener('load',sinAislar);
  let libreriaSupabase=envolverLibreria(window.supabase);
  try{
    // Si la librería llega después (p. ej. respaldo de otro CDN), se envuelve al asignarse.
    Object.defineProperty(window,'supabase',{configurable:true,enumerable:true,get(){return libreriaSupabase;},set(valor){libreriaSupabase=envolverLibreria(valor);}});
  }catch(e){
    // La librería ya cargada declara window.supabase como propiedad NO configurable (pero escribible): ya está envuelta arriba y
    // un cliente creado sin pasar por ella se descarta al cargar (sinAislar); el resto del script debe seguir ejecutándose.
  }
  // ---- Registro opcional de eventos (?diag=1) para investigar el traspaso Edge -> Google Maps; inactivo por defecto ----
  if(new URL(location.href).searchParams.get('diag')==='1'){
    const CLAVE_DIAG='campo_diag_log';
    const hora=()=>new Date().toISOString().slice(11,23);
    const leerDiag=()=>{try{return JSON.parse(localStorage.getItem(CLAVE_DIAG)||'[]');}catch(e){return[];}};
    let caja=null;
    const pintarDiag=()=>{if(caja)caja.textContent=leerDiag().slice(-14).join('\n');};
    const diag=(tipo,detalle)=>{const lista=leerDiag();lista.push(hora()+' '+tipo+(detalle?' '+detalle:''));try{localStorage.setItem(CLAVE_DIAG,JSON.stringify(lista.slice(-150)));}catch(e){}pintarDiag();};
    const tipoNav=()=>{try{return performance.getEntriesByType('navigation')[0].type;}catch(e){return '?';}};
    diag('CARGA','vis='+document.visibilityState+' nav='+tipoNav()+' hist='+history.length+' hash='+location.hash+' ruta='+location.pathname);
    document.addEventListener('visibilitychange',()=>diag('visibilitychange','vis='+document.visibilityState));
    window.addEventListener('pagehide',(e)=>diag('pagehide','persisted='+e.persisted));
    window.addEventListener('pageshow',(e)=>diag('pageshow','persisted='+e.persisted+' hist='+history.length));
    window.addEventListener('blur',()=>diag('blur'));
    window.addEventListener('focus',()=>diag('focus'));
    document.addEventListener('freeze',()=>diag('freeze'));
    document.addEventListener('resume',()=>diag('resume'));
    document.addEventListener('DOMContentLoaded',()=>{
      caja=document.createElement('pre');
      caja.style.cssText='position:fixed;left:0;right:0;bottom:0;max-height:26vh;overflow:hidden;margin:0;padding:6px 8px;font:10px/1.3 Menlo,monospace;background:rgba(255,255,255,.92);color:#102a43;z-index:2147483646;pointer-events:none;white-space:pre-wrap';
      const copiar=document.createElement('button');
      copiar.textContent='Copiar registro';
      copiar.style.cssText='position:fixed;right:6px;top:6px;z-index:2147483647;padding:6px 10px;font-size:12px;border:0;border-radius:8px;background:#b83280;color:#fff';
      const mostrar=(texto)=>{caja.style.pointerEvents='auto';caja.style.maxHeight='60vh';caja.style.overflow='auto';caja.textContent=texto;};
      copiar.onclick=()=>{const texto=leerDiag().join('\n');if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(texto).then(()=>{copiar.textContent='Copiado';setTimeout(()=>{copiar.textContent='Copiar registro';},2000);},()=>mostrar(texto));}else{mostrar(texto);}};
      document.body.append(caja,copiar);
      pintarDiag();
      const original=window.abrirNavegacionMismaPestana;
      if(typeof original==='function')window.abrirNavegacionMismaPestana=function(url){diag('abrirNavegacionMismaPestana',String(url).slice(0,160));return original.apply(this,arguments);};
    });
  }
  window.CAMPO_VISTA_TEMPORAL=true;
})();
