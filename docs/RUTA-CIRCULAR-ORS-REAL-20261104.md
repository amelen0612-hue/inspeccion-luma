# Ruta Circular — comprobación real de ORS y costos del circuito

Continuación sobre `prueba/ruta-circular-consistente-20261104`, base `9b5c6017df3490d258ab9eca23c360b23cc5c9e4`. Fecha: 4 de noviembre de 2026.

## Dictamen

**El recorrido largo no se reprodujo en esta investigación.** El servicio desplegado devolvió en las 24 permutaciones de entrada y tres repeticiones idénticas el circuito **Oficina → Leila/Aibonito → Feila/Comerío → Arnaldo/Cidra → Ramón/Guavate → Oficina**, con **107500.2 m y 8274.8 s** según ORS Directions.

Además, se midieron los 20 tramos dirigidos entre los cinco puntos con la función existente y se enumeraron los 24 circuitos completos. El recorrido devuelto tiene el menor tiempo de esa matriz medida de **ORS Directions**, incluido el regreso. Su suma coincide exactamente con el resumen de la respuesta circular completa. Por tanto, para este caso y esta medición, no se encontró una mala selección del circuito actual.

**La causa del resultado histórico reportado y de la diferencia entre dispositivos sigue sin demostrarse.** Las solicitudes y respuestas históricas completas no están disponibles. No se atribuye el incidente a ORS, al cambio de octubre o a datos distintos sin esa evidencia. Tampoco se descarta el reporte del usuario por no reproducirse ahora.

No apareció otro defecto comprobado del código de producto que justifique cambiar el algoritmo. **`index.html` no cambia respecto a `9b5c6017…`**: conserva la corrección de consistencia ya preparada. Esta continuación añade evidencia real, pruebas y corrige la transcripción de una coordenada en los tests. No se introdujo otro proveedor ni se desplegó nada.

## 1. Coordenadas verificadas: corrección de evidencia anterior

La auditoría inicial transcribió de una foto la latitud de Ramón como **18.135767**. Una lectura de solo lectura de `ruta_puntos`, localizada ahora por su etiqueta de contador, confirmó **18.136767**. Esta es una corrección de la transcripción de la auditoría; **no se editó el registro del usuario**. Las otras tres coordenadas coinciden con los registros remotos leídos. La oficina es la coordenada de salida/regreso confirmada por el usuario, no un valor leído del almacenamiento de sus dispositivos.

| Índice | Punto | Latitud | Longitud |
|---|---|---:|---:|
| 0 | Oficina Cayey | 18.1167 | -66.1517 |
| 1 | Ramón — Guavate, Cayey | **18.136767** | -66.100621 |
| 2 | Feila — Doña Elena, Comerío | 18.261543 | -66.22252 |
| 3 | Leila — Los Robles, Aibonito | 18.122996 | -66.232047 |
| 4 | Arnaldo — Sabanera, Cidra | 18.189022 | -66.115197 |

Los tests y la nueva fixture usan las coordenadas verificadas. La fixture OSRM anterior se conserva como evidencia histórica de aquella lectura; no se confunde con la nueva.

## 2. Interacción real con ORS

Se consultó el mismo `ors-optimize` desplegado, sin modificar ni reemplazar la función. Continúa ACTIVE, versión 3, bundle `ea20c3c32d245bca4ec18474c42c543794cee779f3323397bb177d1246a254c6`. Su fuente se conservó como snapshot de prueba, no como archivo desplegable.

Se efectuó una llamada circular inicial y luego:

- **24 llamadas reales:** mismo conjunto, IDs, coordenadas y oficina; varía el orden de entrada como podía ocurrir antes del parche de consistencia.
- **Tres llamadas reales repetidas:** payload idéntico en el orden canónico de la rama.
- **20 mediciones reales de tramos dirigidos:** origen/destino entre los cinco puntos, usando exclusivamente la función existente.

Todas las respuestas registradas fueron HTTP 200, `ok:true`, `directions_status:200`; no hubo fallback ni reintentos automáticos por error. Las 27 respuestas del grupo circular tuvieron exactamente los mismos IDs ordenados, coordenadas, distancia y duración. La llamada circular inicial también coincidió.

Las llamadas de diagnóstico consumen el servicio y sus cuotas existentes; no se cambiaron credenciales, servicios, configuración ni patrón de llamadas de la aplicación. No se escribieron itinerarios ni datos de usuarios. No se guardaron claves o tokens en las fixtures.

## 3. Algoritmo, objetivo y selección final

La ruta vigente es:

1. `solicitudORS` prepara pendientes y extremos. En Circular, llegada es salida. La rama normaliza la representación de entrada, sin imponer el orden de visita.
2. `abrirORS` llama `ors-optimize` y valida cobertura, IDs, coordenadas y ambos extremos.
3. El backend elimina de los trabajos los extremos fijos, asigna IDs numéricos a los demás y consulta VROOM/HeiGIT con un vehículo `driving-car`, `start` y `end` iguales, servicio cero.
4. VROOM escoge la secuencia. No se envía una matriz propia ni costos explícitos por kilómetro. La configuración se apoya en el objetivo temporal predeterminado documentado de VROOM; no promete mínimo kilometraje global.
5. Directions recibe esa secuencia completa, incluido regreso. El backend prefiere su resumen cuando responde correctamente. **Directions no vuelve a elegir el orden.**
6. El frontend conserva la secuencia recibida para tarjetas y navegación. No compara candidatos ni elige otra ruta por menor distancia después de VROOM.

Fuente primaria del contrato de VROOM: https://github.com/VROOM-Project/vroom/blob/master/docs/API.md. La versión interna de VROOM y la matriz exacta usada en esa ejecución no están expuestas por la función desplegada. La medición que sigue comprueba el circuito en costos ORS Directions; no se rotula como extracción de la matriz interna de VROOM.

## 4. Cómo se midió la matriz sin cambiar servicios

Se utilizó la misma función existente para cada A→B, con salida A, llegada B y un trabajo de servicio cero en la misma coordenada A. El recorrido solicitado al proveedor contiene A→A→B: el primer tramo no agrega desplazamiento. Esto permite medir el resumen de Directions de A→B sin desplegar una función nueva ni obtener una nueva API key. Son solicitudes de auditoría directas; no se modificó el flujo de Ruta Abierta.

Se guardan los 20 pares, requests, respuestas resumidas y estados. Los tests verifican origen/trabajo coincidentes, destino correcto y `directions_status:200`. Después se enumeran los 24 circuitos `[0,...permutación(1,2,3,4),0]` usando costos dirigidos. No se asumen iguales la ida y la vuelta.

La coincidencia exacta entre la suma de segmentos del circuito elegido y el resumen de su llamada circular completa es un control adicional de compatibilidad. No convierte esta matriz de Directions en la matriz interna de VROOM ni garantiza compatibilidad para cualquier otro caso.

## 5. Resultados dentro de ORS

| Circuito desde/hasta oficina | Distancia ORS | Tiempo ORS | Regreso |
|---|---:|---:|---:|
| Reportado: Aibonito → Comerío → Guavate → Cidra | 118.5923 km | 9077.3 s | 16.1661 km |
| Propuesto por el usuario y devuelto ahora: Aibonito → Comerío → Cidra → Guavate | **107.5002 km** | **8274.8 s** | 9.8307 km |
| Mejor anterior según OSRM: Guavate → Cidra → Comerío → Aibonito | 107.9153 km | 8281.2 s | 16.3814 km |

El propuesto es el menor tiempo entre los 24 circuitos de esta matriz y también la menor suma de sus distancias. Esto último se limita a las distancias de los caminos que Directions eligió; no prueba mínimo de kilómetros entre todos los caminos posibles de la red.

El reportado sería **11.0921 km y 802.5 s —13 min 22.5 s— peor** que el devuelto ahora, con esta medición ORS. Pero no se obtuvo ese orden en ninguna de las llamadas reales realizadas. La alternativa que OSRM prefería queda **6.4 s** por encima en esta medición ORS. Es una diferencia pequeña de tiempo, no una justificación para invertir listas manualmente.

## 6. OSRM anterior frente a OSRM con coordenada corregida

| Circuito | OSRM inicial, latitud transcrita | OSRM con registro verificado |
|---|---|---|
| Reportado | 115.4801 km / 8914.8 s | 115.2627 km / 8883.6 s |
| Propuesto | 108.4750 km / 8040.4 s | 108.2574 km / 8009.2 s |
| Mejor OSRM: Guavate → Cidra → Comerío → Aibonito | 103.3972 km / 8020.6 s | 103.1797 km / 7989.4 s |

Con la coordenada corregida, la brecha reportado–mejor OSRM sigue siendo aproximadamente **12.083 km y 14 min 54 s**. La corrección de transcripción no explica esa brecha.

OSRM y ORS no son la misma matriz. No se puede comparar el kilometraje de una ruta calculada por uno con el mínimo de otro y concluir por ello que VROOM resolvió mal su propio problema. Aquí se conserva la comparación de los mismos órdenes **dentro de cada motor**. El reporte original de una secuencia distinta permanece pendiente de reconstrucción.

## 7. Fallos, alternativas y persistencia

No existe un fallback de optimización local, Haversine, vecino más cercano, OSRM u otro servicio en el producto auditado.

- Si falla VROOM o su respuesta no es utilizable, el backend informa error. No calcula una alternativa local.
- Si VROOM responde pero Directions falla, conserva la misma secuencia de VROOM y usa el resumen de respaldo de VROOM, con `directions_status` indicando el fallo. Es fallback **de métricas**, no un nuevo optimizador.
- Si el frontend recibe error o cobertura inválida, muestra aviso y no crea una secuencia ficticia. Si existía una instantánea anterior, se conserva: verla no significa que la última optimización haya tenido éxito.
- Añadir una parada inserta antes del regreso sin reoptimizar. Optimizar pendientes empieza desde GPS y conserva el final. Estas funciones siguen como antes; no hay prueba de que expliquen el caso histórico.

Estas rutas de fallo se comprobaron ejecutando el snapshot de la función con servicios simulados, sin provocar fallos artificiales en producción. El comportamiento de conservar una ruta antigua y el descarte de métricas siguen siendo limitaciones de diagnóstico, no cambios añadidos en esta etapa.

## 8. Consistencia entre dispositivos

Se comprobó consistencia del servicio para 24 órdenes y tres payloads idénticos. Esto supera la simulación previa, pero **no equivale a probar físicamente Safari en ambos equipos**.

En los logs de la ventana disponible se localizaron ocho POST históricos a `ors-optimize`, todos HTTP 200 y versión 3, incluyendo agentes de iPhone e iPad. Los logs leídos no contienen body, respuesta ordenada ni matriz. Un HTTP 200 no demuestra que ambos dispositivos enviaran la misma oficina, coordenadas, estado o modo, ni que vieran la misma versión de frontend.

El backend no usa el navegador como criterio para ordenar. Oficina e instantánea siguen guardadas por dispositivo/navegador; los puntos se sincronizan. La prueba real deja comprobado que **en este muestreo el mismo problema produjo la misma respuesta**, pero no permite certificar qué entradas tenían los dispositivos durante el incidente.

## 9. Diff y pruebas de esta continuación

**No hay cambio adicional de código de producto.** `index.html` permanece con blob Git `87a105abcb1de9eda663a0271608bc0be22b5871`, igual a `9b5c6017…`. No se alteró Ruta Abierta ni ninguno de los otros módulos.

Cambios de esta etapa:

- `tests/ruta-circular-consistente.test.mjs`: usa la latitud verificada y la nueva fixture OSRM; añade prueba de conservación de instantánea tras error.
- `tests/ors-circuito-real.test.mjs`: siete pruebas sobre evidencia real, los 24 costos, contrato backend y fallos simulados.
- `tests/fixtures/ors-cayey-respuestas-reales.json`: 27 respuestas circulares resumidas, órdenes de entrada y marcas de tiempo.
- `tests/fixtures/ors-cayey-directions-medida.json`: matriz dirigida medida y sus 20 requests/responses.
- `tests/fixtures/ruta-cayey-osrm-verificada.json`: nueva matriz independiente con Ramón verificado.
- `tests/fixtures/ors-optimize-v3.txt`: snapshot de solo lectura del backend desplegado; no es una nueva función a desplegar.
- Este diagnóstico y nota de seguimiento en el informe de consistencia anterior.

```bash
node --test tests/*.test.mjs
```

Resultado: **56 pruebas pasan, 0 fallos y 0 omitidas**, frente a las 48 de la base. Las pruebas de fixtures son offline y no vuelven a gastar cuotas del proveedor. Las llamadas reales fueron una campaña aparte descrita arriba. Las pruebas de error usan simulaciones. No hubo pruebas físicas de Safari iPhone/iPad ni navegación en carretera.

## 10. Estado y evidencia pendiente

La solución actual considera el regreso antes de optimizar, es consistente en las llamadas realizadas y coincide con el mínimo de los 24 circuitos medidos de ORS Directions para las coordenadas verificadas. No se justifica reemplazar ORS, añadir servicios o introducir una búsqueda exhaustiva en producción por este resultado.

**El incidente histórico continúa abierto.** Para determinar su causa hace falta una captura de la solicitud y respuesta de una nueva ocurrencia, antes de cambiar o borrar datos: oficina efectiva, controles Circular/salida, IDs/coordenadas/visitadas, acción usada, hora, secuencia devuelta y secuencia mostrada. También distinguir una inserción o reoptimización posterior y una optimización fallida que conserve una ruta antigua. El código actual no conserva todos esos datos retrospectivamente.

Se mantiene la corrección mínima de consistencia ya preparada. No se hace otra corrección especulativa ni se afirma que los kilómetros del incidente están resueltos. La rama queda lista para revisión de esta evidencia y validación controlada cuando se disponga de un entorno autorizado; no está fusionada ni publicada. Producción, servicios, autenticación, RLS, credenciales y datos permanecen intactos.
