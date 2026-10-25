# «+ Añadir parada» con búsqueda Geoapify — integración (pendiente de aprobación)

Base: producción `170945f`. Rama: `feature/anadir-geoapify-integrado-20261024`. Nada de esto está desplegado.

## Qué cambia
- `index.html` (solo la página Ruta del Día): botón «＋ Añadir parada», modal (Buscar / Guardados / Coordenadas), confirmación, «Ir ahora» o «A pendientes»,
  y las correcciones de progreso acordadas (próxima parada visible, reanudar en la parada actual, destino estable al insertar antes del regreso,
  visitadas conservadas, cancelación de búsquedas anteriores).
- `supabase/functions/places-search/index.ts` (nueva): consulta Geoapify solo para Puerto Rico. Mismo patrón que `ors-optimize`:
  JWT de Supabase obligatorio, CORS solo `https://amelen0612-hue.github.io`, la clave vive únicamente como secreto de la función.
- La página llama `rutaSupabase.functions.invoke('places-search', { body: { q } })`. No contiene clave, URL de Geoapify, datos ficticios ni simulaciones.

No se tocan: ORS (`ors-optimize`, `abrirORS`, `solicitudORS`), Google Maps/Waze/Apple Maps, el menú de salida/llegada, la barra inferior, el resto del contenedor ni las demás páginas.

## Despliegue (solo con aprobación)
1. Crear el secreto `GEOAPIFY_API_KEY` (ver «Rotación de la clave»).
2. Desplegar la función `places-search` en el proyecto Supabase `sjpebxmeuyithcohoouj` **con verify_jwt activado**.
3. Verificar una búsqueda con sesión iniciada; después fusionar `index.html` en `main` (GitHub Pages).
Sin el paso 2, el buscador muestra un error legible y «Guardados» y «Coordenadas» siguen funcionando.

Límites: 30 búsquedas por usuario y minuto (por instancia de la función; el tope real es la cuota diaria gratuita de Geoapify, 3.000 créditos).
Búsqueda solo al pulsar «Buscar», mínimo 3 letras. Atribución: «Powered by Geoapify · OpenStreetMap contributors» (la respuesta la incluye).

## Rotación de la clave (nunca pegarla en un chat, archivo, captura ni GitHub)
1. Geoapify (proyecto existente) → API Keys → crear una clave nueva.
2. Escribirla **solo** en el panel seguro:
   - Producción: Supabase → proyecto → Edge Functions → Secrets → `GEOAPIFY_API_KEY`.
   - Worker de prueba: Cloudflare → Workers & Pages → `sistema-campo-anadir-prueba` → Settings → Variables and Secrets → `GEOAPIFY_API_KEY` (tipo **Secret**).
3. Comprobar una búsqueda con sesión iniciada.
4. Revocar la clave anterior en Geoapify (estuvo como texto visible en versiones anteriores del Worker de prueba).

## Reversión
- Frontend: `git revert` del commit de fusión (o restaurar `index.html` desde `170945f`).
- Función: eliminar `places-search`; el resto de la app no depende de ella.

## Comportamiento de omitidas (sin cambios, documentado)
Al reoptimizar, una parada omitida es pendiente y vuelve a entrar como parada normal (pierde la marca de omitida).
