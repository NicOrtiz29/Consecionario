/**
 * Netlify Function: Mock API /tables/ (v3)
 * ========================================
 */

const MOCK_DATA = {
  vehicles: [
    {
      id: 'v1', brand: 'Ford', model: 'Focus', year: 2019, version: 'Titanium', color: 'Gris',
      mileage: 45000, price: 18500000, status: 'disponible', fuel_type: 'nafta',
      transmission: 'automatica', doors: 5, is_featured: true, 
      photos: [
        'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80',
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80',
        'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&q=80',
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80',
        'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80',
        'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=800&q=80',
        'https://images.unsplash.com/photo-1469285994282-454ceb49e63c?w=800&q=80',
        'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80'
      ]
    },
    {
      id: 'v2', brand: 'Toyota', model: 'Corolla', year: 2021, version: 'SEG', color: 'Blanco',
      mileage: 22000, price: 29000000, status: 'disponible', fuel_type: 'nafta',
      transmission: 'cvt', doors: 4, is_featured: true, 
      photos: [
        'https://images.unsplash.com/photo-1542362567-b05260b60c44?w=800&q=80',
        'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&q=80',
        'https://images.unsplash.com/photo-1590362891175-30693a105021?w=800&q=80',
        'https://images.unsplash.com/photo-1619682817481-e994891cd1f5?w=800&q=80',
        'https://images.unsplash.com/photo-1620216447814-1a22123f1a07?w=800&q=80',
        'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&q=80',
        'https://images.unsplash.com/photo-1624021289123-5e917d52def7?w=800&q=80',
        'https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=800&q=80'
      ]
    },
    {
      id: 'v3', brand: 'Volkswagen', model: 'Amarok', year: 2020, version: 'Highline V6', color: 'Negro',
      mileage: 65000, price: 42000000, status: 'disponible', fuel_type: 'diesel',
      transmission: 'automatica', doors: 4, is_featured: false, 
      photos: [
        'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80',
        'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&q=80',
        'https://images.unsplash.com/photo-1525609004556-c46c7d6cf048?w=800&q=80',
        'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80',
        'https://images.unsplash.com/photo-1494905998402-395d579af36f?w=800&q=80',
        'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&q=80',
        'https://images.unsplash.com/photo-1571434199516-7fc43a3d58d8?w=800&q=80',
        'https://images.unsplash.com/photo-1541443131876-44b03de101c5?w=800&q=80'
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
  const cleanPath = path.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/tables/, '');
  const parts = cleanPath.split('/').filter(p => p);
  const table = parts[0];
  const recordId = parts[1];

  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (httpMethod === 'GET') {
    if (recordId && MOCK_DATA[table]) {
      const item = MOCK_DATA[table].find(x => x.id === recordId);
      return { statusCode: 200, headers, body: JSON.stringify(item || {}) };
    }
    const data = MOCK_DATA[table] || [];
    return { statusCode: 200, headers, body: JSON.stringify({ data }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };
};
