-- =====================================================
-- RKA - Datos adicionales (seed extra)
-- Inserta registros en TODAS las tablas del esquema
-- =====================================================
\getenv seed_demo_password SEED_DEMO_PASSWORD
\if :{?seed_demo_password}
\else
  \echo 'ERROR: Set SEED_DEMO_PASSWORD before running this seed.'
  \quit
\endif

-- 1) ROLES
INSERT INTO roles (nombre_rol, descripcion, estado) VALUES
  ('jefe_general', 'Jefe General de la empresa', 'activo'),
  ('jefa_tienda', 'Jefa de Tienda', 'activo'),
  ('subjefe_tienda', 'Subjefe de Tienda', 'activo'),
  ('personal_almacen', 'Personal de Almacén', 'activo')
ON CONFLICT DO NOTHING;

-- 2) PERMISOS
INSERT INTO permisos (nombre_categoria, descripcion) VALUES
  ('ventas', 'Gestión de ventas y salidas'),
  ('clientes', 'Gestión de clientes'),
  ('categorias', 'Gestión de categorías'),
  ('marcas', 'Gestión de marcas'),
  ('unidades_medida', 'Gestión de unidades de medida'),
  ('usuarios', 'Gestión de usuarios y roles')
ON CONFLICT DO NOTHING;

-- 3) ROL_PERMISOS
INSERT INTO rol_permisos (id_rol, id_permiso) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6),
  (2, 1), (2, 2), (2, 3),
  (3, 1), (3, 2),
  (4, 3), (4, 4), (4, 5)
ON CONFLICT DO NOTHING;

-- 4) USUARIOS
INSERT INTO usuarios (nombres, apellidos, tipo_de_documento, dni, usuario_login, contrasena, estado, id_rol) VALUES
  ('Usuario', 'Demo 1', NULL, NULL, 'demo.user1', :'seed_demo_password', 'activo', 1),
  ('Usuario', 'Demo 2', NULL, NULL, 'demo.user2', :'seed_demo_password', 'activo', 2),
  ('Usuario', 'Demo 3', NULL, NULL, 'demo.user3', :'seed_demo_password', 'activo', 3),
  ('Usuario', 'Demo 4', NULL, NULL, 'demo.user4', :'seed_demo_password', 'activo', 4)
ON CONFLICT DO NOTHING;

-- 5) REPORTES
INSERT INTO reportes (nombre_reporte, tipo_reporte, archivo_url, id_usuario) VALUES
  ('Reporte de Inventario Mensual', 'inventario', '/reportes/inventario_2026_09.pdf', 1),
  ('Reporte de Ventas Q3', 'ventas', '/reportes/ventas_q3_2026.pdf', 1),
  ('Reporte de Stock Bajo', 'stock', '/reportes/stock_bajo_2026_10.pdf', 2)
ON CONFLICT DO NOTHING;

-- 6) CATEGORIAS
INSERT INTO categorias (nombre_categoria, descripcion) VALUES
  ('Válvulas', 'Válvulas de paso y control'),
  ('Fregaderos', 'Fregaderos de cocina y baño'),
  ('Accesorios de Baño', 'Accesorios para baño completo')
ON CONFLICT DO NOTHING;

-- 7) MARCAS
INSERT INTO marcas (nombre_marca) VALUES
  ('Ferrum'),
  ('Roca'),
  ('Vainsa')
ON CONFLICT DO NOTHING;

-- 8) UNIDADES DE MEDIDA
INSERT INTO unidades_medida (nombre_unidad, abreviatura) VALUES
  ('Caja', 'cja'),
  ('Paquete', 'paq'),
  ('Rollo', 'rll')
ON CONFLICT DO NOTHING;

-- 9) PROVEEDORES
INSERT INTO proveedores (nombre_proveedor, ruc, telefono, correo, direccion) VALUES
  ('Distribuidora Demo 1 S.A.', '', '', 'proveedor1@example.invalid', 'Dirección de demostración'),
  ('Importaciones Demo 2 E.I.R.L.', '', '', 'proveedor2@example.invalid', 'Dirección de demostración'),
  ('Suministros Demo 3 S.A.C.', '', '', 'proveedor3@example.invalid', 'Dirección de demostración')
ON CONFLICT DO NOTHING;

-- 10) PRODUCTOS
INSERT INTO productos (codigo_producto, nombre_producto, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, estado, id_categoria, id_marca, id_unidad, id_proveedor) VALUES
  ('VAL-001', 'Válvula de Paso 1/2"', 'Válvula de paso para tubería', 8.50, 12.00, 200, 50, 'activo', 4, 1, 1, 1),
  ('VAL-002', 'Válvula de Paso 3/4"', 'Válvula de paso para tubería', 10.00, 15.00, 150, 40, 'activo', 4, 2, 1, 2),
  ('FRE-001', 'Fregadero de Cocina 2 Pozos', 'Fregadero de acero inoxidable', 180.00, 250.00, 15, 5, 'activo', 5, 1, 1, 1),
  ('FRE-002', 'Fregadero de Baño', 'Fregadero de porcelana', 120.00, 180.00, 20, 8, 'activo', 5, 3, 1, 3),
  ('ACC-003', 'Espejo con Marco', 'Espejo con marco de aluminio', 45.00, 75.00, 30, 10, 'activo', 6, 2, 1, 2),
  ('ACC-004', 'Toallero de Pared', 'Toallero de acero inoxidable', 25.00, 40.00, 50, 15, 'activo', 6, 1, 1, 1),
  ('TUB-002', 'Tubería PVC 3/4"', 'Tubo de PVC para agua', 12.00, 18.00, 100, 30, 'activo', 3, 3, 2, 2),
  ('ACC-005', 'Kit de Accesorios Baño', 'Set completo de accesorios', 55.00, 85.00, 25, 8, 'activo', 6, 1, 3, 1)
ON CONFLICT DO NOTHING;

-- 11) PRODUCTO_PROVEEDOR
INSERT INTO producto_proveedor (id_producto, id_proveedor, precio_compra, tiempo_entrega, estado) VALUES
  (6, 1, 8.50, '3 días', 'activo'),
  (7, 2, 10.00, '5 días', 'activo'),
  (8, 1, 180.00, '7 días', 'activo'),
  (9, 3, 120.00, '4 días', 'activo'),
  (10, 2, 45.00, '2 días', 'activo'),
  (11, 1, 25.00, '3 días', 'activo'),
  (12, 2, 12.00, '4 días', 'activo'),
  (13, 1, 55.00, '5 días', 'activo')
ON CONFLICT DO NOTHING;

-- 12) CLIENTES
INSERT INTO clientes (nombre, contacto, telefono, correo, direccion) VALUES
  ('Ferretería Demo 3', 'Contacto de demostración', '', 'cliente3@example.invalid', 'Dirección de demostración'),
  ('Constructora Demo 4', 'Contacto de demostración', '', 'cliente4@example.invalid', 'Dirección de demostración'),
  ('Plomería Demo 5', 'Contacto de demostración', '', 'cliente5@example.invalid', 'Dirección de demostración'),
  ('Distribuidora Demo 6', 'Contacto de demostración', '', 'cliente6@example.invalid', 'Dirección de demostración')
ON CONFLICT DO NOTHING;

-- 13) TIPO_MOVIMIENTO
INSERT INTO tipo_movimiento (nombre_tipo, descripcion) VALUES
  ('devolucion', 'Devolución de mercadería'),
  ('traslado', 'Traslado entre almacenes')
ON CONFLICT DO NOTHING;

-- 14) MOTIVO_MOVIMIENTO
INSERT INTO motivo_movimiento (nombre_motivo, descripcion) VALUES
  ('Devolución por defecto', 'Producto con defecto de fábrica'),
  ('Merma', 'Pérdida o deterioro de mercadería'),
  ('Traslado entre almacenes', 'Movimiento interno de stock')
ON CONFLICT DO NOTHING;

-- 15) MOVIMIENTOS
INSERT INTO movimientos (id_producto, id_tipo_movimiento, id_motivo, id_usuario_registro, cantidad, fecha_hora, observacion, estado) VALUES
  (6, 1, 1, 1, 30, NOW() - INTERVAL '2 months', 'Venta de válvulas', 'registrado'),
  (7, 1, 1, 1, 20, NOW() - INTERVAL '2 months', 'Venta de válvulas', 'registrado'),
  (8, 1, 1, 1, 5, NOW() - INTERVAL '1 month', 'Venta de fregadero', 'registrado'),
  (9, 1, 1, 1, 8, NOW() - INTERVAL '1 month', 'Venta de fregadero', 'registrado'),
  (10, 1, 1, 1, 12, NOW() - INTERVAL '3 weeks', 'Venta de espejo', 'registrado'),
  (11, 1, 1, 1, 15, NOW() - INTERVAL '3 weeks', 'Venta de toallero', 'registrado'),
  (12, 1, 1, 1, 25, NOW() - INTERVAL '2 weeks', 'Venta de tubería', 'registrado'),
  (13, 1, 1, 1, 10, NOW() - INTERVAL '1 week', 'Venta de kit baño', 'registrado'),
  (6, 2, 4, 2, 5, NOW() - INTERVAL '5 days', 'Devolución por defecto', 'registrado'),
  (8, 2, 4, 2, 2, NOW() - INTERVAL '3 days', 'Devolución por defecto', 'registrado'),
  (10, 3, 5, 3, 3, NOW() - INTERVAL '2 days', 'Merma', 'registrado'),
  (12, 4, 6, 4, 10, NOW() - INTERVAL '1 day', 'Traslado entre almacenes', 'registrado')
ON CONFLICT DO NOTHING;
