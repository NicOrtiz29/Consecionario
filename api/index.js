const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API connected to Supabase is running!' });
});

// Generic Fetch from table
app.get('/api/tables/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generif Fetch single item from table by id
app.get('/api/tables/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Extractor de fotos de Instagram
app.get('/api/ig-extract', async (req, res) => {
  const { shortcode } = req.query;
  if (!shortcode) return res.status(400).json({ error: 'Shortcode requerido' });

  try {
    const response = await fetch(`https://www.instagram.com/p/${shortcode}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9'
      }
    });
    const html = await response.text();
    
    // TÉCNICA 1: Buscar display_url
    const displayUrlRegex = /"display_url":"([^"]+?\.jpg[^"]+?)"/g;
    let images = [];
    let m;
    while ((m = displayUrlRegex.exec(html)) !== null) {
      images.push(m[1].replace(/\\u0026/g, '&').replace(/\\/g, ''));
    }

    // TÉCNICA 2: Buscar cualquier link scontent que termine en .jpg
    const rawRegex = /https:\/\/scontent[^" \n\\]+?\.cdninstagram\.com\/[^" \n\\]+?\.jpg[^" \n\\]+?/g;
    const rawMatches = html.match(rawRegex) || [];
    images = images.concat(rawMatches.map(u => u.replace(/\\u0026/g, '&')));

    // Filtrar fotos reales y quitar duplicados
    images = images.filter(url => !url.includes('150x150') && url.includes('cdninstagram.com'));
    const uniqueImages = [...new Set(images)].slice(0, 10);
    
    console.log(`[IG] Encontradas ${uniqueImages.length} fotos.`);
    res.json({ images: uniqueImages });
  } catch (err) {
    console.error('[IG Error]', err);
    res.status(500).json({ error: 'Error de conexión con Instagram' });
  }
});

// Proxy para datos de Alarfin Financing
app.get('/api/alarfin-data', async (req, res) => {
  try {
    const response = await fetch('https://simulador.alarfin.com.ar/datos');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[Alarfin Proxy Error]', err);
    res.status(500).json({ error: 'Error al obtener datos de Alarfin' });
  }
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
