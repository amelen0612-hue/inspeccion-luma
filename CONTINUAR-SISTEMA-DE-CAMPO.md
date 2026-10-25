# Continuidad — Sistema de Campo

Cierre: 24 de octubre de 2026, hora de Puerto Rico. No repetir investigación ni pruebas para recuperar contexto. Este cierre solo documenta y consulta estado; no modifica despliegues.

## Recuperación del trabajo

- Repositorio: https://github.com/amelen0612-hue/inspeccion-luma
- Rama independiente: `work/anadir-parada-geoapify-fix-20261024`.
- Base solicitada: `d07577e95dc9927b180af9def047d3e4c0a3064d`.
- Avance posterior conservado: `a886afb4dab092181124d7043ca608fd910c699f`.
- Conexión real funcional: `88ec95b0b08c33f35077bb8f30289056ecd87a61`.
- Registro de búsqueda real: `1254f67f702c8ee58388d1b2df1014de043481d1`.
- El commit que contiene este documento cierra la entrega. Su SHA final se entrega en el chat y en el recibo local de cierre; no puede incluir su propio SHA dentro del mismo commit.

```sh
git clone --branch work/anadir-parada-geoapify-fix-20261024 --single-branch https://github.com/amelen0612-hue/inspeccion-luma.git
cd inspeccion-luma
git status --short --branch
git log -3 --oneline
```

Para reproducir exactamente el cierre, usar `git switch --detach SHA_FINAL_DEL_RECIBO` después de clonar. Para cambios nuevos, crear otra rama desde ese SHA.

## Estado exacto del Worker temporal

URL: https://sistema-campo-anadir-prueba.amelen0612.workers.dev/
Cuenta Cloudflare: `39226f05dd72db6c360c432f38180c3f`.
Worker: `sistema-campo-anadir-prueba`.
Deployment activo: `03964798-a6b5-47fb-aa4b-decd3333aec1`.
Versión activa al 100 %: `105925ba-1d35-4ecf-be11-18b9dc4bc06b`.
Publicación de esa versión: 24 de octubre, 21:34:05 AST / 25 de octubre, 01:34:05 UTC.
Compatibility date: `2026-09-08`.
Entry point publicado: `worker.mjs`, acompañado por `geoapify-search.mjs`.

| Nombre | Tipo | Estado / valor no secreto |
|---|---|---|
| GEOAPIFY_ENABLED | Plain Text | `true` |
| GEOAPIFY_API_KEY | Secret (`secret_text`) | Presente; valor no leído ni incluido en el cierre |
| SUPABASE_URL | Plain Text | `https://sjpebxmeuyithcohoouj.supabase.co` |
| SUPABASE_ANON_KEY | Plain Text | Clave **publicable** del mismo proyecto usada por el frontend; valor público en `preview/wrangler.jsonc`. No es service_role |
| PLACES_RATE_LIMITER | Rate Limit | Namespace `2026102501`, límite `30`, periodo `60` segundos; clave por usuario autenticado |

La consulta de configuración confirmó únicamente esos cinco bindings. No se modificó ninguno durante el cierre.

## Código que debe conservarse

- `preview/sistema-campo-anadir-prueba.worker.js`: captura base del Worker temporal; no es el artefacto actualizado que se debe desplegar.
- `preview/construir-worker-geoapify-temporal.mjs`: generador de la vista temporal y correcciones de ruta.
- `preview/sistema-campo-anadir-geoapify-temporal.worker.mjs`: artefacto generado actualizado; importa el handler compartido.
- `preview/wrangler.jsonc`: configuración exclusiva de prueba, sin rutas de producción ni secretos.
- `worker/geoapify-search.mjs`: validación de sesión Supabase, rate limit, consulta real y filtrado de Puerto Rico.
- `worker/geoapify-client-adapter.mjs`: transporte del token vigente y una renovación ante 401.
- `tests/geoapify-session.test.mjs`: pruebas específicas de sesión y aislamiento; las demás regresiones ya están guardadas en `tests/`.
- `GEOAPIFY-INTEGRATION.md`: detalles de conexión y verificación real.

Reconstrucción local, solo si hay cambios futuros: `node preview/construir-worker-geoapify-temporal.mjs`.
El despliegue publicado usó dos módulos por API, remapeando el import de la entrada a `./geoapify-search.mjs`. Con Wrangler, usar explícitamente `--config preview/wrangler.jsonc`; Wrangler resuelve y empaqueta el import del repositorio. No ejecutar despliegues durante una mera recuperación de contexto.

## Comportamiento y aislamiento

- «+ Añadir parada» conserva Buscar, Guardados, Coordenadas, confirmación, Ir ahora y Añadir a pendientes.
- El frontend envía `Authorization: Bearer …` al endpoint del mismo origen; el Worker valida la identidad mediante Supabase Auth antes de consultar Geoapify.
- Con Geoapify activo, `?verify=buttons` también exige sesión real; no proporciona token ficticio.
- El proxy de prueba permite Auth y bloquea tablas, RPC, storage y canales remotos. ORS usa el optimizador local de prueba.
- Puntos, visitas y fotos de esta prueba permanecen locales al origen temporal. No se transfieren automáticamente a otro dominio ni a producción.
- Recuperar la ruta no vuelve a sembrar puntos como pendientes; añadir/retomar conserva el destino y las visitas por identidad. Deshacer visita sigue siendo explícito.
- `index.html` no cambió respecto de la base indicada. Estos cambios no están integrados en producción ni en `main`.

## Evidencia ya obtenida; no repetir por rutina

- 23 pruebas anteriores aprobadas para las correcciones de ruta y el Worker temporal.
- 3 comprobaciones específicas de sesión aprobadas tras conectar Geoapify.
- Una búsqueda real desde el frontend, con sesión iniciada por el usuario: **Walmart Cayey** → **Walmart Supercenter**, Cayey, PR 00737; `18.122479, -66.133770`; fuente **Geoapify · OpenStreetMap**.
- Se abrió la confirmación del resultado. No se añadió esa parada ni se abrió navegación real.
- Captura entregada en `outputs/geoapify-busqueda-real-cayey.png` del chat; no contiene credenciales ni tokens.

## Pendientes concretos

1. **Rotar la clave Geoapify.** La existente pasó de Plain Text a Secret, pero sigue siendo la misma. La conversión no revoca la anterior ni elimina su presencia en versiones históricas de Cloudflare. Crear una clave nueva en el proyecto Geoapify existente; Cloudflare → Worker temporal → Settings → Variables and Secrets → editar `GEOAPIFY_API_KEY` como **Secret** → guardar/desplegar; comprobar una búsqueda autorizada; revocar la clave anterior. No enviarla al chat, archivos, capturas ni GitHub. La introducción de la nueva clave corresponde al usuario en el panel seguro.
2. **Integración en producción pendiente de autorización.** No está hecha. La vista temporal contiene sembrado de datos y simulación ORS, por lo que no debe publicarse directamente como producción.
3. **Presentación móvil de la confirmación.** En la captura estrecha de 319 px, las líneas del resumen aparecen en columnas y la fuente se recorta. La búsqueda y selección funcionaron; queda ajustar esa distribución visual antes de publicar.
4. **Alcance de la verificación real.** Se verificó una búsqueda autenticada y su confirmación. No se verificaron cuotas diarias, rotación futura, navegación real ni guardado remoto de una parada Geoapify; este último permanece bloqueado deliberadamente por el aislamiento.

## Publicación futura: únicamente con autorización explícita del usuario

No hay autorización vigente para modificar producción o `main`. Los siguientes pasos son instrucciones futuras, no acciones realizadas:

1. Confirmar con el usuario el Worker, dominio y proyecto Supabase exactos de producción. No inferirlos del nombre de la prueba.
2. Capturar la versión activa de producción, reparto de tráfico, rutas y bindings como referencia para reversión; conservar secretos dentro de Cloudflare, sin exportar valores.
3. Crear una rama de integración desde la base vigente de producción. Portar solo el handler y adaptador Geoapify y las correcciones de estado/progreso del generador a la aplicación real. Revisar el diff completo; no copiar el Worker temporal, su seed, su sesión de comprobación, su proxy de aislamiento ni su optimizador ORS simulado.
4. Conservar las integraciones reales de datos y ORS de producción, sus permisos y sus bindings existentes. No reutilizar los puntos ni el almacenamiento local del dominio de prueba como migración.
5. Preparar una configuración distinta de `preview/wrangler.jsonc`, con el destino de producción confirmado, el proyecto Supabase correcto y un namespace rate limit distinto del temporal. Guardar una clave Geoapify autorizada como Secret. Preservar todos los demás bindings y rutas existentes.
6. Resolver el resumen móvil y validar en una vista previa aislada de la rama de integración la sesión real, la búsqueda, el guardado previsto y la persistencia de visitas. No hacer cambios de esquema, permisos, servicios o planes sin autorización correspondiente.
7. Presentar el commit/diff y plan de reversión al usuario. Fusionar en `main`, publicar y cambiar tráfico solo dentro de la autorización que el usuario otorgue expresamente; no asumirla de una aprobación anterior de la prueba.
8. Tras publicar, ejecutar únicamente las comprobaciones reales acotadas autorizadas. Si falla, restaurar la versión y reparto de tráfico previamente registrados y revisar bindings. No revertir a una versión que vuelva a exponer la clave antigua como Plain Text.

## Mensaje mínimo para continuar

«Continúa Sistema de Campo desde el SHA final del recibo de cierre, rama `work/anadir-parada-geoapify-fix-20261024`, repositorio `amelen0612-hue/inspeccion-luma`. Lee `CONTINUAR-SISTEMA-DE-CAMPO.md` y `GEOAPIFY-INTEGRATION.md`. La búsqueda real ya funcionó y el Worker temporal está activo. No repitas investigaciones o pruebas previas. Prioriza la rotación de la clave y el resumen móvil. Producción y main solo se modifican si te autorizo explícitamente.»
