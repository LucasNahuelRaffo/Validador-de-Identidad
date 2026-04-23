-- Ejecutar este SQL en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS validaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  nombre_cliente TEXT,
  dni TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  similitud_facial FLOAT,
  datos_dni JSONB,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda rápida por token
CREATE INDEX IF NOT EXISTS idx_validaciones_token ON validaciones(token);

-- Trigger para actualizar automáticamente actualizado_en
CREATE OR REPLACE FUNCTION update_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_actualizado_en
BEFORE UPDATE ON validaciones
FOR EACH ROW EXECUTE FUNCTION update_actualizado_en();

-- Row Level Security (RLS) - acceso público para MVP
ALTER TABLE validaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso público lectura" ON validaciones
  FOR SELECT USING (true);

CREATE POLICY "Acceso público inserción" ON validaciones
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Acceso público actualización" ON validaciones
  FOR UPDATE USING (true);
