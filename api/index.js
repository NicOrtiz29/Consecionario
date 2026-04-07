const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

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

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
