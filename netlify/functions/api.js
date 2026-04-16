/**
 * Netlify Function: API Handler (v3.1)
 * ========================================
 * Supports:
 * - /api/alarfin-data (Proxy for simulator)
 * - /api/tables/* (Mock data for now, port to Supabase later if needed)
 */

const MOCK_DATA = {
  vehicles: [
    {
      id: 'v1', brand: 'Ford', model: 'Focus', year: 2019, version: 'Titanium', color: 'Gris',
      mileage: 45000, price: 18500000, status: 'disponible', fuel_type: 'nafta',
      transmission: 'automatica', doors: 5, is_featured: true, 
      photos: [
        'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80',
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80'
      ]
    },
    {
      id: 'v2', brand: 'Toyota', model: 'Corolla', year: 2021, version: 'SEG', color: 'Blanco',
      mileage: 22000, price: 29000000, status: 'disponible', fuel_type: 'nafta',
      transmission: 'cvt', doors: 4, is_featured: true, 
      photos: [
        'https://images.unsplash.com/photo-1542362567-b05260b60c44?w=800&q=80'
      ]
    }
  ],
  branches: [
    { id: 'branch-1', name: 'Sucursal Central', city: 'Tristán Suárez', address: 'Calle Falsa 123', is_active: true }
  ],
  leads: [],
  maintenance: [],
  admin_users: [
    { id: 'u1', username: 'admin', password_hash: 'admin2024', full_name: 'Admin', role: 'superadmin', is_active: true }
  ]
};

exports.handler = async (event, context) => {
  const { path, httpMethod } = event;
  
  // Normalize path to get the endpoint relative to /api or /tables
  let relativePath = path;
  if (relativePath.startsWith('/.netlify/functions/api')) {
    relativePath = relativePath.substring('/.netlify/functions/api'.length);
  } else if (relativePath.startsWith('/api')) {
    relativePath = relativePath.substring('/api'.length);
  }

  const headers = { 
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json' 
  };

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // 1. Alarfin Proxy endpoint
  if (relativePath === '/alarfin-data' && httpMethod === 'GET') {
    try {
      const response = await fetch('https://simulador.alarfin.com.ar/datos');
      if (!response.ok) throw new Error('Alarfin API response not OK');
      const data = await response.json();
      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify(data) 
      };
    } catch (err) {
      console.error('[API] Error Alarfin proxy:', err.message);
      return { 
        statusCode: 502, 
        headers, 
        body: JSON.stringify({ error: 'Error al conectar con Alarfin', details: err.message }) 
      };
    }
  }

  // 2. Tables logic (Mock)
  const cleanPath = relativePath.replace(/^\/tables/, '');
  const parts = cleanPath.split('/').filter(p => p);
  const table = parts[0];
  const recordId = parts[1];

  if (httpMethod === 'GET') {
    if (recordId && MOCK_DATA[table]) {
      const item = MOCK_DATA[table].find(x => x.id === recordId);
      return { statusCode: 200, headers, body: JSON.stringify(item || {}) };
    }
    if (table && MOCK_DATA[table]) {
      return { statusCode: 200, headers, body: JSON.stringify(MOCK_DATA[table]) };
    }
    
    // Default if no table matched but it's a GET
    if (!table) {
       return { statusCode: 200, headers, body: JSON.stringify({ status: 'API Online', version: '3.1.0' }) };
    }
  }

  // 3. Auth
  if (relativePath === '/auth/login' && httpMethod === 'POST') {
     return { 
       statusCode: 200, 
       headers, 
       body: JSON.stringify({ 
         user: MOCK_DATA.admin_users[0], 
         token: 'mock_token_' + Date.now() 
       }) 
     };
  }

  if (relativePath === '/auth/verify') {
    // For now, return the mock user if any token is present (Mock behavior)
    // In production, this would verify the JWT.
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(MOCK_DATA.admin_users[0])
    };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Endpoint not found', path: relativePath }) };
};
