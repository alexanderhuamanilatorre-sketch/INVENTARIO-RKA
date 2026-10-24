-- ============================================================================
-- seed_ruc_proveedores.sql
-- Proveedores de demostración: evita publicar identificadores fiscales o
-- contactos personales en los datos de ejemplo.
-- Uso: psql -U postgres -d rkal_inventario -f database/seed_ruc_proveedores.sql
-- ============================================================================

ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS contacto VARCHAR(120);

UPDATE proveedores
   SET ruc = '', contacto = 'Contacto de demostración'
 WHERE nombre_proveedor = 'Proveedor Griferías S.A.C.';

UPDATE proveedores
   SET ruc = '', contacto = 'Contacto de demostración'
 WHERE nombre_proveedor = 'Tubos y Conexiones E.I.R.L.';

UPDATE proveedores
   SET ruc = '', contacto = 'Contacto de demostración'
 WHERE nombre_proveedor = 'Distribuidora Demo 1 S.A.';

UPDATE proveedores
   SET ruc = '', contacto = 'Contacto de demostración'
 WHERE nombre_proveedor = 'Importaciones Demo 2 E.I.R.L.';

UPDATE proveedores
   SET ruc = '', contacto = 'Contacto de demostración'
 WHERE nombre_proveedor = 'Suministros Demo 3 S.A.C.';

-- Proveedores nuevos creados sin RUC todavía (si los hubiera)
UPDATE proveedores SET ruc = '' WHERE ruc IS NULL;
UPDATE proveedores SET contacto = '' WHERE contacto IS NULL;

-- Verificación
SELECT id_proveedor        AS id,
       nombre_proveedor    AS nombre,
       ruc,
       contacto,
       telefono,
       correo,
       direccion
  FROM proveedores
 ORDER BY id_proveedor;
