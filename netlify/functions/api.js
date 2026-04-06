/**
 * Netlify Function: Mock API /tables/
 * ===================================
 */

const MOCK_DATA = {
  vehicles: [
    {
      id: 'v1', brand: 'Ford', model: 'Focus', year: 2019, version: 'Titanium', color: 'Gris',
      mileage: 45000, price: 18500000, status: 'disponible', fuel_type: 'nafta',
      transmission: 'automatica', doors: 5, is_featured: true, photos: ['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80']
    },
    {
      id: 'v2', brand: 'Toyota', model: 'Corolla', year: 2021, version: 'SEG', color: 'Blanco',
      mileage: 22000, price: 29000000, status: 'disponible', fuel_type: 'nafta',
      transmission: 'cvt', doors: 4, is_featured: true, photos: ['https://images.unsplash.com/photo-1542362567-b05260b60c44?w=600&q=80']
    },
    {
      id: 'v3', brand: 'Volkswagen', model: 'Amarok', year: 2020, version: 'Highline V6', color: 'Negro',
      mileage: 65000, price: 42000000, status: 'disponible', fuel_type: 'diesel',
      transmission: 'automatica', doors: 4, is_featured: false, photos: ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&q=80']
    }
  ],
  branches: [
    { id: 'branch-1', name: 'Sucursal Central', city: 'Tristán Suárez', address: 'Calle Falsa 123', is_active: true }
  ],
  leads: [],
  maintenance: [
    { 
      id: 'm1', 
      vehicle_id: 'v2', 
      type: 'acondicionamiento', 
      date: new Date().toISOString(), 
      description: 'Pulido y encerado completo de carrocería (Tratamiento Acrílico)',
      mileage_at_service: 22000,
      cost: 85000,
      performed_by: 'Detailing Pro',
      technician: 'Kevs',
      parts_replaced: ['Cera 3M', 'Compuesto Pulidor']
    }
  ],
  admin_users: [
    { id: 'u1', username: 'admin', password_hash: 'admin2024', full_name: 'Admin', role: 'superadmin', is_active: true }
  ]
};

exports.handler = async (event, context) => {
  const { path, httpMethod, body } = event;
  
  // Extraer tabla e ID del path
  // path suele venir como /tables/vehicles o /.netlify/functions/api/vehicles
  const cleanPath = path.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/tables/, '');
  const parts = cleanPath.split('/').filter(p => p);
  const table = parts[0];
  const recordId = parts[1];

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // GET
  if (httpMethod === 'GET') {
    if (recordId && MOCK_DATA[table]) {
      const item = MOCK_DATA[table].find(x => x.id === recordId);
      return { statusCode: 200, headers, body: JSON.stringify(item || {}) };
    }
    const data = MOCK_DATA[table] || [];
    return { statusCode: 200, headers, body: JSON.stringify({ data }) };
  }

  // POST (Nota: En Netlify Functions el estado solo persiste en memoria mientras dura la ejecución Warm-up)
  if (httpMethod === 'POST') {
    const newData = JSON.parse(body || '{}');
    return { statusCode: 201, headers, body: JSON.stringify({ ...newData, id: 'nf-' + Date.now() }) };
  }

  // En Netlify Functions sin base de datos persistente, PUT/DELETE solo responden OK de forma ficticia
  if (httpMethod === 'PUT' || httpMethod === 'DELETE') {
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Endpoint not found' }) };
};
