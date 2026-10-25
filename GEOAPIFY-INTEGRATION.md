# Preparación de Geoapify — Sistema de Campo

Estado: código local, no publicado y sin llamadas reales.

## Integración prevista

- El navegador consulta `GET /api/places/search?q=...` con la sesión Supabase existente.
- El Worker valida la sesión antes de aceptar la búsqueda.
- La clave `GEOAPIFY_API_KEY` existe únicamente como secret del Worker temporal.
- El Worker fuerza `countrycode:pr`, español, máximo de 8 resultados y valida además las coordenadas devueltas.
- El binding opcional `PLACES_RATE_LIMITER` corta solicitudes antes de contactar al proveedor.
- El frontend recibe el mismo contrato que utiliza el buscador ficticio, por lo que `Ir ahora` y `Añadir a pendientes` no cambian.

## Límites propuestos para la prueba temporal

- Búsqueda explícita mediante botón; no consultar en cada pulsación.
- Mínimo 3 y máximo 120 caracteres.
- Máximo 8 resultados.
- 30 búsquedas por minuto por usuario autenticado mediante Rate Limiting binding.
- Caché de proveedor de 5 minutos para búsquedas repetidas.
- El tablero de Geoapify conserva el límite diario exterior del plan contratado.

## Activación pendiente de autorización

1. Crear una cuenta Free y un proyecto en Geoapify.
2. Crear la clave del proyecto sin activar un plan de pago.
3. Guardarla como secret `GEOAPIFY_API_KEY` solo en el Worker temporal.
4. Añadir el Rate Limiting binding únicamente al Worker temporal.
5. Publicar una nueva versión del Worker temporal.
6. Hacer una prueba acotada con hasta cinco búsquedas reales y revisar consumo.

No se modifica `main`, producción, ORS, Supabase, rutas ni datos reales.

## Conexión mínima con el Worker temporal existente

El código completo del Worker temporal de Claude no forma parte de este repositorio. No debe reconstruirse. La vista temporal ya expone el punto de extensión `window.campoBuscarLugares`, que actualmente devuelve los ocho lugares ficticios.

Cuando ese código esté disponible, la integración se limita a tres cambios controlados:

1. Importar `handleGeoapifySearch` y dirigir únicamente `GET /api/places/search` hacia ese handler.
2. Instalar `installGeoapifyPlaceSearch()` en la página principal, obteniendo el `access_token` de la sesión Supabase existente.
3. Sustituir exclusivamente la función ficticia asignada a `window.campoBuscarLugares`; conservar sin cambios el modal, la confirmación, `Ir ahora`, `Añadir a pendientes` y la actualización de la ruta.

Contrato conservado para cada resultado:

```js
{
  provider: 'geoapify',
  providerId: '...',
  nombre: '...',
  direccion: '...',
  lat: 18.4,
  lng: -66.07,
  tipo: '...',
  fuente: 'Geoapify · OpenStreetMap'
}
```

La ruta del endpoint debe evaluarse antes de servir el HTML general del Worker. Ninguna búsqueda debe ejecutarse al cargar la página: solamente después de una acción explícita del usuario.

## Correcciones pendientes de Ruta del Día

Estas correcciones están identificadas, pero no implementadas en esta preparación:

### Indicador de próxima parada

- Calcularlo desde la primera parada pendiente del itinerario activo, no desde el índice original previo a reordenamientos.
- Recalcular después de iniciar, visitar, omitir, retomar, añadir una parada y optimizar pendientes.
- Mantener el mismo indicador después de cerrar Edge o regresar desde la aplicación de navegación.

### Cambio automático de Visitada a Pendiente

- No convertir una parada visitada a pendiente como efecto secundario de añadir u optimizar otras paradas.
- Preservar `visitado` mediante un identificador estable de la parada, no por posición dentro del arreglo.
- Solo permitir el cambio Visitada → Pendiente mediante la acción explícita de retomar/reabrir la parada.
- Añadir regresiones que mezclen paradas visitadas, omitidas y nuevas antes y después de optimizar pendientes.
