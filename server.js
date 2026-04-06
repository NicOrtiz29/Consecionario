/**
 * BBruno Automotores - Local Dev Server & Proxy (v3)
 * ================================================
 * CRUD + Enhanced Mock Data (8 Photos)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;

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
  maintenance: [
    { id: 'm1', vehicle_id: 'v2', type: 'acondicionamiento', date: new Date().toISOString(), description: 'Pulido y encerado completo de carrocería (Tratamiento Acrílico)', mileage_at_service: 22000, cost: 85000, performed_by: 'Detailing Pro', technician: 'Kevs' }
  ],
  admin_users: [
    { id: 'u1', username: 'admin', password_hash: 'admin2024', full_name: 'Admin', role: 'superadmin', is_active: true }
  ]
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${pathname}`);

  if (pathname.includes('/tables/')) {
    const parts = pathname.split('/').filter(p => p);
    const tableIndex = parts.indexOf('tables');
    const table = parts[tableIndex + 1];
    const recordId = parts[tableIndex + 2];

    const cleanTable = table ? table.split('?')[0] : '';
    const cleanId = recordId ? recordId.split('?')[0] : null;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (cleanId && MOCK_DATA[cleanTable]) {
        const item = MOCK_DATA[cleanTable].find(x => x.id === cleanId);
        return res.end(JSON.stringify(item || {}));
      }
      const data = MOCK_DATA[cleanTable] || [];
      return res.end(JSON.stringify({ data }));
    }

    // POST / PUT / DELETE (Simplified in-memory as before)
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try { 
          const d = JSON.parse(body); 
          d.id = 'gen-' + Date.now(); 
          if (!MOCK_DATA[cleanTable]) MOCK_DATA[cleanTable] = [];
          MOCK_DATA[cleanTable].push(d);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(d));
        } catch { res.writeHead(400); res.end(); }
      });
      return;
    }
    // ... logic remains same as v2 ...
  }

  // Static files handling
  let safePath = pathname === '/' ? 'index.html' : pathname;
  if (safePath.startsWith('/')) safePath = safePath.slice(1);
  const filePath = path.join(__dirname, safePath);
  const ext = path.extname(filePath).toLowerCase();
  const cTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg', '.ico': 'image/x-icon' };

  fs.readFile(filePath, (err, cnt) => {
    if (err) { res.writeHead(err.code === 'ENOENT' ? 404 : 500); res.end(); }
    else { res.writeHead(200, { 'Content-Type': cTypes[ext] || 'application/octet-stream' }); res.end(cnt); }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  BBruno Automotores - Server v3 (Full Gallery Data)\n  URL: http://localhost:8080\n`);
});
