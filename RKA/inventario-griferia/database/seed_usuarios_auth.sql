-- ============================================================================
-- seed_usuarios_auth.sql
-- Cuentas genéricas de demostración para "Gestión de Usuarios / Roles".
-- Uso: psql -U postgres -d rkal_inventario -f database/seed_usuarios_auth.sql
-- ============================================================================
\getenv seed_demo_password SEED_DEMO_PASSWORD
\if :{?seed_demo_password}
\else
  \echo 'ERROR: Set SEED_DEMO_PASSWORD before running this seed.'
  \quit
\endif

-- 1) Nuevas columnas para la información completa del colaborador ------------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo         VARCHAR(160);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nacionalidad   VARCHAR(80) DEFAULT 'Peruana';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso  TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_correo_uk ON usuarios (correo) WHERE correo IS NOT NULL;

-- 2) Roles del módulo (si no existieran) -------------------------------------
INSERT INTO roles (nombre_rol, descripcion, estado) VALUES
  ('jefe_general',    'Jefe General de la tienda',      'activo'),
  ('jefa_tienda',     'Jefa de Tienda',                 'activo'),
  ('subjefe_tienda',  'Subjefe de Tienda',              'activo'),
  ('personal_almacen','Personal de Almacén',            'activo')
ON CONFLICT (nombre_rol) DO NOTHING;

-- 3) Cuenta de demostración -----------------------------------------------
UPDATE usuarios
   SET correo = 'admin@example.invalid', nacionalidad = 'Peruana', estado = 'activo'
 WHERE usuario_login = 'admin';

-- 4) Cuentas genéricas visibles en "Gestión de Usuarios / Roles" ------------
INSERT INTO usuarios
  (nombres, apellidos, tipo_de_documento, dni, usuario_login, contrasena,
   correo, nacionalidad, id_rol, estado, fecha_creacion)
VALUES
  ('Usuario', 'Demostración 1', NULL, NULL, 'demo.role1', :'seed_demo_password',
   'demo1@example.invalid', 'Peruana', (SELECT id_rol FROM roles WHERE nombre_rol = 'jefe_general'), 'activo', CURRENT_DATE),
  ('Usuario', 'Demostración 2', NULL, NULL, 'demo.role2', :'seed_demo_password',
   'demo2@example.invalid', 'Peruana', (SELECT id_rol FROM roles WHERE nombre_rol = 'jefa_tienda'), 'activo', CURRENT_DATE),
  ('Usuario', 'Demostración 3', NULL, NULL, 'demo.role3', :'seed_demo_password',
   'demo3@example.invalid', 'Peruana', (SELECT id_rol FROM roles WHERE nombre_rol = 'subjefe_tienda'), 'activo', CURRENT_DATE),
  ('Usuario', 'Demostración 4', NULL, NULL, 'demo.role4', :'seed_demo_password',
   'demo4@example.invalid', 'Peruana', (SELECT id_rol FROM roles WHERE nombre_rol = 'personal_almacen'), 'activo', CURRENT_DATE)
ON CONFLICT (usuario_login) DO UPDATE
   SET nombres      = EXCLUDED.nombres,
       apellidos    = EXCLUDED.apellidos,
       correo       = EXCLUDED.correo,
       contrasena   = EXCLUDED.contrasena,
       nacionalidad = EXCLUDED.nacionalidad,
       id_rol       = EXCLUDED.id_rol,
       estado       = EXCLUDED.estado;

-- 6) Verificación ------------------------------------------------------------
SELECT u.id_usuario,
       u.nombres || ' ' || u.apellidos        AS colaborador,
       u.correo                               AS correo_institucional,
       COALESCE(r.nombre_rol, '-')            AS rol,
       u.estado,
       u.ultimo_acceso
  FROM usuarios u
  LEFT JOIN roles r ON r.id_rol = u.id_rol
 ORDER BY u.id_usuario;
