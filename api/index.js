const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3005;
const JWT_SECRET = process.env.JWT_SECRET || 'bbruno_secret_key_2024_safe';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const PUBLIC_TABLES = ['vehicles', 'branches', 'leads', 'maintenance'];

// ─── MIDDLEWARES ───
async function detectTenant(req, res, next) {
  let empresaId = 1; // Default: BBruno

  // 1. Prioridad: Fuerza bruta por variable de entorno (para testing local)
  if (process.env.FORCE_TENANT_ID) {
    empresaId = Number(process.env.FORCE_TENANT_ID);
  } 
  // 2. Prioridad: Dominio de la solicitud
  else {
    const hostname = req.hostname || req.headers.host || '';
    if (hostname && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
      const cleanHost = hostname.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
      
      try {
        const { data: emps } = await supabase.from('empresas').select('id, dominio, nombre');
        const match = emps?.find(e => {
          if (!e.dominio) return false;
          const dom = e.dominio.toLowerCase();
          const name = (e.nombre || '').toLowerCase();
          return cleanHost.includes(dom) || dom.includes(cleanHost) || cleanHost.includes(name.split(' ')[0]);
        });
        if (match) empresaId = match.id;
      } catch (err) {
        console.error('[Tenant Detection Error]:', err.message);
      }
    }
  }

  req.empresaId = empresaId;
  next();
}

app.use(detectTenant);

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token requerido' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado' });
    req.user = user;
    next();
  });
}

// Auditoría simplificada
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

// ─── AUTH: LOGIN ───
app.post('/api/auth/login', async (req, res) => {
  const { username, password, hostname } = req.body;
  try {
    let empresaId = 1;
    const host = hostname || req.headers.host || '';
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
      const { data: emp } = await supabase.from('empresas').select('id').eq('dominio', host).maybeSingle();
      if (emp) empresaId = emp.id;
    }

    const { data: empresa } = await supabase.from('empresas').select('*').eq('id', empresaId).single();
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    // 1. Buscar todos los usuarios con ese nombre que estén activos
    const { data: users } = await supabase.from('admin_users')
      .select('*')
      .eq('username', username)
      .eq('is_active', true);

    if (!users || users.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });

    // 2. Buscar el usuario cuya contraseña coincida
    let foundUser = null;
    for (const u of users) {
      const isValid = u.password_hash.startsWith('$2') 
        ? await bcrypt.compare(password, u.password_hash) 
        : (password === u.password_hash);
      
      if (isValid) {
        // Priorizar el usuario de la empresa actual si hay varios matches (poco probable)
        if (u.empresa_id === empresa.id) {
          foundUser = u;
          break; 
        }
        if (!foundUser) foundUser = u;
      }
    }

    if (!foundUser) return res.status(401).json({ error: 'Credenciales inválidas' });

    // 3. Si el usuario pertenece a otra empresa, cambiamos el contexto de la sesión a esa empresa
    let targetEmpresa = empresa;
    if (foundUser.empresa_id !== empresa.id) {
      const { data: otherEmp } = await supabase.from('empresas').select('*').eq('id', foundUser.empresa_id).single();
      if (otherEmp) targetEmpresa = otherEmp;
    }

    // IMPORTANTE: El token se genera con el ID de la empresa del USUARIO (o la detectada si coinciden)
    const token = jwt.sign({ 
      id: foundUser.id, 
      username: foundUser.username, 
      role: foundUser.role, 
      empresa_id: targetEmpresa.id 
    }, JWT_SECRET, { expiresIn: '8h' });
 
    res.json({ 
      token, 
      user: { id: foundUser.id, username: foundUser.username, role: foundUser.role, full_name: foundUser.full_name }, 
      empresa: { id: targetEmpresa.id, nombre: targetEmpresa.nombre } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});



app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase.from('admin_users').select('*').eq('id', req.user.id).single();
    if (error || !user) return res.status(401).json({ error: 'Sesión inválida' });
    
    const { data: empresa } = await supabase.from('empresas').select('*').eq('id', user.empresa_id).single();
    
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      empresa_id: user.empresa_id,
      empresa: empresa ? { id: empresa.id, nombre: empresa.nombre } : null
    });
  } catch (err) { res.status(500).json({ error: 'Error de verificación' }); }
});

// ─── ENDPOINTS ───
// Obtener configuración de marca (Público)
app.get('/api/config', async (req, res) => {
  try {
    const { data: empresa, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('id', req.empresaId)
      .single();
    
    if (error) throw error;
    res.json(empresa);
  } catch (err) {
    res.status(500).json({ error: 'Error al cargar configuración' });
  }
});

app.get('/api/tables/:table', async (req, res) => {
  const { table } = req.params;
  try {
    let empresaId = req.empresaId;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const decoded = jwt.decode(authHeader.split(' ')[1]);
      if (decoded?.empresa_id) empresaId = decoded.empresa_id;
      if (decoded?.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    }

    if (table === 'audit_logs') {
      return authenticateToken(req, res, async () => {
        const { data, error } = await supabase.from('audit_logs').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        res.json(data);
      });
    }

    if (!PUBLIC_TABLES.includes(table)) return res.status(403).json({ error: 'No permitido' });
    
    const qSelect = req.query.select || '*';
    const qLimit = req.query.limit ? Number(req.query.limit) : 1000;
    const qId = req.query.id;

    let query = supabase.from(table).select(qSelect).eq('empresa_id', empresaId);
    
    // Soporte básico para filtrado por ID (PostgREST style)
    if (qId && qId.startsWith('eq.')) {
        query = query.eq('id', qId.replace('eq.', ''));
    } else if (req.params.id) {
        query = query.eq('id', req.params.id);
    }

    if (table === 'branches') query = query.order('id', { ascending: true });
    else query.order('created_at', { ascending: false });

    const { data, error } = await query.limit(qLimit);
    if (error) throw error;
    
    // Ocultar notas internas si no hay sesión
    if (!authHeader && table === 'vehicles') {
      data.forEach(v => delete v.internal_notes);
    }
    
    // Retornar objeto único si se pidió por ID y hay resultado
    if ((qId || req.params.id) && data.length === 1) {
        return res.json(data[0]);
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tables/:table', authenticateToken, async (req, res) => {
  try {
    const { table } = req.params;
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    
    const payload = { ...req.body, empresa_id: empresaId };
    const { data, error } = await supabase.from(table).insert([payload]).select();
    if (error) throw error;
    await logAction(req.user, 'CREATE', table, data[0].id, payload);
    res.status(201).json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint especial para actualizar configuración de marca (Empresa)
app.post('/api/admin/config', authenticateToken, async (req, res) => {
  try {
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    
    const { data, error } = await supabase.from('empresas').update(req.body).eq('id', empresaId).select();
    if (error) {
      console.error('[Admin Config] Error updating supabase:', error);
      throw error;
    }
    await logAction(req.user, 'UPDATE_CONFIG', 'empresas', empresaId, req.body);
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/tables/:table/:id', authenticateToken, async (req, res) => {
  try {
    const { table, id } = req.params;
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    const { data, error } = await supabase.from(table).update(req.body).eq('id', id).eq('empresa_id', empresaId).select();
    if (error) throw error;
    await logAction(req.user, 'UPDATE', table, id, req.body);
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tables/:table/:id', authenticateToken, async (req, res) => {
  try {
    const { table, id } = req.params;
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    const { error } = await supabase.from(table).delete().eq('id', id).eq('empresa_id', empresaId);
    if (error) throw error;
    await logAction(req.user, 'DELETE', table, id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/empresas', authenticateToken, async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'No permitido' });
  const { data, error } = await supabase.from('empresas').select('*').order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/admin/empresas', authenticateToken, async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'No permitido' });
  try {
    const { data, error } = await supabase.from('empresas').insert([req.body]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/empresas/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'No permitido' });
  try {
    const { data, error } = await supabase.from('empresas').update(req.body).eq('id', req.params.id).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Usuarios (Admin/Superadmin)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') return res.status(403).json({ error: 'No permitido' });
  let empresaId = req.user.empresa_id;
  if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
  
  const { data, error } = await supabase.from('admin_users').select('*').eq('empresa_id', empresaId).order('username');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/admin/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') return res.status(403).json({ error: 'No permitido' });
  try {
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    
    const payload = { ...req.body, empresa_id: empresaId };
    if (payload.password) {
       payload.password_hash = await bcrypt.hash(payload.password, 10);
       delete payload.password;
    }
    const { data, error } = await supabase.from('admin_users').insert([payload]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') return res.status(403).json({ error: 'No permitido' });
  try {
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    
    const payload = { ...req.body };
    if (payload.password) {
       payload.password_hash = await bcrypt.hash(payload.password, 10);
       delete payload.password;
    }
    const { data, error } = await supabase.from('admin_users').update(payload).eq('id', req.params.id).eq('empresa_id', empresaId).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── UPLOAD: Subida de imágenes a Supabase Storage ───
app.post('/api/upload', authenticateToken, async (req, res) => {
  try {
    const { base64, fileName, bucket = 'vehicles', contentType = 'image/jpeg' } = req.body;
    
    if (!base64) {
      return res.status(400).json({ error: 'Falta el campo base64 con la imagen' });
    }

    // Extraer los datos binarios del base64 (quitar prefijo data:image/...;base64,)
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const buffer = Buffer.from(base64Data, 'base64');
    
    const safeName = `${Date.now()}-${(fileName || 'image.jpg').replace(/\s+/g, '_')}`;

    // Subir a Supabase Storage usando la service_role_key
    const uploadRes = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${safeName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': contentType,
          'x-upsert': 'true'
        },
        body: buffer
      }
    );

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      console.error('[Upload] Supabase Storage error:', uploadRes.status, errBody);
      throw new Error(`Error de storage: ${uploadRes.status}`);
    }

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${safeName}`;
    
    console.log('[Upload] Imagen subida:', publicUrl);
    res.json({ url: publicUrl });
  } catch (err) {
    console.error('[Upload] Error:', err.message);
    res.status(500).json({ error: 'No se pudo subir la imagen: ' + err.message });
  }
});

// ─── CONFIG: Branding público de la empresa ───
app.get('/api/config', async (req, res) => {
  try {
    const { data: empresa, error } = await supabase.from('empresas').select('*').eq('id', req.empresaId).single();
    if (error) throw error;
    res.json(empresa);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ADMIN CONFIG: Actualizar branding ───
app.post('/api/admin/config', authenticateToken, async (req, res) => {
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') return res.status(403).json({ error: 'No permitido' });
  try {
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    
    const { data, error } = await supabase.from('empresas').update(req.body).eq('id', empresaId).select();
    if (error) throw error;
    
    await logAction(req.user, 'UPDATE_CONFIG', 'empresas', empresaId, req.body);
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/alarfin-data', async (req, res) => {
  try {
    const response = await fetch('https://simulador.alarfin.com.ar/datos/');
    const data = await response.json();
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Error proxying alarfin' }); }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[SERVER] API lista en puerto ${port}`);
});
