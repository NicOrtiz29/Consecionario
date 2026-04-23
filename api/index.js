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
app.use(express.json({ limit: '5mb' }));

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const PUBLIC_TABLES = ['vehicles', 'branches', 'leads', 'maintenance'];

// ─── MIDDLEWARES ───
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

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

    // 1. Intentar buscar el usuario en la empresa detectada
    let { data: user } = await supabase.from('admin_users')
      .select('*')
      .eq('username', username)
      .eq('empresa_id', empresa.id)
      .eq('is_active', true)
      .maybeSingle();

    // 2. Si no está en esa empresa, buscar globalmente SOLO si es Superadmin
    if (!user) {
      const { data: globalUser } = await supabase.from('admin_users')
        .select('*')
        .eq('username', username)
        .eq('is_active', true)
        .maybeSingle();
      
      if (globalUser && (globalUser.role === 'superadmin' || globalUser.role === 'superadministrador')) {
        user = globalUser;
      }
    }

    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const valid = user.password_hash.startsWith('$2') ? await bcrypt.compare(password, user.password_hash) : (password === user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    // IMPORTANTE: El token se genera con el ID de la empresa del DOMINIO
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      role: user.role, 
      empresa_id: empresa.id 
    }, JWT_SECRET, { expiresIn: '8h' });

    res.json({ 
      token, 
      user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name }, 
      empresa: { id: empresa.id, nombre: empresa.nombre } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── ENDPOINTS ───
app.get('/api/tables/:table', async (req, res) => {
  const { table } = req.params;
  try {
    let empresaId = 1;
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

    // Corrección de ordenamiento: branches no tiene created_at
    let query = supabase.from(table).select('*').eq('empresa_id', empresaId);
    if (table !== 'branches') {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!authHeader && table === 'vehicles') data.forEach(v => delete v.internal_notes);
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
