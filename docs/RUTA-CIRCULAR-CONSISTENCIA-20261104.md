# Ruta Circular — corrección de consistencia en rama de prueba

Base de producción: `11a856849e2080fef3d24fde28c06fc17d5f6120`.
Rama: `prueba/ruta-circular-consistente-20261104`.
Fecha: 4 de noviembre de 2026. Estado: preparada para revisión técnica, sin publicar.

## Causa comprobada y alcance del cambio

El orden de almacenamiento de `ruta_puntos` se trasladaba al array `stops` de la solicitud. La función desplegada `ors-optimize` asigna a cada trabajo un ID numérico por posición. Con las mismas cuatro paradas y coordenadas, los 24 órdenes de entrada generaban 24 solicitudes distintas. No había una representación estable del mismo problema circular.

Además, `abrirORS` verifica que los puntos no hayan cambiado durante la llamada comparando dos solicitudes mediante `JSON.stringify`. Se reprodujo que una sincronización que solo cambia el orden del array provoca «Los puntos cambiaron. Optimiza nuevamente» y rechaza una respuesta válida. No hace falta que ORS falle para reproducir este defecto.

El parche ordena **la representación de entrada**, exclusivamente si está marcado Circular, antes de identificar salida/llegada. Compara latitud, longitud y, para empates, ID mediante código de caracteres, sin depender del idioma del equipo. Esto no impone una secuencia geográfica de visita: los trabajos siguen libres para que VROOM los ordene según costos viales. No modifica los registros almacenados ni la respuesta del proveedor.

La causa del recorrido de mayor costo y de las diferencias observadas entre los dispositivos **no está cerrada**: faltan los requests/responses efectivos de ambos dispositivos y una comparación con la misma matriz del ORS usado por el incidente. El parche corrige el defecto reproducido de entrada y validación; no se presenta como prueba de que ORS, sus heurísticas o la última actualización fueran responsables de los 12 km adicionales.

## Historial y comparación

Se reutilizaron el informe de auditoría del 4 de noviembre, la auditoría del 27 de octubre, las copias históricas y la matriz OSRM existentes. No se repitió la búsqueda vial.

- Producción y `main` continuaban en el SHA base, con despliegue Pages exitoso `40156795452`.
- `ors-optimize` continuaba ACTIVE, versión 3, bundle `ea20c3c32d245bca4ec18474c42c543794cee779f3323397bb177d1246a254c6`. Solo se leyó; no se cambió ni desplegó.
- El comparador de solicitudes se introdujo en `442c5453ec4dc5b0ee3f8e5d4eea315ad1964e1d` («Integra ORS…», 17 de septiembre). La construcción de `stops` actual procede de `ac72b39f48fb7d13270b1e57cc4a93916bdf3625` («Prueba extremos…», 17 de septiembre).
- Las cinco funciones centrales auditadas eran idénticas entre producción y `13b007aa…`, `342f1ca4…` y `170945f3…`. No se identificó una regresión reciente de estas funciones. Los cambios de octubre ampliaron navegación, progreso e inserción de paradas; siguen siendo hipótesis del contexto del incidente, no causas demostradas.

## Algoritmo vigente

Optimizar llama `ors-optimize`, que prepara un vehículo `driving-car` y consulta VROOM/HeiGIT. Circular envía `start` y `end` iguales **antes de optimizar**. Directions evalúa posteriormente la secuencia completa, incluido el regreso. No hay optimización local ni fallback geográfico. No se trata de una ruta abierta a la que se añade la oficina después del cálculo.

Este parche no añade endpoints, API keys, llamadas, servicios ni costos. El proveedor sigue definiendo los costos viales. La misma solicitud reduce una fuente de diferencias; no garantiza que un proveedor externo cambiante devuelva siempre la misma respuesta ni un óptimo global.

## Archivos, funciones y líneas

| Archivo | Cambio |
|---|---|
| `index.html`, línea física 22, `PAGES.ruta` | Solo `solicitudORS`: 8 líneas agregadas. Corresponden a líneas 850–857 al extraer el módulo Ruta del JSON. |
| `tests/ruta-circular-consistente.test.mjs` | 11 pruebas nuevas: contrato, sincronización, navegación, persistencia, costos y sintaxis. |
| `tests/fixtures/ruta-cayey-osrm.json` | Respuesta vial de la auditoría, solo para pruebas; no se carga en la aplicación. |
| `tests/anadir-geoapify.test.mjs`, alrededor de 110–119 | Actualiza el test histórico de funciones inmutables para admitir únicamente el cambio de `solicitudORS`, que se prueba por separado. |
| Este documento | Diagnóstico, reproducción, resultados y límites. |

No cambiaron `abrirORS`, `itinerarioORS`, tarjetas, generadores de URL, Iniciar ruta, Siguiente parada, Supabase, autenticación, RLS, oficina/GPS ni otros módulos. Las páginas Inicio, Certificaciones, Inspecciones, Citas y el contenedor se verificaron idénticos. La serialización se preservó y se analizaron los scripts inline de todas las páginas sin errores sintácticos.

Diff semántico completo del producto:

```diff
 const llegada=document.getElementById('ruta-circular').checked?salida:extremoRuta('llegada');
+// En Circular, el orden local de sincronización no debe cambiar la solicitud
+// ni los IDs numéricos que ors-optimize asigna a los trabajos. El mismo conjunto
+// de puntos produce el mismo payload, también si una parada coincide con salida.
+// Comparación numérica y por código de ID: no depende del idioma del dispositivo.
+// Ruta Abierta conserva exactamente su orden de entrada anterior.
+if(document.getElementById('ruta-circular').checked){
+  stops.sort((a,b)=>a.lat-b.lat||a.lng-b.lng||(a.id<b.id?-1:a.id>b.id?1:0));
+}
 function agregarExtremo(p,id){
```

El diff Git completo, incluidos tests, fixture y documentación, se puede revisar comparando la rama con el SHA base. El JSON embebido ocupa una línea física, por eso Git muestra toda la línea 22 como reemplazada; no implica cambios de las demás páginas.

## Pruebas antes y después

Ejecutar con Node v24:

```bash
node --test tests/*.test.mjs
```

| Grupo | Producción antes | Rama después |
|---|---:|---:|
| 37 pruebas existentes | 37 pasan, 0 fallos, 0 omitidas | 37 pasan, 0 fallos, 0 omitidas |
| 11 pruebas nuevas | 7 pasan, 4 fallan | 11 pasan, 0 fallos |
| Suite completa de rama | — | **48 pasan, 0 fallos, 0 omitidas** |

Las cuatro nuevas que fallaban antes: un único payload para 24 órdenes; no rechazar por reordenamiento mientras llega respuesta; misma secuencia con simulador sensible al orden; selección estable del extremo si varias paradas coinciden con salida. La secuencia del simulador demuestra el contrato; **no es una reproducción del algoritmo interno de VROOM ni de su respuesta real**.

También se verificaron: cambio real de coordenadas en vuelo rechazado; 24 contratos de Ruta Abierta sin cambios; GPS/Otro origen; IDs/coordenadas inválidos; error de servicio y respuesta incompleta con aviso, sin inventar itinerarios; conservación del regreso, tarjetas y las cinco URLs de Google Maps; recuperación de la instantánea en otro contexto local; sintaxis y serialización. Los tests existentes cubren omitir, retomar, visitadas, inserción, Waze y Apple Maps.

## Caso real y evaluación exhaustiva

Coordenadas recuperadas de la auditoría, transcritas de las fotos del usuario:

| Punto | Latitud | Longitud |
|---|---:|---:|
| Oficina: salida y regreso, confirmada por el usuario | 18.1167 | -66.1517 |
| Ramón — Guavate, Cayey | 18.135767 | -66.100621 |
| Feila — Doña Elena, Comerío | 18.261543 | -66.22252 |
| Leila — Los Robles, Aibonito | 18.122996 | -66.232047 |
| Arnaldo — Sabanera, Cidra | 18.189022 | -66.115197 |

Los índices de la fixture son 0=Oficina, 1=Ramón, 2=Feila, 3=Leila, 4=Arnaldo. Se suman tiempos y distancias dirigidos para `[0,...permutación,0]` de las 24 permutaciones. Son costos de carretera OSRM sin tráfico, no distancia geográfica.

| Circuito desde/hasta oficina | Distancia | Tiempo | Regreso |
|---|---:|---:|---:|
| Aibonito → Comerío → Guavate → Cidra | 115.4801 km | 8914.8 s | 16.1381 km |
| Aibonito → Comerío → Cidra → Guavate | 108.4750 km | 8040.4 s | 10.3747 km |
| Menor tiempo entre los 24: Guavate → Cidra → Comerío → Aibonito | 103.3972 km | 8020.6 s | 16.3624 km |

Diferencia observado frente a menor tiempo de esta matriz: 12.0829 km y 894.2 s. Estos resultados **no cambian por canonizar la solicitud**: el parche no sustituye VROOM por OSRM ni usa esta fixture en producción. El ahorro potencial sigue pendiente de contrastarse contra la matriz real del proveedor actual.

El cálculo exhaustivo es conveniente para cuatro paradas si se dispone de una matriz vial compatible. El backend actual devuelve una ruta y un resumen, no una matriz completa. No se añadió un cálculo exhaustivo de producción: requeriría obtener esos costos y evaluar impacto de llamadas/cuotas. Tampoco se introdujo una heurística geográfica como sustituto. Esta evaluación se limita a recomendar el cálculo exacto con una matriz vial, no a implementarlo sin evidencia adicional.

## Riesgos, validación pendiente y publicación

- Al mantener fijos los IDs de entrada, pueden cambiar desempates del proveedor frente a resultados antiguos. No hay garantía de mejora de costo hasta comparar con ORS real.
- Un cambio únicamente del orden ya no invalida; cambios de ID, coordenadas, extremos o pendientes siguen alterando la solicitud y se rechazan si ocurren en vuelo.
- La oficina y la instantánea siguen guardadas por navegador/dispositivo. No se sincronizan ni sobrescriben sus configuraciones.
- Un fallo conserva el itinerario anterior y muestra aviso, como antes; no representa una nueva optimización validada. No se añadió fallback.
- Las métricas siguen sin mostrarse en pantalla: no se cambió el diseño ni se amplió este parche con mejoras de presentación.
- Las coordenadas proceden de fotografías; se conserva la limitación de nitidez y el ajuste OSRM de Feila, aproximadamente 72 m, documentados antes.
- No hubo pruebas físicas en Safari de iPhone/iPad. Dos contextos VM y scripts analizados **no equivalen** a probar esos dispositivos.

**Listo para revisión técnica del usuario del defecto de consistencia; no listo para afirmar que el incidente está resuelto ni para publicar.** Para la validación funcional: misma oficina, coordenadas, IDs, pendientes y modo Circular en ambos equipos; guardar requests/responses y secuencias; repetir sin cambios; comparar costos del circuito completo en el mismo proveedor. Probar fallos de servicio, progreso y control de Ruta Abierta antes de aprobar cualquier publicación.

No se fusionó a main, no se desplegó y no se modificaron datos, credenciales o servicios. La autorización de esta rama no se considera autorización de publicación.
