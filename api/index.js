const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3005;

// SECRET SCANNER: Verificando que la clave JWT no sea la por defecto en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[CRITICAL] JWT_SECRET not found in environment variables!');
  process.exit(1);
}
const ACTUAL_SECRET = JWT_SECRET || 'bbruno_temp_secret_2024';

// HEADER FORTRESS: Añadiendo cabeceras de seguridad
app.use(helmet());

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

// TRAFFIC SHIELD: Configuración de Rate Limit para Login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Límite de 5 intentos según habilidad Traffic-Shield
  message: { error: 'Demasiados intentos fallidos. Credenciales bloqueadas temporalmente por seguridad.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// TRAFFIC SHIELD: Rate limit estricto para el formulario público de consultas
const publicLeadsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // Máximo 3 consultas por hora por IP para evitar spam
  message: { error: 'Límite de consultas alcanzado. Por favor, intente más tarde o contáctenos por WhatsApp.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

  jwt.verify(token, ACTUAL_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

// ─── UTILS & VALIDATION ───
// DATA INTEGRITY: Validación de esquema para evitar inyecciones de datos no deseados
const ALLOWED_FIELDS = {
  vehicles: ['brand', 'model', 'year', 'version', 'color', 'mileage', 'price', 'down_payment', 'status', 'fuel_type', 'transmission', 'condition', 'doors', 'engine', 'vin', 'patent', 'description', 'internal_notes', 'is_featured', 'photos', 'features', 'documents', 'branch_id', 'empresa_id'],
  leads: ['name', 'phone', 'email', 'message', 'vehicle_patent', 'status', 'empresa_id', 'source'],
  maintenance: ['vehicle_patent', 'date', 'type', 'description', 'cost', 'parts', 'workshop_name', 'km_at_service', 'empresa_id'],
  branches: ['nombre', 'direccion', 'telefono', 'email', 'map_url', 'empresa_id'],
  admin_users: ['username', 'full_name', 'role', 'is_active', 'empresa_id', 'password_hash']
};

function validatePayload(table, payload) {
  const allowed = ALLOWED_FIELDS[table];
  if (!allowed) return payload; // Si no está en la lista, dejamos pasar (ej. auditoría)
  const filtered = {};
  allowed.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      filtered[field] = payload[field];
    }
  });
  return filtered;
}

// TRAFFIC SHIELD: Manejo genérico de errores para no revelar detalles internos
const handleError = (res, err, defaultMsg = 'Error en el servidor') => {
  console.error('[Error Details]:', err.message || err);
  const status = err.status || 500;
  res.status(status).json({ 
    error: (status === 500) ? defaultMsg : (err.message || defaultMsg) 
  });
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

// ─── AUTH: LOGIN ───
app.post('/api/auth/login', loginLimiter, async (req, res) => {
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
    }, ACTUAL_SECRET, { expiresIn: '8h' });

    res.json({ 
      token, 
      user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name }, 
      empresa: { id: empresa.id, nombre: empresa.nombre } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── PUBLIC ENDPOINTS ───
// LOGIC SHIELD: Endpoint público para recibir consultas de forma segura
app.post('/api/public/leads', publicLeadsLimiter, async (req, res) => {
  try {
    const { name, phone, email, message, vehicle_patent, hostname } = req.body;
    
    // Detectar empresa
    const empresaId = await getEmpresaId(req);

    // DATA INTEGRITY: Validar campos mínimos
    if (!name || (!phone && !email)) {
      return res.status(400).json({ error: 'Nombre y al menos un método de contacto son requeridos.' });
    }

    const payload = validatePayload('leads', {
      name, phone, email, message, vehicle_patent,
      empresa_id: empresaId,
      status: 'nuevo',
      source: 'web_form'
    });

    const { data, error } = await supabase.from('leads').insert([payload]).select();
    if (error) throw error;

    res.status(201).json({ success: true, message: 'Consulta recibida correctamente.' });
  } catch (err) { handleError(res, err, 'Error al procesar su consulta.'); }
});

// ─── ENDPOINTS ───
app.get('/api/tables/:table', async (req, res) => {
  const { table } = req.params;
  try {
    const empresaId = await getEmpresaId(req);

    if (table === 'audit_logs') {
      return authenticateToken(req, res, async () => {
        const { data, error } = await supabase.from('audit_logs').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        res.json(data);
      });
    }

    if (!PUBLIC_TABLES.includes(table)) return res.status(403).json({ error: 'No permitido' });

    const { select = '*', limit, order, ...filters } = req.query;
    let query = supabase.from(table).select(select).eq('empresa_id', empresaId);

    // Aplicar filtros dinámicos (eq)
    Object.entries(filters).forEach(([key, val]) => {
      if (val.startsWith('eq.')) query = query.eq(key, val.split('.')[1]);
    });

    if (limit) query = query.limit(Number(limit));
    if (order) {
      const [col, dir] = order.split('.');
      query = query.order(col, { ascending: dir === 'asc' });
    } else if (table !== 'branches') {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;
    
    // LOGIC SHIELD: Limpiar datos sensibles si no hay sesión
    if (!req.headers.authorization && table === 'vehicles') {
      data.forEach(v => {
        delete v.internal_notes;
        delete v.vin; // El VIN también es sensible para el público
      });
    }
    
    res.json(data);
  } catch (err) { handleError(res, err, 'Error al obtener datos'); }
});

app.get('/api/tables/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  try {
    const empresaId = await getEmpresaId(req);
    if (!PUBLIC_TABLES.includes(table)) return res.status(403).json({ error: 'No permitido' });

    const { data, error } = await supabase.from(table).select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No encontrado' });

    // LOGIC SHIELD: Limpiar datos sensibles
    if (!req.headers.authorization && table === 'vehicles') {
      delete data.internal_notes;
      delete data.vin;
    }

    res.json(data);
  } catch (err) { handleError(res, err, 'Error al obtener el registro'); }
});

app.post('/api/tables/:table', authenticateToken, async (req, res) => {
  try {
    const { table } = req.params;
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    
    // DATA INTEGRITY: Aplicar validación de esquema
    const payload = { ...validatePayload(table, req.body), empresa_id: empresaId };
    
    const { data, error } = await supabase.from(table).insert([payload]).select();
    if (error) throw error;
    await logAction(req.user, 'CREATE', table, data[0].id, payload);
    res.status(201).json(data[0]);
  } catch (err) { handleError(res, err, 'Error al crear el registro'); }
});

app.delete('/api/tables/:table/:id', authenticateToken, async (req, res) => {
  try {
    const { table, id } = req.params;
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);

    const { error } = await supabase.from(table).delete().eq('id', id).eq('empresa_id', empresaId);
    if (error) throw error;

    await logAction(req.user, 'DELETE', table, id, { id });
    res.status(204).send();
  } catch (err) { handleError(res, err, 'Error al eliminar el registro'); }
});

app.patch('/api/tables/:table/:id', authenticateToken, async (req, res) => {
  try {
    const { table, id } = req.params;
    let empresaId = req.user.empresa_id;
    if (req.user.role === 'superadmin' && req.headers['x-empresa-id']) empresaId = Number(req.headers['x-empresa-id']);
    
    // DATA INTEGRITY: Solo actualizar campos permitidos
    const payload = validatePayload(table, req.body);
    
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).eq('empresa_id', empresaId).select();
    if (error) throw error;
    await logAction(req.user, 'UPDATE', table, id, payload);
    res.json(data[0]);
  } catch (err) { handleError(res, err, 'Error al actualizar el registro'); }
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
  
  const { data, error } = await supabase.from('admin_users')
    .select('id, username, full_name, role, empresa_id, created_at')
    .eq('empresa_id', empresaId)
    .order('username');
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
