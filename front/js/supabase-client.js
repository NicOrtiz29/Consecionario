/**
 * BBruno Automotores - Supabase REST Client (Lightweight)
 * =======================================================
 * Wrapper liviano sobre la REST API de Supabase (PostgREST).
 * No requiere SDK externo — usa fetch nativo.
 */

'use strict';

const SupabaseClient = (() => {
  const config = () => window.APP_CONFIG || {};
  const apiUrl = () => config().API_URL;

  function headers(extra = {}) {
    const h = {
      'Content-Type': 'application/json',
      ...extra,
    };
    // Si hay una sesión de admin, incluir el token
    try {
      const session = JSON.parse(localStorage.getItem('bbruno_admin_session'));
      if (session?.token) h['Authorization'] = `Bearer ${session.token}`;
    } catch(e) {}
    return h;
  }

  function restUrl(table, id = '', query = '') {
    // LOGIC SHIELD: Ahora todas las peticiones van a nuestra API segura
    let path = `${apiUrl()}/tables/${table}`;
    if (id) path += `/${id}`;
    if (query) path += `?${query}`;
    return path;
  }

  /**
   * SELECT — Leer registros
   */
  async function select(table, opts = {}) {
    const params = new URLSearchParams();
    if (opts.select) params.set('select', opts.select);
    if (opts.filter) {
      const filters = Array.isArray(opts.filter) ? opts.filter : [opts.filter];
      filters.forEach(f => {
        const [col, ...rest] = f.split('=');
        params.set(col, rest.join('='));
      });
    }
    if (opts.order) params.set('order', opts.order);
    if (opts.limit) params.set('limit', String(opts.limit));

    const res = await fetch(restUrl(table, '', params.toString()), {
      method: 'GET',
      headers: headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Error ${res.status} al leer ${table}`);
    }
    return res.json();
  }

  /**
   * SELECT by ID
   */
  async function selectById(table, id) {
    const res = await fetch(restUrl(table, id), {
      method: 'GET',
      headers: headers(),
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Error ${res.status}`);
    }
    return res.json();
  }

  /**
   * SELECT where column = value
   */
  async function selectWhere(table, column, value) {
    const params = `${column}=eq.${encodeURIComponent(value)}&limit=1`;
    const res = await fetch(restUrl(table, '', params), {
      method: 'GET',
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data[0] : (data || null);
  }

  /**
   * INSERT — Crear registro(s)
   */
  async function insert(table, data) {
    const body = data;
    const res = await fetch(restUrl(table), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Error ${res.status} al insertar en ${table}`);
    }
    return res.json();
  }

  /**
   * UPSERT — (Redirigido a UPDATE o INSERT)
   */
  async function upsert(table, data, onConflict = 'id') {
    // Simplificación: Nuestra API actual prefiere UPDATE o INSERT explícito
    // pero si viene con ID, intentamos UPDATE, sino INSERT.
    if (data.id) return update(table, data.id, data);
    return insert(table, data);
  }

  /**
   * UPDATE — Actualizar registro por ID
   */
  async function update(table, id, data) {
    const res = await fetch(restUrl(table, id), {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Error ${res.status} al actualizar en ${table}`);
    }
    return res.json();
  }

  /**
   * DELETE — Eliminar registro por ID
   */
  async function remove(table, id) {
    const res = await fetch(restUrl(table, id), {
      method: 'DELETE',
      headers: headers(),
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Error ${res.status} al eliminar de ${table}`);
    }
  }

  return { select, selectById, selectWhere, insert, upsert, update, remove };
})();

// Expose globally
window.SupabaseClient = SupabaseClient;
