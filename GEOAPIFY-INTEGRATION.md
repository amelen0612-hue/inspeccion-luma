# Sistema de Campo — prueba temporal

## Estado al 24 de octubre de 2026

Base solicitada: `d07577e95dc9927b180af9def047d3e4c0a3064d`.
Se conserva también el avance posterior `a886afb4dab092181124d7043ca608fd910c699f`, encontrado en la rama original.
Rama independiente: `work/anadir-parada-geoapify-fix-20261024`.

Vista: https://sistema-campo-anadir-prueba.amelen0612.workers.dev/?verify=buttons

La versión temporal usa puntos ficticios, almacenamiento local y un optimizador simulado. Los datos remotos de Supabase permanecen bloqueados. `index.html` de producción no se modifica.

## Cambios

- Buscar, confirmar y añadir una parada a pendientes o navegar hacia ella con el flujo existente; también conserva Guardados y Coordenadas.
- El indicador de siguiente parada consulta la misma selección que el botón, omitiendo visitadas y omitidas.
- Volver a iniciar una ruta conserva su destino actual.
- Insertar una parada conserva el destino por identidad, incluso durante el regreso final.
- Recuperar la ruta temporal tras invalidarla conserva puntos, visitas, fotos y nuevas paradas; ya no vuelve a sembrar todos los puntos como pendientes.
- Añadir un punto ya visitado conserva su estado. Deshacer visita continúa siendo una acción explícita.
- Cerrar o reiniciar el buscador invalida respuestas anteriores.
- El generador escapa el HTML incrustado para evitar cierres prematuros de script y la pantalla en blanco.

## Geoapify conectado en código, desactivado en el despliegue

El endpoint `/api/places/search` usa el handler compartido de `worker/geoapify-search.mjs` cuando se habilita explícitamente. No hay llamadas reales al proveedor en esta prueba.

Para activarlo, después de autorización del usuario:

1. Disponer de una cuenta/proyecto y clave Geoapify autorizados; no crear ni contratar servicios automáticamente.
2. Guardar `GEOAPIFY_API_KEY` como secret únicamente del Worker temporal.
3. Configurar `SUPABASE_URL` y `SUPABASE_ANON_KEY` y el binding `PLACES_RATE_LIMITER` (30 solicitudes/60 segundos por usuario).
4. Configurar `GEOAPIFY_ENABLED=true`. `?verify=buttons` utiliza una sesión ficticia sin token y no sustituye una sesión real para Geoapify; las pruebas reales deben usar la sesión existente fuera de ese modo.
5. Realizar hasta cinco consultas reales autorizadas y revisar consumo.

El handler valida sesión contra Supabase Auth, exige límite de solicitudes, fuerza Puerto Rico y español, limita a ocho resultados y maneja fallos de red y JSON inválido. La clave no llega al navegador. No se permite continuar hacia el proveedor sin rate limiter. La búsqueda requiere acción explícita, entre 3 y 120 caracteres.

## Construcción y comprobación

```sh
node preview/construir-worker-geoapify-temporal.mjs
node --test tests/*.test.mjs
```

`preview/wrangler.jsonc` apunta exclusivamente al Worker temporal, sin rutas de producción y con Geoapify desactivado. El módulo generado importa el handler compartido; el despliegue debe incluir ambos módulos o empaquetarlos.

Se verificó en navegador: búsqueda ficticia de farmacia, confirmación, añadir a pendientes, visita completada conservada tras recarga y cambio del control de regreso. Las pruebas automatizadas cubren recuperación, identidad del destino, reanudación, duplicados y errores del proveedor. No se ejecutaron consultas Geoapify ni optimización ORS reales.
