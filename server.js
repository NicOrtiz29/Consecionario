/**
 * BBruno Automotores - Local Dev Server & Proxy (v2)
 * ================================================
 * node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;

// Estado en memoria para que la demo sea interactiva
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

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${pathname}`);

  // Handle /tables/ requests
  if (pathname.includes('/tables/')) {
    const parts = pathname.split('/').filter(p => p);
    const tableIndex = parts.indexOf('tables');
    const table = parts[tableIndex + 1];
    const recordId = parts[tableIndex + 2];

    const cleanTable = table ? table.split('?')[0] : '';
    const cleanId = recordId ? recordId.split('?')[0] : null;

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // GET Request
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (cleanId && MOCK_DATA[cleanTable]) {
        const item = MOCK_DATA[cleanTable].find(x => x.id === cleanId);
        return res.end(JSON.stringify(item || {}));
      }
      const data = MOCK_DATA[cleanTable] || [];
      return res.end(JSON.stringify({ data }));
    }

    // POST Request (Crear)
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const newData = JSON.parse(body);
          if (!MOCK_DATA[cleanTable]) MOCK_DATA[cleanTable] = [];
          newData.id = 'gen-' + Math.random().toString(36).substr(2, 9);
          newData.created_at = new Date().toISOString();
          MOCK_DATA[cleanTable].push(newData);
          console.log(`  [API] Registro creado en ${cleanTable}: ${newData.id}`);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(newData));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // PUT Request (Editar)
    if (req.method === 'PUT' && cleanId) {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const updatedData = JSON.parse(body);
          if (MOCK_DATA[cleanTable]) {
            const index = MOCK_DATA[cleanTable].findIndex(x => x.id === cleanId);
            if (index !== -1) {
              MOCK_DATA[cleanTable][index] = { ...MOCK_DATA[cleanTable][index], ...updatedData };
              console.log(`  [API] Registro actualizado en ${cleanTable}: ${cleanId}`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(MOCK_DATA[cleanTable][index]));
            }
          }
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // DELETE Request
    if (req.method === 'DELETE' && cleanId) {
      if (MOCK_DATA[cleanTable]) {
        const index = MOCK_DATA[cleanTable].findIndex(x => x.id === cleanId);
        if (index !== -1) {
          MOCK_DATA[cleanTable].splice(index, 1);
          console.log(`  [API] Registro eliminado en ${cleanTable}: ${cleanId}`);
          res.writeHead(204);
          return res.end();
        }
      }
      res.writeHead(404);
      res.end();
      return;
    }
  }

  // Handle static files
  let safePath = pathname === '/' ? 'index.html' : pathname;
  if (safePath.startsWith('/')) safePath = safePath.slice(1);
  const filePath = path.join(__dirname, safePath);

  const extname = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2'
  };

  const contentType = contentTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        process.stdout.write(` (404 Not Found)\n`);
        res.writeHead(404);
        res.end('File not found');
      } else {
        process.stdout.write(` (500 Error: ${error.code})\n`);
        res.writeHead(500);
        res.end(`Server error: ${error.code}`);
      }
    } else {
      process.stdout.write(` (200 OK)\n`);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ================================================
  BBruno Automotores - Servidor DEMO INTERACTIVO
  ================================================
  
  Soporta: GET, POST, PUT, DELETE (En memoria)
  
  Mocks activos:
  - vehicles (Inventario)
  - maintenance (Historial de servicios)  <-- Agregado Pulido/Encerado
  - leads (Consultas)
  - branches (Sucursales)
  
  URL: http://localhost:${PORT}
  ================================================
  `);
});
