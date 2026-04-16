/**
 * Netlify Function: API Handler (v4.0 - Supabase Real Backend)
 * ========================================
 * Endpoints:
 *  - GET/POST/PATCH/DELETE  /api/tables/:table[/:id]
 *  - POST                   /api/auth/login
 *  - GET                    /api/auth/verify
 *  - GET/POST/PATCH/DELETE  /api/admin/users[/:id]
 *  - GET                    /api/alarfin-data
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY; // service_role or anon with open RLS

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// ── Supabase REST helper ──────────────────────────────────────────────────────
async function sb(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Supabase error ${res.status}`);
  }
  return data;
}

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// ── Simple token store (stateless JWT-like via signed payload) ────────────────
// For simplicity we use a signed base64 payload. Not cryptographic — RLS handles real security.
function makeToken(user) {
  const payload = { id: user.id, username: user.username, role: user.role, ts: Date.now() };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function parseToken(token) {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
  } catch { return null; }
}

function getTokenFromEvent(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ── Audit: Recording actions ──────────────────────────────────────────────────
async function logAction(payload, action, table, targetId, details = {}, targetName = null) {
  try {
    if (!payload?.username) return;
    
    // Auto-detección de nombre para vehículos e identificación básica
    if (!targetName && table === 'vehicles' && details) {
       targetName = details.patent || (details.brand ? `${details.brand} ${details.model}` : null);
    }

    await sb('audit_logs', {
      method: 'POST',
      body: JSON.stringify({
        user_id: payload.id,
        username: payload.username,
        action: action,
        target_table: table,
        target_id: String(targetId),
        target_name: targetName,
        details: details,
        created_at: new Date().toISOString()
      }),
      prefer: ''
    });
  } catch (err) {
    console.warn('[Audit] Falló el registro:', err.message);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const { httpMethod, path: rawPath, body: rawBody } = event;
  const token = getTokenFromEvent(event);
  const tokenPayload = parseToken(token);

  // CORS preflight
  if (httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Normalise path → strip /api prefix
  let rel = rawPath || '';
  if (rel.startsWith('/.netlify/functions/api')) rel = rel.substring('/.netlify/functions/api'.length);
  else if (rel.startsWith('/api')) rel = rel.substring('/api'.length);
  if (!rel) rel = '/';

  let body = {};
  if (rawBody) {
    try { body = JSON.parse(rawBody); } catch { body = {}; }
  }

  // ── Health ──────────────────────────────────────────────────────────────────
  if (rel === '/' || rel === '') {
    return json(200, { status: 'API Online', version: '4.0.0-supabase' });
  }

  // ── Alarfin proxy ───────────────────────────────────────────────────────────
  if (rel === '/alarfin-data' && httpMethod === 'GET') {
    try {
      const r = await fetch('https://simulador.alarfin.com.ar/datos');
      if (!r.ok) throw new Error('Alarfin not ok');
      const d = await r.json();
      return json(200, d);
    } catch (err) {
      return json(502, { error: 'Error conectando con Alarfin', details: err.message });
    }
  }

  // ── Auth: Login ─────────────────────────────────────────────────────────────
  if (rel === '/auth/login' && httpMethod === 'POST') {
    const { username, password } = body;
    if (!username || !password) return json(400, { error: 'Credenciales requeridas' });

    try {
      const users = await sb(
        `admin_users?username=eq.${encodeURIComponent(username)}&is_active=eq.true&select=*`,
        { method: 'GET', prefer: '' }
      );

      const user = Array.isArray(users) ? users[0] : null;

      // Simple plaintext password check (upgrade to bcrypt if needed)
      if (!user || user.password_hash !== password) {
        return json(401, { error: 'Usuario o contraseña incorrectos' });
      }

      const safeUser = {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        is_active: user.is_active
      };

      const token = makeToken(safeUser);
      return json(200, { user: safeUser, token });
    } catch (err) {
      console.error('[Auth/Login]', err.message);
      return json(500, { error: 'Error en el servidor al autenticar' });
    }
  }

  // ── Auth: Verify ─────────────────────────────────────────────────────────────
  if (rel === '/auth/verify' && httpMethod === 'GET') {
    const token = getTokenFromEvent(event);
    if (!token) return json(401, { error: 'Token requerido' });

    const payload = parseToken(token);
    if (!payload?.id) return json(401, { error: 'Token inválido' });

    try {
      const users = await sb(
        `admin_users?id=eq.${payload.id}&is_active=eq.true&select=id,username,full_name,role,is_active`,
        { method: 'GET', prefer: '' }
      );
      const user = Array.isArray(users) ? users[0] : null;
      if (!user) return json(401, { error: 'Sesión inválida o usuario inactivo' });
      return json(200, user);
    } catch (err) {
      console.error('[Auth/Verify]', err.message);
      return json(500, { error: 'Error verificando sesión' });
    }
  }

  // ── Admin: Users CRUD ────────────────────────────────────────────────────────
  if (rel.startsWith('/admin/users')) {
    // Auth guard — superadmin and administrador can manage users
    const token = getTokenFromEvent(event);
    const payload = parseToken(token);
    const userRole = String(payload?.role || '').toLowerCase();
    if (!payload || (userRole !== 'superadmin' && userRole !== 'administrador')) {
      return json(403, { error: 'Solo administradores pueden gestionar usuarios' });
    }

    const userId = rel.replace('/admin/users', '').replace(/^\//, '') || null;
    const isSuperRequester = userRole === 'superadmin';

    try {
      if (httpMethod === 'GET') {
        let users = await sb(
          'admin_users?select=id,username,full_name,role,is_active,created_at&order=created_at.asc',
          { method: 'GET', prefer: '' }
        );
        
        // Filter out superadmins if requester is not a superadmin
        if (!isSuperRequester) {
          users = users.filter(u => String(u.role).toLowerCase() !== 'superadmin');
        }
        
        return json(200, users);
      }

      if (httpMethod === 'POST') {
        const { username, full_name, role, is_active, password } = body;
        const targetRole = String(role || '').toLowerCase();

        // Restriction: Only superadmins can create admins/superadmins
        if (!isSuperRequester && (targetRole === 'superadmin' || targetRole === 'administrador')) {
           return json(403, { error: 'No tenés permisos para crear usuarios con este rol' });
        }

        if (!username || !password) return json(400, { error: 'username y password son requeridos' });

        const newUser = await sb('admin_users', {
          method: 'POST',
          body: JSON.stringify({
            username,
            full_name: full_name || '',
            role: role || 'vendedor',
            is_active: is_active !== false,
            password_hash: password
          }),
          prefer: 'return=representation'
        });
        return json(201, Array.isArray(newUser) ? newUser[0] : newUser);
      }

      if (httpMethod === 'PATCH' && userId) {
        const targetRole = String(body.role || '').toLowerCase();
        
        // Restriction: Only superadmins can promote to admin/superadmin
        if (!isSuperRequester && (targetRole === 'superadmin' || targetRole === 'administrador')) {
          return json(403, { error: 'No tenés permisos para asignar este rol' });
        }

        const update = {};
        if (body.full_name !== undefined) update.full_name = body.full_name;
        if (body.role !== undefined) update.role = body.role;
        if (body.is_active !== undefined) update.is_active = body.is_active;
        if (body.password) update.password_hash = body.password;

        const updated = await sb(`admin_users?id=eq.${userId}`, {
          method: 'PATCH',
          body: JSON.stringify(update),
          prefer: 'return=representation'
        });
        return json(200, Array.isArray(updated) ? updated[0] : updated);
      }

      if (httpMethod === 'DELETE' && userId) {
        // Validation: Cannot delete a superadmin if not superadmin
        if (!isSuperRequester) {
          const target = await sb(`admin_users?id=eq.${userId}&select=role`, { method: 'GET', prefer: '' });
          if (target && target[0] && String(target[0].role).toLowerCase() === 'superadmin') {
            return json(403, { error: 'No podés eliminar a un Superadmin' });
          }
        }

        await sb(`admin_users?id=eq.${userId}`, { method: 'DELETE', prefer: '' });
        return json(200, { success: true });
      }

      return json(405, { error: 'Método no permitido' });
    } catch (err) {
      console.error('[Admin/Users]', err.message);
      return json(500, { error: err.message });
    }
  }

  // ── Tables CRUD (vehicles, leads, maintenance, branches, audit_logs) ─────────
  const cleanPath = rel.replace(/^\/tables/, '');
  const parts = cleanPath.split('/').filter(Boolean);
  const table = parts[0];
  const recordId = parts[1];
  const isUpsert = rel.includes('/upsert');

  // Allowed tables
  const ALLOWED = ['vehicles', 'leads', 'maintenance', 'branches', 'admin_users', 'audit_logs'];
  if (!table || !ALLOWED.includes(table)) {
    return json(404, { error: 'Tabla no encontrada', path: rel });
  }

  try {
    if (httpMethod === 'GET') {
      let query = table;
      const params = [];

      if (recordId) {
        params.push(`id=eq.${recordId}`);
      }

      // Optional ordering
      if (table === 'vehicles') params.push('order=created_at.desc');
      if (table === 'leads') params.push('order=created_at.desc');
      if (table === 'audit_logs') params.push('order=created_at.desc', 'limit=200');
      if (table === 'branches') params.push('order=name.asc');

      query += params.length ? '?' + params.join('&') : '';

      const data = await sb(query, { method: 'GET', prefer: '' });
      // Supabase returns array; for single record return object
      if (recordId && Array.isArray(data)) {
        return json(200, data[0] || {});
      }
      return json(200, data);
    }

    if (httpMethod === 'POST') {
      if (isUpsert) {
        // Upsert on patent conflict (for Excel import)
        const result = await sb(`${table}?on_conflict=patent`, {
          method: 'POST',
          body: JSON.stringify(body),
          prefer: 'return=representation',
          headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' }
        });
        const finalData = Array.isArray(result) ? result[0] : result;
        await logAction(tokenPayload, 'UPDATE/UPSERT', table, finalData.id || body.patent, body);
        return json(200, finalData);
      }
      const result = await sb(table, {
        method: 'POST',
        body: JSON.stringify(body),
        prefer: 'return=representation'
      });
      const finalData = Array.isArray(result) ? result[0] : result;
      await logAction(tokenPayload, 'CREATE', table, finalData.id, body);
      return json(201, finalData);
    }

    if (httpMethod === 'PATCH' && recordId) {
      const result = await sb(`${table}?id=eq.${recordId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        prefer: 'return=representation'
      });
      const finalData = Array.isArray(result) ? result[0] : result;
      await logAction(tokenPayload, 'UPDATE', table, recordId, body);
      return json(200, finalData);
    }

    if (httpMethod === 'DELETE' && recordId) {
      await sb(`${table}?id=eq.${recordId}`, { method: 'DELETE', prefer: '' });
      await logAction(tokenPayload, 'DELETE', table, recordId);
      return json(200, { success: true });
    }

    return json(405, { error: 'Método no soportado' });

  } catch (err) {
    console.error(`[Tables/${table}]`, err.message);
    return json(500, { error: err.message });
  }
};
