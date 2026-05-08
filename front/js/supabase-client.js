/**
 * BBruno Automotores - Supabase REST Client (Lightweight)
 * =======================================================
 * Wrapper liviano sobre la REST API de Supabase (PostgREST).
 * No requiere SDK externo — usa fetch nativo.
 */

'use strict';

const SupabaseClient = (() => {
  const config = () => window.APP_CONFIG || {};
  const apiBase = () => config().API_URL;

  function headers(extra = {}) {
    const h = {
      'Content-Type': 'application/json',
      ...extra,
    };
    // Si hay token de admin, lo pasamos
    const token = localStorage.getItem('bbruno_admin_token');
    if (token) h['Authorization'] = `Bearer ${token}`;
    
    // Si hay empresa seleccionada (superadmin), la pasamos
    const override = localStorage.getItem('active_empresa_id');
    if (override) h['X-Empresa-Id'] = override;

    return h;
  }

  function restUrl(table, query = '') {
    // Apuntamos a nuestra propia API que actúa de proxy seguro
    return `${apiBase()}/tables/${table}${query ? '?' + query : ''}`;
  }

  /**
   * SELECT — Leer registros
   * @param {string} table - Nombre de la tabla
   * @param {object} opts - { select, filter, order, limit }
   *   filter: string con formato PostgREST, ej: "status=eq.disponible"
   *   order: string, ej: "created_at.desc"
   */
  async function select(table, opts = {}) {
    const params = new URLSearchParams();
    params.set('select', opts.select || '*');
    if (opts.filter) {
      // Puede ser string "col=eq.val" o array de strings
      const filters = Array.isArray(opts.filter) ? opts.filter : [opts.filter];
      filters.forEach(f => {
        const [col, ...rest] = f.split('=');
        params.set(col, rest.join('='));
      });
    }
    if (opts.order) params.set('order', opts.order);
    if (opts.limit) params.set('limit', String(opts.limit));

    const res = await fetch(restUrl(table, params.toString()), {
      method: 'GET',
      headers: headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error ${res.status} al leer ${table}`);
    }
    return res.json(); // Returns array directly
  }

  /**
   * SELECT by ID (UUID)
   */
  async function selectById(table, id) {
    const params = `id=eq.${id}&limit=1`;
    const res = await fetch(restUrl(table, params), {
      method: 'GET',
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    // Robustez: si es array tomamos el primero, si es objeto lo devolvemos directo
    return Array.isArray(data) ? (data[0] || null) : (data || null);
  }

  /**
   * SELECT where column = value (single record)
   */
  async function selectWhere(table, column, value) {
    const params = `${column}=eq.${encodeURIComponent(value)}&limit=1`;
    const res = await fetch(restUrl(table, params), {
      method: 'GET',
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? (data[0] || null) : (data || null);
  }

  /**
   * INSERT — Crear registro(s)
   */
  async function insert(table, data) {
    const body = Array.isArray(data) ? data : [data];
    const res = await fetch(restUrl(table), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error ${res.status} al insertar en ${table}`);
    }
    const result = await res.json();
    return Array.isArray(data) ? result : result[0];
  }

  /**
   * UPSERT — Crear o actualizar registro
   * @param {string} table - Nombre de la tabla
   * @param {object|array} data - Datos a insertar/actualizar
   * @param {string} onConflict - Columna para detectar conflictos (ej. "patent")
   */
  async function upsert(table, data, onConflict = 'id') {
    const body = Array.isArray(data) ? data : [data];
    const res = await fetch(restUrl(table, `on_conflict=${onConflict}`), {
      method: 'POST',
      headers: headers({ 'Prefer': 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error ${res.status} al realizar upsert en ${table}`);
    }
    const result = await res.json();
    return Array.isArray(data) ? result : result[0];
  }

  /**
   * UPDATE — Actualizar registro por ID (UUID)
   */
  async function update(table, id, data) {
    const params = `id=eq.${id}`;
    const res = await fetch(restUrl(table, params), {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error ${res.status} al actualizar en ${table}`);
    }
    const result = await res.json();
    return result[0] || data;
  }

  /**
   * DELETE — Eliminar registro por ID (UUID)
   */
  async function remove(table, id) {
    const params = `id=eq.${id}`;
    const res = await fetch(restUrl(table, params), {
      method: 'DELETE',
      headers: headers(),
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error ${res.status} al eliminar de ${table}`);
    }
  }

  return { select, selectById, selectWhere, insert, upsert, update, remove };
})();

// Expose globally
window.SupabaseClient = SupabaseClient;
