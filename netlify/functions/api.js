const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'bbruno_secret_key_2024_safe';
const PUBLIC_TABLES = ['vehicles', 'branches', 'leads', 'maintenance'];

// Helper: detectar tenant por hostname
async function detectTenantId(hostname) {
  let empresaId = 1;
  if (hostname && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
    const cleanHost = hostname.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    const { data: emps } = await supabase.from('empresas').select('id, dominio, nombre');
    
    // Búsqueda flexible: que el host contenga el dominio o que el dominio contenga parte del host
    const match = emps?.find(e => {
      if (!e.dominio) return false;
      const dom = e.dominio.toLowerCase();
      const name = (e.nombre || '').toLowerCase();
      return cleanHost.includes(dom) || dom.includes(cleanHost) || cleanHost.includes(name.split(' ')[0]);
    });
    
    if (match) empresaId = match.id;
  }
  return empresaId;
}

const securityHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Empresa-Id',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://simulador.alarfin.com.ar; img-src 'self' data: https://*.supabase.co https://images.weserv.nl https://placehold.co; connect-src 'self' data: https://*.supabase.co https://simulador.alarfin.com.ar;",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
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

      // 1. Buscar todos los usuarios con ese nombre que estén activos
      const { data: users } = await supabase.from('admin_users')
        .select('*')
        .eq('username', username)
        .eq('is_active', true);

      if (!users || users.length === 0) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Credenciales inválidas' }) };

      // 2. Buscar el usuario cuya contraseña coincida
      let foundUser = null;
      for (const u of users) {
        const isValid = u.password_hash.startsWith('$2') 
          ? await bcrypt.compare(password, u.password_hash) 
          : (password === u.password_hash);
        
        if (isValid) {
          if (u.empresa_id === empresa.id) {
            foundUser = u;
            break; 
          }
          if (!foundUser) foundUser = u;
        }
      }

      if (!foundUser) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Credenciales inválidas' }) };

      // 3. Si el usuario pertenece a otra empresa, cambiamos el contexto
      let targetEmpresa = empresa;
      if (foundUser.empresa_id !== empresa.id) {
        const { data: otherEmp } = await supabase.from('empresas').select('*').eq('id', foundUser.empresa_id).single();
        if (otherEmp) targetEmpresa = otherEmp;
      }

      const token = jwt.sign({ 
        id: foundUser.id, 
        username: foundUser.username, 
        role: foundUser.role, 
        empresa_id: targetEmpresa.id 
      }, JWT_SECRET, { expiresIn: '8h' });

      return { 
        statusCode: 200, 
        headers: securityHeaders, 
        body: JSON.stringify({ 
          token, 
          user: { id: foundUser.id, username: foundUser.username, role: foundUser.role, full_name: foundUser.full_name }, 
          empresa: { id: targetEmpresa.id, nombre: targetEmpresa.nombre } 
        }) 
      };
    }

    // ── AUTH: VERIFY ──
    if (path === 'auth/verify' && event.httpMethod === 'GET') {
      if (!user) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Sesión inválida' }) };
      
      const { data: userData, error } = await supabase.from('admin_users').select('*').eq('id', user.id).single();
      if (error || !userData) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Usuario no encontrado' }) };
      
      const { data: empresa } = await supabase.from('empresas').select('*').eq('id', userData.empresa_id).single();
      
      return { 
        statusCode: 200, 
        headers: securityHeaders, 
        body: JSON.stringify({
          id: userData.id,
          username: userData.username,
          role: userData.role,
          full_name: userData.full_name,
          empresa_id: userData.empresa_id,
          empresa: empresa ? { id: empresa.id, nombre: empresa.nombre } : null
        }) 
      };
    }

    // ── ADMIN CONFIG (Update branding) ──
    if (path === 'admin/config' && event.httpMethod === 'POST') {
      if (!user) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Auth requerida' }) };
      let empresaId = user.empresa_id;
      if (isSuperAdmin(user) && event.headers['x-empresa-id']) empresaId = Number(event.headers['x-empresa-id']);
      
      const body = JSON.parse(event.body);
      
      // Aseguramos que guarde en 'empresas' y no intente buscar una tabla 'config'
      const { data, error } = await supabase.from('empresas').update(body).eq('id', empresaId).select();
      if (error) throw error;
      
      await logAction(user, 'UPDATE_CONFIG', 'empresas', empresaId, body);
      return { statusCode: 200, headers: securityHeaders, body: JSON.stringify(data[0]) };
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

    // ── CONFIG (Público - branding de empresa) ──
    if (path === 'config' && event.httpMethod === 'GET') {
      const hostname = event.headers.host || '';
      let empresaId = 1;
      
      if (user) {
        empresaId = user.empresa_id;
        if (isSuperAdmin(user) && event.headers['x-empresa-id']) empresaId = Number(event.headers['x-empresa-id']);
      } else {
        empresaId = await detectTenantId(hostname);
      }
      
      const { data: empresa, error } = await supabase.from('empresas').select('*').eq('id', empresaId).single();
      if (error) throw error;
      return { statusCode: 200, headers: securityHeaders, body: JSON.stringify(empresa) };
    }

    // ── LEADS (Público - envío de consultas) ──
    if (path === 'public/leads' && event.httpMethod === 'POST') {
      const hostname = event.headers.host || '';
      const empresaId = await detectTenantId(hostname);
      const body = JSON.parse(event.body);
      
      const leadData = {
        empresa_id: empresaId,
        nombre: body.nombre || body.name || 'Sin nombre',
        telefono: body.telefono || body.phone || 'Sin teléfono',
        mensaje: body.mensaje || body.message || '',
        email: body.email || '',
        vehicle_id: body.vehicle_id || null,
        source: body.source || 'web_detail',
        status: 'nuevo',
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase.from('leads').insert([leadData]).select();
      if (error) {
        console.error('[Public Lead Error]:', error);
        return { statusCode: 500, headers: securityHeaders, body: JSON.stringify({ error: 'Error guardando consulta' }) };
      }
      
      return { statusCode: 201, headers: securityHeaders, body: JSON.stringify({ success: true, id: data[0].id }) };
    }

    // ── UPLOAD (Subida de imágenes a Supabase Storage) ──
    if (path === 'upload' && event.httpMethod === 'POST') {
      if (!user) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Auth requerida' }) };
      
      try {
        const { base64, fileName, bucket = 'vehicles', contentType = 'image/jpeg' } = JSON.parse(event.body);
        if (!base64) return { statusCode: 400, headers: securityHeaders, body: JSON.stringify({ error: 'Falta base64' }) };
        
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Limpieza agresiva de nombre de archivo
        const cleanName = (fileName || 'image.jpg')
          .toLowerCase()
          .replace(/[^a-z0-9.]/g, '_')
          .replace(/_+/g, '_');
        const safeName = `${Date.now()}-${cleanName}`;
        
        // Limpieza de URL y Llaves
        const rawUrl = process.env.SUPABASE_URL || '';
        const cleanUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
        const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
        const finalKey = serviceKey || anonKey;

        if (!finalKey) {
          return { statusCode: 500, headers: securityHeaders, body: JSON.stringify({ error: 'Faltan llaves de Supabase en Netlify (SERVICE_ROLE_KEY o ANON_KEY)' }) };
        }
        
        const uploadRes = await fetch(
          `${cleanUrl}/storage/v1/object/${bucket}/${safeName}`,
          {
            method: 'POST',
            headers: {
              'apikey': finalKey,
              'Authorization': `Bearer ${finalKey}`,
              'Content-Type': contentType,
              'x-upsert': 'true'
            },
            body: buffer
          }
        );
        
        if (!uploadRes.ok) {
          const errBody = await uploadRes.text();
          console.error('[Upload] Storage error:', uploadRes.status, errBody);
          // Devolvemos el error detallado al cliente para debug
          return { 
            statusCode: uploadRes.status, 
            headers: securityHeaders, 
            body: JSON.stringify({ error: `Error de storage (${uploadRes.status}): ${errBody}` }) 
          };
        }
        
        const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${safeName}`;
        return { statusCode: 200, headers: securityHeaders, body: JSON.stringify({ url: publicUrl }) };
      } catch (err) {
        console.error('[Upload] Catch error:', err);
        return { statusCode: 500, headers: securityHeaders, body: JSON.stringify({ error: err.message }) };
      }
    }

    // ── ALARFIN DATA PROXY ──
    if (path === 'alarfin-data' && event.httpMethod === 'GET') {
      try {
        const domain = event.queryStringParameters?.domain || 'bbruno';
        const response = await fetch('https://simulador.alarfin.com.ar/datos/');
        if (!response.ok) throw new Error('Alarfin API Error');
        const data = await response.json();
        return { statusCode: 200, headers: securityHeaders, body: JSON.stringify(data) };
      } catch (err) {
        console.error('[Alarfin Proxy Error]:', err.message);
        return { statusCode: 500, headers: securityHeaders, body: JSON.stringify({ error: 'Error proxying alarfin' }) };
      }
    }

    // ── TABLES (GENERAL) ──
    if (path.startsWith('tables/')) {
      const subPath = path.replace('tables/', '');
      const [table, id] = subPath.split('/');
      
      // Tenant detection logic (Unificada con login)
      let empresaId = 1;
      const hostname = event.headers.host || '';
      
      if (user) {
        empresaId = user.empresa_id;
        if (isSuperAdmin(user) && event.headers['x-empresa-id']) empresaId = Number(event.headers['x-empresa-id']);
      } else if (hostname && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
        const cleanHost = hostname.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
        const { data: emps } = await supabase.from('empresas').select('id, dominio');
        const match = emps?.find(e => e.dominio?.toLowerCase().includes(cleanHost) || cleanHost.includes(e.dominio?.toLowerCase()));
        if (match) empresaId = match.id;
      }

      if (event.httpMethod === 'GET') {
        if (table === 'audit_logs') {
          if (!user) return { statusCode: 401, headers: securityHeaders, body: JSON.stringify({ error: 'Auth requerida' }) };
          const { data, error } = await supabase.from('audit_logs').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(100);
          if (error) throw error;
          return { statusCode: 200, headers: securityHeaders, body: JSON.stringify(data) };
        }
        
        const qSelect = event.queryStringParameters?.select || '*';
        const qLimit = event.queryStringParameters?.limit ? Number(event.queryStringParameters.limit) : 1000;
        const qId = event.queryStringParameters?.id;
        
        let query = supabase.from(table).select(qSelect).eq('empresa_id', empresaId);
        
        // Soporte básico para filtrado por ID (PostgREST style)
        if (qId && qId.startsWith('eq.')) {
            query = query.eq('id', qId.replace('eq.', ''));
        } else if (id) {
            query = query.eq('id', id);
        }

        if (table === 'branches') query = query.order('id', { ascending: true });
        else query = query.order('created_at', { ascending: false });
        
        const { data, error } = await query.limit(qLimit);
        if (error) throw error;
        
        // Debug headers
        const debugHeaders = { 
            ...securityHeaders, 
            'X-Debug-Empresa-Id': String(empresaId),
            'X-Debug-Hostname': hostname
        };

        // Retornar objeto único si se pidió por ID y hay resultado
        if ((qId || id) && data.length === 1) {
            return { statusCode: 200, headers: debugHeaders, body: JSON.stringify(data[0]) };
        }

        return { statusCode: 200, headers: debugHeaders, body: JSON.stringify(data) };
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
