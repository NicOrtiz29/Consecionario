const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3005;
const JWT_SECRET = process.env.JWT_SECRET || 'bbruno_secret_key_2024_safe';

// ─── CONFIGURACIÓN ───
const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:3005',
  'http://127.0.0.1:8080',
  'https://bbrunoautomotores.netlify.app',
  'https://bbruno-automotores.com',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('CORS: Origen no permitido'), false);
  },
  credentials: true,
}));

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

// ─── AUDITORÍA ───
async function logAction(user, action, table, targetId, details = {}, targetName = null) {
  try {
    // Si no tenemos nombre, intentamos sacarlo de details si es un vehículo
    if (!targetName && table === 'vehicles' && details) {
      targetName = details.patent || (details.brand ? `${details.brand} ${details.model}` : null);
    }

    await supabase.from('audit_logs').insert([{
      user_id: user.id,
      username: user.username,
      action: action, // CREATE, UPDATE, DELETE
      target_table: table,
      target_id: String(targetId),
      target_name: targetName,
      details: details,
      created_at: new Date().toISOString()
    }]);
  } catch (err) {
    console.error('[Audit] Error guardando log:', err.message);
  }
}

// ─── AUTH ───
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .single();

    if (error || !user) return res.status(401).json({ error: 'El usuario o la contraseña ingresados no son correctos' });

    let valid = false;
    if (user.password_hash.startsWith('$2')) {
      valid = await bcrypt.compare(password, user.password_hash);
    } else {
      valid = (password === user.password_hash);
      if (valid) {
        const hashed = await bcrypt.hash(password, 12);
        await supabase.from('admin_users').update({ password_hash: hashed }).eq('id', user.id);
      }
    }

    if (!valid) return res.status(401).json({ error: 'El usuario o la contraseña ingresados no son correctos' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Verificación de token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json(req.user);
});

// ─── ENDPOINTS TABLAS ───

// Listar (Público/Privado)
// Gestión de Usuarios (Admin only)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'administrador') return res.status(403).json({ error: 'No tenés permisos' });
  try {
    const { data, error } = await supabase.from('admin_users').select('id, username, full_name, role, is_active');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[API] Error listing users:', err.message);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});



app.post('/api/admin/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'administrador') return res.status(403).json({ error: 'No tenés permisos' });
  const { username, password, full_name, role, is_active } = req.body;
  try {
    const password_hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase.from('admin_users').insert([{
      username, password_hash, full_name, role, is_active
    }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    console.error('[API] Error creating user:', err.message);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

app.patch('/api/admin/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'administrador') return res.status(403).json({ error: 'No tenés permisos' });
  const { password, ...updateData } = req.body;
  try {
    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 12);
    }
    const { data, error } = await supabase.from('admin_users').update(updateData).eq('id', req.params.id).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    console.error('[API] Error updating user:', err.message);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'administrador') return res.status(403).json({ error: 'No tenés permisos' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
  try {
    const { error } = await supabase.from('admin_users').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[API] Error deleting user:', err.message);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

app.get('/api/tables/:table', async (req, res) => {
  const { table } = req.params;
  
  // Auditoría es solo para administradores
  if (table === 'audit_logs') {
    return authenticateToken(req, res, async () => {
      if (req.user.role !== 'administrador') return res.status(403).json({ error: 'No tenés permisos para ver logs' });
      try {
        const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        res.json(data);
      } catch (err) {
        console.error('[API] Error fetching audit_logs:', err.message || err);
        res.status(500).json({ error: 'Error al obtener logs' });
      }
    });
  }

  if (!PUBLIC_TABLES.includes(table)) return res.status(403).json({ error: 'Tabla no permitida' });

  try {
    let query = supabase.from(table).select('*');
    
    // Sort only for tables that are known to have created_at
    if (['vehicles', 'leads', 'maintenance'].includes(table)) {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    // Ocultar notas si no hay token por seguridad
    const authHeader = req.headers.authorization;
    if (!authHeader && table === 'vehicles') {
      data.forEach(v => delete v.internal_notes);
    }

    res.json(data);
  } catch (err) {
    console.error(`[API] Error GET /api/tables/${table}:`, err.message || err);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// Crear
app.post('/api/tables/:table', authenticateToken, async (req, res) => {
  const { table } = req.params;
  if (req.user.role === 'vendedor' || req.user.role === 'visualizador') {
    return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
  }

  try {
    const { data, error } = await supabase.from(table).insert([req.body]).select();
    if (error) throw error;
    
    // Log the creation
    await logAction(req.user, 'CREATE', table, data[0].id, req.body);
    
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear' });
  }
});

// Editar
app.patch('/api/tables/:table/:id', authenticateToken, async (req, res) => {
  const { table, id } = req.params;

  // El vendedor solo puede editar el estado del auto
  let updateData = req.body;
  if (req.user.role === 'vendedor') {
    if (table === 'vehicles') {
       // Solo permitimos ciertos campos
       const { status, internal_notes } = req.body;
       updateData = {};
       if (status) updateData.status = status;
       if (internal_notes) updateData.internal_notes = internal_notes;
       
       if (Object.keys(updateData).length === 0) {
         return res.status(403).json({ error: 'Como vendedor solo podés editar el estado' });
       }
    } else {
       return res.status(403).json({ error: 'No tenés permisos para editar esta tabla' });
    }
  }

  try {
    const { data, error } = await supabase.from(table).update(updateData).eq('id', id).select();
    if (error) throw error;
    
    // Log the update
    await logAction(req.user, 'UPDATE', table, id, updateData);
    
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// Eliminar
app.delete('/api/tables/:table/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'administrador' && req.user.role !== 'editor') {
    return res.status(403).json({ error: 'No tenés permisos para eliminar' });
  }

  try {
    const { error } = await supabase.from(req.params.table).delete().eq('id', req.params.id);
    if (error) throw error;
    
    // Log the deletion
    await logAction(req.user, 'DELETE', req.params.table, req.params.id);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// Alarfin Proxy
app.get('/api/alarfin-data', async (req, res) => {
  try {
    const response = await fetch('https://simulador.alarfin.com.ar/datos');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error Alarfin' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`API server running on http://localhost:${port}`);
});
