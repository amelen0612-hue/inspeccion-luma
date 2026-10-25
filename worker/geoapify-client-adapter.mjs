export function installGeoapifyPlaceSearch({ getAccessToken, endpoint = '/api/places/search' }) {
  if (typeof getAccessToken !== 'function') throw new TypeError('getAccessToken is required');

  window.campoBuscarLugares = async function campoBuscarLugares(texto) {
    const token = await getAccessToken();
    if (!token) throw new Error('Sesión no disponible');

    const response = await fetch(`${endpoint}?q=${encodeURIComponent(String(texto || '').trim())}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      credentials: 'same-origin',
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || 'No se pudo buscar el lugar');
      error.status = response.status;
      throw error;
    }
    return Array.isArray(body.results) ? body.results : [];
  };
}
