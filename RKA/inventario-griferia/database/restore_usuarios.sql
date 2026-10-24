-- ============================================================================
-- restore_usuarios.sql
-- Restaura cuentas genéricas de demostración sin datos personales.
-- Uso: psql -U postgres -d rkal_inventario -f database/restore_usuarios.sql
-- ============================================================================
\getenv seed_demo_password SEED_DEMO_PASSWORD
\if :{?seed_demo_password}
\else
  \echo 'ERROR: Set SEED_DEMO_PASSWORD before running this seed.'
  \quit
\endif

INSERT INTO usuarios
  (id_usuario, nombres, apellidos, tipo_de_documento, dni, usuario_login,
   contrasena, correo, nacionalidad, id_rol, estado, fecha_creacion)
VALUES
  (3, 'Usuario', 'Demo 3', NULL, NULL, 'demo.user3', :'seed_demo_password',
   'demo3@example.invalid', 'Peruana', 2, 'activo', CURRENT_DATE),
  (4, 'Usuario', 'Demo 4', NULL, NULL, 'demo.user4', :'seed_demo_password',
   'demo4@example.invalid', 'Peruana', 3, 'activo', CURRENT_DATE),
  (5, 'Usuario', 'Demo 5', NULL, NULL, 'demo.user5', :'seed_demo_password',
   'demo5@example.invalid', 'Peruana', 4, 'activo', CURRENT_DATE),
  (7, 'Usuario', 'Demo 7', NULL, NULL, 'demo.user7', :'seed_demo_password',
   'demo7@example.invalid', 'Peruana', 4, 'activo', CURRENT_DATE),
  (8, 'Usuario', 'Demo 8', NULL, NULL, 'demo.user8', :'seed_demo_password',
   'demo8@example.invalid', 'Peruana', 5, 'activo', CURRENT_DATE),
  (9, 'Usuario', 'Demo 9', NULL, NULL, 'demo.user9', :'seed_demo_password',
   'demo9@example.invalid', 'Peruana', 6, 'activo', CURRENT_DATE)
ON CONFLICT (id_usuario) DO NOTHING;

-- La secuencia debe continuar después del mayor ID existente
SELECT setval(
  pg_get_serial_sequence('usuarios', 'id_usuario'),
  GREATEST((SELECT COALESCE(MAX(id_usuario), 1) FROM usuarios), 1),
  true
);

-- Verificación
SELECT u.id_usuario,
       u.nombres || ' ' || u.apellidos       AS colaborador,
       u.correo                              AS correo_institucional,
       COALESCE(r.nombre_rol, '-')           AS rol,
       u.estado
  FROM usuarios u
  LEFT JOIN roles r ON r.id_rol = u.id_rol
 ORDER BY u.id_usuario;
