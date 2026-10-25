const PLACE_SEARCH_ERRORS = {
  UNAUTHORIZED: 'Vuelve a iniciar sesión para buscar lugares.',
  SEARCH_NOT_CONFIGURED: 'Falta configurar la clave Geoapify en esta prueba.',
  RATE_LIMIT_NOT_CONFIGURED: 'Falta configurar el límite de búsquedas de esta prueba.',
  RATE_LIMITED: 'Alcanzaste el límite de búsquedas. Espera un minuto.',
  PROVIDER_RATE_LIMITED: 'Geoapify alcanzó su límite. Intenta más tarde.',
  PROVIDER_ERROR: 'Geoapify no pudo responder. Intenta más tarde.',
  AUTH_TEMPORARILY_UNAVAILABLE: 'No se pudo validar la sesión. Intenta nuevamente.',
  SEARCH_TEMPORARILY_UNAVAILABLE: 'El buscador no está disponible. Intenta nuevamente.',
  INVALID_QUERY: 'Escribe entre 3 y 120 caracteres.',
};
export function installGeoapifyPlaceSearch({ getAccessToken, endpoint = '/api/places/search' }) {
  if (typeof getAccessToken !== 'function') throw new TypeError('getAccessToken is required');
  window.campoBuscarLugares = async function campoBuscarLugares(texto) {
    const send = token => fetch(`${endpoint}?q=${encodeURIComponent(String(texto || '').trim())}`, {
      method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      credentials: 'same-origin', cache: 'no-store',
    });
    let token = await getAccessToken();
    if (!token) throw new Error(PLACE_SEARCH_ERRORS.UNAUTHORIZED);
    let response = await send(token);
    if (response.status === 401) {
      token = await getAccessToken({ refresh: true });
      if (token) response = await send(token);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(PLACE_SEARCH_ERRORS[body.error] || 'No se pudo buscar el lugar.');
      error.status = response.status;
      throw error;
    }
    return Array.isArray(body.results) ? body.results : [];
  };
}
