require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  // Use Supabase management API to run SQL
  const resp = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({})
  });

  // Try direct update - just set site_content on empresa 1 to test if column exists
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);
  
  const { data, error } = await supabase.from('empresas').update({ site_content: {} }).eq('id', 1).select();
  
  if (error) {
    console.log('Column does not exist yet. Error:', error.message);
    console.log('\n=== Please run this SQL in the Supabase SQL Editor: ===');
    console.log("ALTER TABLE empresas ADD COLUMN IF NOT EXISTS site_content jsonb DEFAULT '{}'::jsonb;");
  } else {
    console.log('Column exists! Update successful:', data[0].site_content);
  }
}

main();
