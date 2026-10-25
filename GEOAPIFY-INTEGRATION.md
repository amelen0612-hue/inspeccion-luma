# Geoapify — Worker temporal

Worker exclusivo: `sistema-campo-anadir-prueba`.
Rama: `work/anadir-parada-geoapify-fix-20261024`.
Producción y `main` no se modifican.

## Conexión activa

- `GEOAPIFY_ENABLED=true`.
- `SUPABASE_URL` y la clave publicable del mismo proyecto que usa el frontend están configuradas en el Worker.
- `PLACES_RATE_LIMITER`: namespace exclusivo `2026102501`, 30 solicitudes por 60 segundos por usuario autenticado.
- `GEOAPIFY_API_KEY` se convirtió de Plain Text a Secret sin imprimir, guardar en disco ni publicar su valor. Esta conversión protege la configuración vigente; no rota la clave ni elimina versiones históricas.
- El adaptador utiliza la sesión actual del cliente Supabase; envía `Authorization: Bearer …` al endpoint del mismo origen. Ante 401 intenta una renovación una sola vez.
- El Worker valida el token mediante `/auth/v1/user` antes de consumir Geoapify. No acepta sesiones ficticias ni claves publicables como identidad de usuario.
- Cuando Geoapify está activo, `?verify=buttons` también utiliza autenticación real. No se debe usar para saltar el inicio de sesión.

## Aislamiento conservado

Solo Auth puede contactar Supabase. Tablas, RPC, archivos, canales y otros datos remotos permanecen bloqueados por el proxy existente. ORS sigue usando exclusivamente el optimizador local. Las paradas y visitas de esta prueba permanecen en el almacenamiento local de este origen.

## Sustituir la clave sin compartirla en chat

1. En el proyecto Geoapify existente, crear una nueva API key sin cambiar de plan.
2. En Cloudflare, abrir Workers & Pages → `sistema-campo-anadir-prueba` → Settings → Variables and Secrets.
3. Editar `GEOAPIFY_API_KEY`, elegir **Secret**, pegar allí la nueva clave y guardar/desplegar.
4. Comprobar una búsqueda iniciando sesión en la vista temporal.
5. Revocar la clave anterior en Geoapify. No compartir ninguna de las dos en chats, capturas, archivos o GitHub.

`preview/wrangler.jsonc` contiene solo valores públicos y preserva variables existentes. La clave Geoapify debe mantenerse siempre como Secret.

## Construcción y comprobación de la conexión

```sh
node preview/construir-worker-geoapify-temporal.mjs
node --test tests/geoapify-session.test.mjs
```

Pruebas específicas de transporte de sesión, renovación de token y conservación del aislamiento. No se repite la batería de lugares ficticios.

## Verificación real completada

En la vista temporal, con una sesión real iniciada por el usuario, se buscó **Walmart Cayey** desde «+ Añadir parada». El endpoint autenticado devolvió **Walmart Supercenter**, dirección en Cayey, PR 00737, coordenadas **18.122479, -66.133770**, fuente **Geoapify · OpenStreetMap**. Se abrió la confirmación del resultado; no se añadió una parada ni se abrió navegación. Una búsqueda real, sin guardar tokens o claves en registros, archivos o GitHub.

Versión verificada: `105925ba-1d35-4ecf-be11-18b9dc4bc06b` (100 %). Deployment activo: `03964798-a6b5-47fb-aa4b-decd3333aec1`.

Estado de cierre y publicación futura: ver `CONTINUAR-SISTEMA-DE-CAMPO.md`.
