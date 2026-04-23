const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'bbruno_secret_key_2024_safe';
const PUBLIC_TABLES = ['vehicles', 'branches', 'leads', 'maintenance'];

const securityHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Empresa-Id',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; object-src 'none';"
};

async function logAction(user, action, table, targetId, details = {}, targetName = null) {
  try {
    await supabase.from('audit_logs').insert([{
      user_id: user.id, username: user.username, empresa_id: user.empresa_id,
      action, target_table: table, target_id: String(targetId),
      target_name: targetName || (details?.patent || details?.nombre || null),
      details, created_at: new Date().toISOString()
    }]);
  } catch (err) { console.error('[Audit Error]:', err.message); }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: securityHeaders };

  const path = event.path.replace(/\.netlify\/functions\/api\/?/, '').replace(/^\/api\//, '');
  const authHeader = event.headers.authorization;
  let user = null;

  if (authHeader) {
    try {
      user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch (err) {
      if (!PUBLIC_TABLES.some(t => path.includes(t))) {
        return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Sesión inválida' }) };
      }
    }
  }

  // Role helpers
  const isSuperAdmin = (u) => u && (u.role === 'superadmin' || u.role === 'superadministrador');
  const isAdmin = (u) => u && (isSuperAdmin(u) || u.role === 'admin' || u.role === 'administrador');

  try {
    // ── AUTH: LOGIN ──
    if (path === 'auth/login' && event.httpMethod === 'POST') {
      const { username, password, hostname } = JSON.parse(event.body);
      let empresaId = 1; // Default
      
      if (hostname && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
        const cleanHost = hostname.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
        
        // Búsqueda flexible de empresa por dominio
        const { data: emps } = await supabase.from('empresas').select('id, dominio');
        const match = emps?.find(e => e.dominio?.toLowerCase().includes(cleanHost) || cleanHost.includes(e.dominio?.toLowerCase()));
        if (match) empresaId = match.id;
      }

      const { data: empresa } = await supabase.from('empresas').select('*').eq('id', empresaId).single();
      if (!empresa) return { statusCode: 404, headers: securityHeaders, body: JSON.stringify({ error: 'Empresa no encontrada' }) };

      // 1. Intentar buscar el usuario en la empresa actual
      let { data: dbUser } = await supabase.from('admin_users')
        .select('*')
        .eq('username', username)
        .eq('empresa_id', empresa.id)
        .eq('is_active', true)
        .maybeSingle();

      // 2. Si no existe en esta empresa, lo buscamos globalmente SOLO si es Superadmin
      if (!dbUser) {
        const { data: globalUser } = await supabase.from('admin_users')
          .select('*')
          .eq('username', username)
          .eq('is_active', true)
          .maybeSingle();
        
        if (globalUser && (globalUser.role === 'superadmin' || globalUser.role === 'superadministrador')) {
          dbUser = globalUser;
          console.log('[LOGIN] Superadmin universal detectado:', username);
        }
      }

      if (!dbUser) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Credenciales inválidas' }) };

      const valid = dbUser.password_hash.startsWith('$2') ? await bcrypt.compare(password, dbUser.password_hash) : (password === dbUser.password_hash);
      if (!valid) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Credenciales inválidas' }) };

      const token = jwt.sign({ 
        id: dbUser.id, 
        username: dbUser.username, 
        role: dbUser.role, 
        empresa_id: empresa.id // Usamos el ID de la empresa del DOMINIO, no el del usuario
      }, JWT_SECRET, { expiresIn: '8h' });

      return { 
        statusCode: 200, 
        headers: securityHeaders, 
        body: JSON.stringify({ 
          token, 
          user: { id: dbUser.id, username: dbUser.username, role: dbUser.role, full_name: dbUser.full_name }, 
          empresa: { id: empresa.id, nombre: empresa.nombre } 
        }) 
      };
    }

    // ── EMPRESAS / USERS (ADMIN) ──
    if (path.startsWith('admin/')) {
      if (!isSuperAdmin(user) && !isAdmin(user)) {
        return { statusCode: 403, headers: securityHeaders, body: JSON.stringify({ error: 'No permitido' }) };
      }
      
      const subPath = path.replace('admin/', '');
      let [table, id] = subPath.split('/');

      // Mapeo de nombres de tabla
      if (table === 'users') table = 'admin_users';

      // GET LIST
      if (event.httpMethod === 'GET') {
        let q = supabase.from(table).select('*');
        if (table === 'admin_users') {
          let targetEmpresa = user.empresa_id;
          if (isSuperAdmin(user) && event.headers['x-empresa-id']) targetEmpresa = Number(event.headers['x-empresa-id']);
          q = q.eq('empresa_id', targetEmpresa);
        }
        const { data, error } = await q.order(table === 'empresas' ? 'nombre' : 'username');
        if (error) throw error;
        return { statusCode: 200, headers: securityHeaders, body: JSON.stringify(data) };
      }

      // POST / PATCH
      const body = event.body ? JSON.parse(event.body) : {};
      if (event.httpMethod === 'POST') {
        if (table === 'admin_users' && body.password) {
          body.password_hash = await bcrypt.hash(body.password, 10);
          delete body.password;
          if (isSuperAdmin(user) && event.headers['x-empresa-id']) body.empresa_id = Number(event.headers['x-empresa-id']);
          else body.empresa_id = user.empresa_id;
        }
        const { data, error } = await supabase.from(table).insert([body]).select();
        if (error) throw error;
        return { statusCode: 201, headers: securityHeaders, body: JSON.stringify(data[0]) };
      }
      
      if (event.httpMethod === 'PATCH' && id) {
        if (table === 'admin_users' && body.password) {
          body.password_hash = await bcrypt.hash(body.password, 10);
          delete body.password;
        }
        const { data, error } = await supabase.from(table).update(body).eq('id', id).select();
        if (error) throw error;
        return { statusCode: 200, headers: securityHeaders, body: JSON.stringify(data[0]) };
      }
    }

    // ── TABLES (GENERAL) ──
    if (path.startsWith('tables/')) {
      const subPath = path.replace('tables/', '');
      const [table, id] = subPath.split('/');
      let empresaId = user?.empresa_id || 1;
      if (isSuperAdmin(user) && event.headers['x-empresa-id']) empresaId = Number(event.headers['x-empresa-id']);

      if (event.httpMethod === 'GET') {
        if (table === 'audit_logs') {
          if (!user) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Auth requerida' }) };
          const { data, error } = await supabase.from('audit_logs').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(100);
          if (error) throw error;
          return { statusCode: 200, headers: securityHeaders, body: JSON.stringify(data) };
        }
        
        const { data, error } = await supabase.from(table).select('*').eq('empresa_id', empresaId).order(table === 'branches' ? 'id' : 'created_at', { ascending: false });
        if (error) throw error;
        return { statusCode: 200, headers: securityHeaders, body: JSON.stringify(data) };
      }

      if (!user) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Auth requerida' }) };

      if (event.httpMethod === 'POST') {
        const payload = { ...JSON.parse(event.body), empresa_id: empresaId };
        const { data, error } = await supabase.from(table).insert([payload]).select();
        if (error) throw error;
        await logAction(user, 'CREATE', table, data[0].id, payload);
        return { statusCode: 201, headers: securityHeaders, body: JSON.stringify(data[0]) };
      }

      if (event.httpMethod === 'PATCH' && id) {
        const payload = JSON.parse(event.body);
        const { data, error } = await supabase.from(table).update(payload).eq('id', id).eq('empresa_id', empresaId).select();
        if (error) throw error;
        await logAction(user, 'UPDATE', table, id, payload);
        return { statusCode: 200, headers: securityHeaders, body: JSON.stringify(data[0]) };
      }

      if (event.httpMethod === 'DELETE' && id) {
        const { error } = await supabase.from(table).delete().eq('id', id).eq('empresa_id', empresaId);
        if (error) throw error;
        await logAction(user, 'DELETE', table, id);
        return { statusCode: 200, headers: securityHeaders, body: JSON.stringify({ success: true }) };
      }
    }

    return { statusCode: 404, headers: securityHeaders, body: JSON.stringify({ error: 'Ruta no encontrada' }) };
  } catch (err) {
    return { statusCode: 500, headers: securityHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
