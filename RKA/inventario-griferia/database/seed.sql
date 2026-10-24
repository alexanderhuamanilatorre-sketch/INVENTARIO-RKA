-- =====================================================
-- RKA - Datos de ejemplo (seed)
-- =====================================================
\getenv seed_admin_password SEED_ADMIN_PASSWORD
\if :{?seed_admin_password}
\else
  \echo 'ERROR: Set SEED_ADMIN_PASSWORD before running this seed.'
  \quit
\endif

-- Roles y permisos
INSERT INTO roles (nombre_rol, descripcion, estado) VALUES
  ('administrador', 'Acceso total al sistema', 'activo'),
  ('vendedor', 'Gestión de ventas y movimientos', 'activo');

INSERT INTO permisos (nombre_categoria, descripcion) VALUES
  ('inventario', 'Gestión de inventario en tiempo real'),
  ('ventas', 'Registro de salidas'),
  ('reportes', 'Consulta de reportes');

INSERT INTO rol_permisos (id_rol, id_permiso) VALUES
  (1, 1), (1, 2), (1, 3), (2, 1), (2, 2), (2, 3);

-- Usuario administrador por defecto
INSERT INTO usuarios (nombres, apellidos, tipo_de_documento, dni, usuario_login, contrasena, estado, id_rol)
VALUES ('Administrador', 'RKA', NULL, NULL, 'admin', :'seed_admin_password', 'activo', 1);

-- Tipos y motivos de movimiento
INSERT INTO tipo_movimiento (nombre_tipo, descripcion) VALUES
  ('entrada', 'Ingreso de mercadería'),
  ('salida',  'Salida de mercadería');

INSERT INTO motivo_movimiento (nombre_motivo, descripcion) VALUES
  ('Venta', 'Salida por venta al cliente'),
  ('Compra', 'Entrada por compra a proveedor'),
  ('Inventario inicial', 'Registro inicial de stock'),
  ('Ajuste', 'Ajuste de inventario');

-- Categorías, marcas y unidades
INSERT INTO categorias (nombre_categoria, descripcion) VALUES
  ('Griferías', 'Griferías para baño y cocina'),
  ('Accesorios', 'Accesorios de plomería'),
  ('Tuberías', 'Tuberías y conexiones');

INSERT INTO marcas (nombre_marca) VALUES ('RKA'), ('Kohler'), ('Tramontina');

INSERT INTO unidades_medida (nombre_unidad, abreviatura) VALUES
  ('Unidad', 'und'), ('Metro', 'm'), ('Kit', 'kit');

-- Proveedores
INSERT INTO proveedores (nombre_proveedor, ruc, telefono, correo, direccion) VALUES
  ('Proveedor Griferías S.A.C.', '', '', 'demo1@example.invalid', 'Dirección de demostración'),
  ('Tubos y Conexiones E.I.R.L.', '', '', 'demo2@example.invalid', 'Dirección de demostración');

-- Productos
INSERT INTO productos (codigo_producto, nombre_producto, descripcion, id_categoria, id_marca, id_unidad, id_proveedor, stock_actual, stock_minimo, precio_compra, precio_venta, estado) VALUES
  ('GRF-001', 'Grifería Mezcladora Cromada', 'Grifería mezcladora para lavabo', 1, 1, 1, 1, 50, 10, 120.00, 150.00, 'activo'),
  ('GRF-002', 'Grifería de Cocina', 'Grifería alta para cocina', 1, 2, 1, 1, 8, 10, 145.00, 180.00, 'activo'),
  ('ACC-001', 'Ducha Flexible', 'Manguera flexible para ducha', 2, 3, 1, 2, 0, 5, 35.00, 45.00, 'activo'),
  ('TUB-001', 'Tubería PVC 1/2"', 'Tubo de PVC para agua', 3, 3, 2, 2, 120, 20, 9.50, 12.50, 'activo'),
  ('ACC-002', 'Kit de Ducha', 'Set completo de accesorios para ducha', 2, 1, 3, 1, 35, 8, 70.00, 89.90, 'activo');

-- Producto-Proveedor
INSERT INTO producto_proveedor (id_producto, id_proveedor, precio_compra, tiempo_entrega, estado) VALUES
  (1, 1, 120.00, '5 días', 'activo'),
  (2, 1, 145.00, '7 días', 'activo'),
  (3, 2, 35.00, '3 días', 'activo'),
  (4, 2, 9.50, '2 días', 'activo'),
  (5, 1, 70.00, '5 días', 'activo');

-- Clientes
INSERT INTO clientes (nombre, contacto, telefono, correo, direccion) VALUES
  ('Ferretería Demo 1', 'Contacto de demostración', '', 'cliente1@example.invalid', 'Dirección de demostración'),
  ('Constructora Demo 2', 'Contacto de demostración', '', 'cliente2@example.invalid', 'Dirección de demostración');

-- Movimientos
INSERT INTO movimientos (id_producto, id_tipo_movimiento, id_motivo, id_usuario_registro, cantidad, fecha_hora, observacion, estado) VALUES
  (1, 1, 3, 1, 50, NOW() - INTERVAL '5 months', 'Inventario inicial', 'registrado'),
  (1, 2, 1, 1, 12, NOW() - INTERVAL '5 months', 'Venta', 'registrado'),
  (1, 2, 1, 1, 19, NOW() - INTERVAL '4 months', 'Venta', 'registrado'),
  (1, 2, 1, 1, 8,  NOW() - INTERVAL '3 months', 'Venta', 'registrado'),
  (1, 2, 1, 1, 15, NOW() - INTERVAL '2 months', 'Venta', 'registrado'),
  (1, 2, 1, 1, 22, NOW() - INTERVAL '1 month',  'Venta', 'registrado'),
  (1, 2, 1, 1, 17, NOW(),                        'Venta', 'registrado'),
  (2, 2, 1, 1, 3,  NOW(),                        'Venta', 'registrado');
