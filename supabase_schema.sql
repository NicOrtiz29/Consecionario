-- ==================================================
-- BBruno Automotores - Database Schema
-- Ejecutar en: Supabase > SQL Editor > New Query
-- ==================================================

-- 1. Vehicles table (patent es UNIQUE y sirve como FK)
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patent TEXT UNIQUE NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  version TEXT DEFAULT '',
  color TEXT DEFAULT '',
  mileage INTEGER DEFAULT 0,
  price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'disponible',
  fuel_type TEXT DEFAULT '',
  transmission TEXT DEFAULT '',
  doors INTEGER DEFAULT 4,
  engine TEXT DEFAULT '',
  vin TEXT DEFAULT '',
  description TEXT DEFAULT '',
  is_featured BOOLEAN DEFAULT false,
  photos TEXT[] DEFAULT '{}',
  features TEXT[] DEFAULT '{}',
  branch_id TEXT DEFAULT 'branch-1',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Maintenance table (FK por patente)
CREATE TABLE IF NOT EXISTS maintenance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_patent TEXT NOT NULL REFERENCES vehicles(patent) ON DELETE CASCADE ON UPDATE CASCADE,
  type TEXT NOT NULL DEFAULT 'otro',
  description TEXT DEFAULT '',
  cost NUMERIC DEFAULT 0,
  mileage_at_service INTEGER DEFAULT 0,
  performed_by TEXT DEFAULT '',
  technician TEXT DEFAULT '',
  status TEXT DEFAULT 'pendiente',
  date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Leads table (FK por patente)
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_patent TEXT NOT NULL REFERENCES vehicles(patent) ON DELETE CASCADE ON UPDATE CASCADE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT DEFAULT 'nuevo',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Branches table
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY DEFAULT 'branch-1',
  name TEXT NOT NULL DEFAULT 'Sucursal Central',
  city TEXT DEFAULT '',
  address TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true
);

-- 5. Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'visualizador',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================================================
-- Datos por defecto
-- ==================================================
INSERT INTO branches (id, name, city, address, is_active)
VALUES ('branch-1', 'Sucursal Central', 'Tristán Suárez', 'Ezeiza, Buenos Aires', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_users (username, password_hash, full_name, role, is_active)
VALUES ('admin', 'admin2024', 'Administrador BBruno', 'administrador', true)
ON CONFLICT (username) DO NOTHING;

-- ==================================================
-- Row Level Security (RLS) - Acceso abierto temporal
-- ==================================================
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Políticas abiertas (se endurecerán con Supabase Auth)
CREATE POLICY "allow_all_vehicles" ON vehicles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_maintenance" ON maintenance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_leads" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_branches" ON branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_admin_users" ON admin_users FOR ALL USING (true) WITH CHECK (true);

-- ==================================================
-- Índices
-- ==================================================
CREATE INDEX IF NOT EXISTS idx_vehicles_patent ON vehicles(patent);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_brand ON vehicles(brand);
CREATE INDEX IF NOT EXISTS idx_maintenance_patent ON maintenance(vehicle_patent);
CREATE INDEX IF NOT EXISTS idx_leads_patent ON leads(vehicle_patent);
