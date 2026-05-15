-- 1. Crear tabla de empresas si no existe (Necesario para el multi-tenant)
CREATE TABLE IF NOT EXISTS public.empresas (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nombre text NOT NULL,
  dominio text,
  branding_logo_url text,
  branding_hero_bg_url text,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Insertar empresa por defecto (id=1)
INSERT INTO public.empresas (id, nombre, dominio)
OVERRIDING SYSTEM VALUE
VALUES (1, 'BBruno Automotores', 'localhost')
ON CONFLICT (id) DO NOTHING;

-- 3. Crear tabla de alertas
DROP TABLE IF EXISTS public.vehicle_alerts;

CREATE TABLE IF NOT EXISTS public.vehicle_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id integer NOT NULL DEFAULT 1, -- Usamos empresa_id para ser consistentes con el resto del sistema
  name text NOT NULL,
  phone text NOT NULL,
  brand text,
  model text,
  min_year integer,
  max_year integer,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.vehicle_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for anonymous users" 
ON public.vehicle_alerts FOR INSERT 
TO public 
WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" 
ON public.vehicle_alerts FOR ALL 
TO authenticated 
USING (true);
