-- ============================================================================
-- RKA - Migración RBAC
-- Catálogo jerárquico de secciones, permisos por rol, auditoría y sesiones.
--
-- Uso:
--   psql -U postgres -d rkal_inventario -f database/migration_rbac.sql
-- o, desde backend/:
--   npm run migrate:rbac
--
-- Es idempotente: puede ejecutarse más de una vez sin duplicar datos.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ROLES
-- ============================================================================
ALTER TABLE roles ADD COLUMN IF NOT EXISTS codigo VARCHAR(50);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS es_sistema BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS version_permisos INTEGER NOT NULL DEFAULT 1;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE roles ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now();

-- Código estable para roles ya existentes
UPDATE roles
SET codigo = lower(regexp_replace(nombre_rol, '[^a-zA-Z0-9]+', '_', 'g'))
WHERE codigo IS NULL;

-- Roles canónicos del sistema
INSERT INTO roles (nombre_rol, descripcion, estado, codigo, es_sistema)
VALUES
  ('administrador',    'Acceso total al sistema',              'activo', 'administrador',    TRUE),
  ('jefe_general',     'Jefe General de la tienda',            'activo', 'jefe_general',     TRUE),
  ('jefa_tienda',      'Jefa de Tienda',                       'activo', 'jefa_tienda',      FALSE),
  ('subjefe_tienda',   'Subjefe de Tienda',                    'activo', 'subjefe_tienda',   FALSE),
  ('personal_almacen', 'Personal de Almacén',                  'activo', 'personal_almacen', FALSE),
  ('vendedor',         'Gestión de ventas y movimientos',      'activo', 'vendedor',         FALSE),
  ('cliente',          'Consulta de información comercial',    'activo', 'cliente',          FALSE)
ON CONFLICT (nombre_rol) DO UPDATE
SET codigo      = EXCLUDED.codigo,
    descripcion = COALESCE(roles.descripcion, EXCLUDED.descripcion),
    es_sistema  = roles.es_sistema OR EXCLUDED.es_sistema;

ALTER TABLE roles ALTER COLUMN codigo SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_codigo ON roles (codigo);

-- ============================================================================
-- 2. CATÁLOGO JERÁRQUICO DE SECCIONES
-- ============================================================================
CREATE TABLE IF NOT EXISTS secciones (
  id_seccion    SERIAL PRIMARY KEY,
  codigo        VARCHAR(80)  NOT NULL UNIQUE,
  nombre        VARCHAR(100) NOT NULL,
  id_padre      INTEGER REFERENCES secciones(id_seccion) ON DELETE CASCADE,
  ruta          VARCHAR(180),
  icono         VARCHAR(60),
  orden         INTEGER NOT NULL DEFAULT 0,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'seccion'
                CHECK (tipo IN ('modulo', 'seccion', 'subseccion')),
  es_contenedor BOOLEAN NOT NULL DEFAULT FALSE,
  es_protegida  BOOLEAN NOT NULL DEFAULT FALSE,
  es_inicio     BOOLEAN NOT NULL DEFAULT FALSE,
  estado        VARCHAR(20) NOT NULL DEFAULT 'activo'
                CHECK (estado IN ('activo', 'inactivo')),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secciones_padre ON secciones (id_padre);
CREATE INDEX IF NOT EXISTS idx_secciones_orden ON secciones (orden);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seccion_inicio
  ON secciones (es_inicio)
  WHERE es_inicio = TRUE;

-- Módulos raíz
INSERT INTO secciones
  (codigo, nombre, id_padre, ruta, icono, orden, tipo, es_contenedor, es_protegida, es_inicio)
VALUES
  ('dashboard',   'Dashboard',   NULL, 'pages/dashboard.html#dashboard',     'bi-grid-1x2-fill', 10, 'modulo', FALSE, FALSE, TRUE),
  ('productos',   'Productos',   NULL, 'pages/productos.html#productos',     'bi-tag-fill',      20, 'modulo', FALSE, FALSE, FALSE),
  ('inventario',  'Inventario',  NULL, 'pages/inventario.html#inventario',   'bi-box-seam-fill', 30, 'modulo', FALSE, FALSE, FALSE),
  ('movimientos', 'Movimientos', NULL, 'pages/movimientos.html#movimientos', 'bi-arrow-left-right', 40, 'modulo', FALSE, FALSE, FALSE),
  ('ventas',      'Ventas',      NULL, 'pages/ventas.html#ventas',           'bi-cart-fill',     50, 'modulo', FALSE, FALSE, FALSE),
  ('proveedores', 'Proveedores', NULL, 'pages/proveedores.html#proveedores', 'bi-truck',         60, 'modulo', FALSE, FALSE, FALSE),
  ('reportes',    'Reportes',    NULL, 'pages/reportes.html#reportes',       'bi-bar-chart-fill', 80, 'modulo', FALSE, FALSE, FALSE),
  ('configuracion', 'Configuración', NULL, 'pages/configuracion.html#configuracion', 'bi-gear-fill', 90, 'modulo', FALSE, FALSE, FALSE)
ON CONFLICT (codigo) DO UPDATE
SET nombre        = EXCLUDED.nombre,
    ruta          = EXCLUDED.ruta,
    icono         = EXCLUDED.icono,
    orden         = EXCLUDED.orden,
    tipo          = EXCLUDED.tipo,
    es_contenedor = EXCLUDED.es_contenedor,
    es_inicio     = EXCLUDED.es_inicio;

-- Subsecciones
INSERT INTO secciones
  (codigo, nombre, id_padre, ruta, icono, orden, tipo, es_contenedor, es_protegida, es_inicio)
VALUES
  ('productos.catalogo',   'Catálogo',          (SELECT id_seccion FROM secciones WHERE codigo='productos'), 'pages/productos.html#productos', 'bi-list-ul', 21, 'subseccion', FALSE, FALSE, FALSE),
  ('productos.categorias', 'Categorías',        (SELECT id_seccion FROM secciones WHERE codigo='productos'), 'pages/categorias.html#categorias', 'bi-tags', 22, 'subseccion', FALSE, FALSE, FALSE),
  ('inventario.stock',     'Stock actual',      (SELECT id_seccion FROM secciones WHERE codigo='inventario'), 'pages/inventario.html#inventario', 'bi-boxes', 31, 'subseccion', FALSE, FALSE, FALSE),
  ('inventario.alertas',   'Alertas de stock',  (SELECT id_seccion FROM secciones WHERE codigo='inventario'), 'pages/inventario.html#inventario', 'bi-exclamation-triangle', 32, 'subseccion', FALSE, FALSE, FALSE),
  ('inventario.ajustes',   'Ajustes',           (SELECT id_seccion FROM secciones WHERE codigo='inventario'), 'pages/inventario.html#inventario', 'bi-sliders', 33, 'subseccion', FALSE, FALSE, FALSE),
  ('movimientos.entradas', 'Entradas',          (SELECT id_seccion FROM secciones WHERE codigo='movimientos'), 'pages/movimientos.html#movimientos', 'bi-box-arrow-in-down', 41, 'subseccion', FALSE, FALSE, FALSE),
  ('movimientos.salidas',  'Salidas',           (SELECT id_seccion FROM secciones WHERE codigo='movimientos'), 'pages/movimientos.html#movimientos', 'bi-box-arrow-up', 42, 'subseccion', FALSE, FALSE, FALSE),
  ('movimientos.historial','Historial',         (SELECT id_seccion FROM secciones WHERE codigo='movimientos'), 'pages/movimientos.html#movimientos', 'bi-clock-history', 43, 'subseccion', FALSE, FALSE, FALSE),
  ('ventas.nueva',         'Nueva venta',       (SELECT id_seccion FROM secciones WHERE codigo='ventas'), 'pages/ventas.html#ventas', 'bi-cart-plus', 51, 'subseccion', FALSE, FALSE, FALSE),
  ('ventas.historial',     'Historial de ventas',(SELECT id_seccion FROM secciones WHERE codigo='ventas'), 'pages/ventas.html#ventas', 'bi-receipt', 52, 'subseccion', FALSE, FALSE, FALSE),
  ('proveedores.directorio','Directorio',       (SELECT id_seccion FROM secciones WHERE codigo='proveedores'), 'pages/proveedores.html#proveedores', 'bi-journal-text', 61, 'subseccion', FALSE, FALSE, FALSE),
  ('proveedores.compras',  'Compras',           (SELECT id_seccion FROM secciones WHERE codigo='proveedores'), 'pages/proveedores.html#proveedores', 'bi-bag-check', 62, 'subseccion', FALSE, FALSE, FALSE),
  ('reportes.ventas',      'Reporte de ventas', (SELECT id_seccion FROM secciones WHERE codigo='reportes'), 'pages/reportes.html#reportes', 'bi-graph-up', 81, 'subseccion', FALSE, FALSE, FALSE),
  ('reportes.inventario',  'Reporte de inventario', (SELECT id_seccion FROM secciones WHERE codigo='reportes'), 'pages/reportes.html#reportes', 'bi-clipboard-data', 82, 'subseccion', FALSE, FALSE, FALSE),
  ('reportes.movimientos', 'Reporte de movimientos', (SELECT id_seccion FROM secciones WHERE codigo='reportes'), 'pages/reportes.html#reportes', 'bi-activity', 83, 'subseccion', FALSE, FALSE, FALSE),
  ('configuracion.usuarios', 'Usuarios y roles', (SELECT id_seccion FROM secciones WHERE codigo='configuracion'), 'pages/configuracion.html#configuracion', 'bi-people-fill', 91, 'subseccion', FALSE, FALSE, FALSE),
  ('configuracion.permisos', 'Permisos y accesos', (SELECT id_seccion FROM secciones WHERE codigo='configuracion'), 'pages/permisos.html#permisos', 'bi-shield-lock-fill', 92, 'subseccion', TRUE, TRUE, FALSE)
ON CONFLICT (codigo) DO UPDATE
SET nombre        = EXCLUDED.nombre,
    id_padre      = EXCLUDED.id_padre,
    ruta          = EXCLUDED.ruta,
    icono         = EXCLUDED.icono,
    orden         = EXCLUDED.orden,
    tipo          = EXCLUDED.tipo,
    es_contenedor = EXCLUDED.es_contenedor,
    es_protegida  = EXCLUDED.es_protegida;

-- La sección Clientes fue retirada del menú y del catálogo de permisos.
-- La tabla y la página de clientes se conservan, pero quedan sin acceso.
DELETE FROM secciones WHERE codigo = 'clientes';

-- ============================================================================
-- 3. PERMISOS POR ROL Y SECCIÓN
-- ============================================================================
CREATE TABLE IF NOT EXISTS permisos_rol (
  id_rol          INTEGER NOT NULL REFERENCES roles(id_rol) ON DELETE CASCADE,
  id_seccion      INTEGER NOT NULL REFERENCES secciones(id_seccion) ON DELETE CASCADE,
  puede_ver       BOOLEAN NOT NULL DEFAULT FALSE,
  puede_acceder   BOOLEAN NOT NULL DEFAULT FALSE,
  actualizado_por INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_rol, id_seccion),
  CONSTRAINT chk_ver_implica_acceso CHECK (NOT puede_ver OR puede_acceder)
);

CREATE INDEX IF NOT EXISTS idx_permisos_rol_seccion ON permisos_rol (id_seccion);

-- Administrador y Jefe General: todas las secciones
INSERT INTO permisos_rol (id_rol, id_seccion, puede_ver, puede_acceder)
SELECT r.id_rol, s.id_seccion, TRUE, TRUE
FROM roles r
CROSS JOIN secciones s
WHERE r.codigo IN ('administrador', 'jefe_general')
  AND s.estado = 'activo'
ON CONFLICT (id_rol, id_seccion) DO NOTHING;

-- Permisos operativos iniciales para los demás roles
WITH asignaciones(codigo_rol, codigo_seccion) AS (
  VALUES
    ('jefa_tienda', 'dashboard'),
    ('jefa_tienda', 'productos'),
    ('jefa_tienda', 'productos.catalogo'),
    ('jefa_tienda', 'productos.categorias'),
    ('jefa_tienda', 'inventario'),
    ('jefa_tienda', 'inventario.stock'),
    ('jefa_tienda', 'inventario.alertas'),
    ('jefa_tienda', 'movimientos'),
    ('jefa_tienda', 'movimientos.entradas'),
    ('jefa_tienda', 'movimientos.salidas'),
    ('jefa_tienda', 'movimientos.historial'),
    ('jefa_tienda', 'ventas'),
    ('jefa_tienda', 'ventas.nueva'),
    ('jefa_tienda', 'ventas.historial'),
    ('jefa_tienda', 'proveedores'),
    ('jefa_tienda', 'proveedores.directorio'),
    ('jefa_tienda', 'proveedores.compras'),
    ('jefa_tienda', 'reportes'),
    ('jefa_tienda', 'reportes.ventas'),
    ('jefa_tienda', 'reportes.inventario'),
    ('jefa_tienda', 'reportes.movimientos'),

    ('subjefe_tienda', 'dashboard'),
    ('subjefe_tienda', 'productos'),
    ('subjefe_tienda', 'productos.catalogo'),
    ('subjefe_tienda', 'productos.categorias'),
    ('subjefe_tienda', 'inventario'),
    ('subjefe_tienda', 'inventario.stock'),
    ('subjefe_tienda', 'inventario.alertas'),
    ('subjefe_tienda', 'movimientos'),
    ('subjefe_tienda', 'movimientos.entradas'),
    ('subjefe_tienda', 'movimientos.salidas'),
    ('subjefe_tienda', 'movimientos.historial'),
    ('subjefe_tienda', 'ventas'),
    ('subjefe_tienda', 'ventas.nueva'),
    ('subjefe_tienda', 'ventas.historial'),
    ('subjefe_tienda', 'proveedores'),
    ('subjefe_tienda', 'proveedores.directorio'),
    ('subjefe_tienda', 'proveedores.compras'),

    ('personal_almacen', 'dashboard'),
    ('personal_almacen', 'productos'),
    ('personal_almacen', 'productos.catalogo'),
    ('personal_almacen', 'productos.categorias'),
    ('personal_almacen', 'inventario'),
    ('personal_almacen', 'inventario.stock'),
    ('personal_almacen', 'inventario.alertas'),
    ('personal_almacen', 'inventario.ajustes'),
    ('personal_almacen', 'movimientos'),
    ('personal_almacen', 'movimientos.entradas'),
    ('personal_almacen', 'movimientos.salidas'),
    ('personal_almacen', 'movimientos.historial'),
    ('personal_almacen', 'proveedores'),
    ('personal_almacen', 'proveedores.directorio'),

    ('vendedor', 'dashboard'),
    ('vendedor', 'productos'),
    ('vendedor', 'productos.catalogo'),
    ('vendedor', 'inventario'),
    ('vendedor', 'inventario.stock'),
    ('vendedor', 'ventas'),
    ('vendedor', 'ventas.nueva'),
    ('vendedor', 'ventas.historial'),

    ('cliente', 'dashboard')
)
INSERT INTO permisos_rol (id_rol, id_seccion, puede_ver, puede_acceder)
SELECT r.id_rol, s.id_seccion, TRUE, TRUE
FROM asignaciones a
JOIN roles r ON r.codigo = a.codigo_rol
JOIN secciones s ON s.codigo = a.codigo_seccion
ON CONFLICT (id_rol, id_seccion) DO NOTHING;

-- El permiso del panel es exclusivo de Administrador y Jefe General.
DELETE FROM permisos_rol pr
USING roles r, secciones s
WHERE pr.id_rol = r.id_rol
  AND pr.id_seccion = s.id_seccion
  AND s.codigo = 'configuracion.permisos'
  AND r.codigo NOT IN ('administrador', 'jefe_general');

-- ============================================================================
-- 4. AUDITORÍA
-- ============================================================================
CREATE TABLE IF NOT EXISTS auditoria_permisos (
  id_auditoria BIGSERIAL PRIMARY KEY,
  id_actor     INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  id_rol       INTEGER REFERENCES roles(id_rol) ON DELETE SET NULL,
  accion       VARCHAR(30) NOT NULL
               CHECK (accion IN (
                 'crear_rol', 'activar_rol', 'desactivar_rol',
                 'actualizar_permisos'
               )),
  antes        JSONB,
  despues      JSONB,
  motivo       VARCHAR(300),
  ip           INET,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_rol_fecha
  ON auditoria_permisos (id_rol, creado_en DESC);

-- ============================================================================
-- 5. SESIONES DE SERVIDOR (cookie HttpOnly)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sesiones (
  id_sesion   BIGSERIAL PRIMARY KEY,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en   TIMESTAMPTZ NOT NULL,
  ip          INET,
  user_agent  VARCHAR(300)
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones (id_usuario);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones (expira_en);

-- ============================================================================
-- 6. FUNCIONES Y TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roles_actualizado ON roles;
CREATE TRIGGER trg_roles_actualizado
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

DROP TRIGGER IF EXISTS trg_permisos_rol_actualizado ON permisos_rol;
CREATE TRIGGER trg_permisos_rol_actualizado
BEFORE UPDATE ON permisos_rol
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

CREATE OR REPLACE FUNCTION proteger_seccion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.es_protegida THEN
    RAISE EXCEPTION 'No se puede eliminar una sección protegida: %', OLD.codigo;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_seccion ON secciones;
CREATE TRIGGER trg_proteger_seccion
BEFORE DELETE ON secciones
FOR EACH ROW EXECUTE FUNCTION proteger_seccion();

-- Permiso efectivo considerando toda la cadena de ancestros.
CREATE OR REPLACE FUNCTION rol_puede(
  p_id_rol INTEGER,
  p_codigo TEXT,
  p_campo  TEXT DEFAULT 'acceder'
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_resultado BOOLEAN;
BEGIN
  IF p_campo NOT IN ('ver', 'acceder') THEN
    RAISE EXCEPTION 'Campo de permiso inválido: %', p_campo;
  END IF;

  WITH RECURSIVE cadena AS (
    SELECT s.id_seccion, s.id_padre
    FROM secciones s
    WHERE s.codigo = p_codigo
      AND s.estado = 'activo'

    UNION ALL

    SELECT p.id_seccion, p.id_padre
    FROM secciones p
    JOIN cadena c ON c.id_padre = p.id_seccion
  )
  SELECT COALESCE(
    bool_and(
      CASE p_campo
        WHEN 'ver' THEN COALESCE(pr.puede_ver, FALSE)
        ELSE COALESCE(pr.puede_acceder, FALSE)
      END
    ),
    FALSE
  )
  INTO v_resultado
  FROM cadena c
  LEFT JOIN permisos_rol pr
    ON pr.id_seccion = c.id_seccion
   AND pr.id_rol = p_id_rol;

  RETURN v_resultado;
END;
$$;

COMMIT;
