-- =====================================================
-- RKA - Sistema de Gestión de Inventario de Grifería
-- Esquema de base de datos (PostgreSQL)
-- Adaptado al diagrama ER proporcionado
-- =====================================================
CREATE DATABASE inventario_griferia;
-- Eliminar tablas si existen (para reiniciar el esquema)
DROP TABLE IF EXISTS movimientos CASCADE;
DROP TABLE IF EXISTS producto_proveedor CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS tipo_movimiento CASCADE;
DROP TABLE IF EXISTS motivo_movimiento CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;
DROP TABLE IF EXISTS marcas CASCADE;
DROP TABLE IF EXISTS unidades_medida CASCADE;
DROP TABLE IF EXISTS proveedores CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS reportes CASCADE;
DROP TABLE IF EXISTS rol_permisos CASCADE;
DROP TABLE IF EXISTS permisos CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- =====================================================
-- ROLES / PERMISOS
-- =====================================================
CREATE TABLE roles (
  id_rol       SERIAL PRIMARY KEY,
  nombre_rol   VARCHAR(50) UNIQUE NOT NULL,
  descripcion  VARCHAR(200),
  estado       VARCHAR(20) DEFAULT 'activo'
);

CREATE TABLE permisos (
  id_permiso       SERIAL PRIMARY KEY,
  nombre_categoria VARCHAR(80) NOT NULL,
  descripcion      VARCHAR(200)
);

CREATE TABLE rol_permisos (
  id_rol     INTEGER REFERENCES roles(id_rol) ON DELETE CASCADE,
  id_permiso INTEGER REFERENCES permisos(id_permiso) ON DELETE CASCADE,
  PRIMARY KEY (id_rol, id_permiso)
);

-- =====================================================
-- USUARIOS
-- =====================================================
CREATE TABLE usuarios (
  id_usuario         SERIAL PRIMARY KEY,
  nombres            VARCHAR(120) NOT NULL,
  apellidos          VARCHAR(120),
  tipo_de_documento  VARCHAR(30),
  dni                VARCHAR(20),
  usuario_login      VARCHAR(50) UNIQUE NOT NULL,
  contrasena         VARCHAR(255) NOT NULL,
  contrasena_visible TEXT,
  estado             VARCHAR(20) DEFAULT 'activo',
  fecha_creacion     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  id_rol             INTEGER REFERENCES roles(id_rol) ON DELETE SET NULL
);

-- =====================================================
-- REPORTES
-- =====================================================
CREATE TABLE reportes (
  id_reporte      SERIAL PRIMARY KEY,
  nombre_reporte  VARCHAR(120) NOT NULL,
  tipo_reporte    VARCHAR(60),
  fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archivo_url     VARCHAR(255),
  id_usuario      INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

-- =====================================================
-- CATALOGOS
-- =====================================================
CREATE TABLE categorias (
  id_categoria    SERIAL PRIMARY KEY,
  nombre_categoria VARCHAR(80) NOT NULL,
  descripcion     TEXT
);

CREATE TABLE marcas (
  id_marca    SERIAL PRIMARY KEY,
  nombre_marca VARCHAR(80) NOT NULL
);

CREATE TABLE unidades_medida (
  id_unidad       SERIAL PRIMARY KEY,
  nombre_unidad   VARCHAR(50) NOT NULL,
  abreviatura     VARCHAR(10)
);

-- =====================================================
-- PROVEEDORES / PRODUCTOS
-- =====================================================
CREATE TABLE proveedores (
  id_proveedor     SERIAL PRIMARY KEY,
  nombre_proveedor VARCHAR(120) NOT NULL,
  ruc              VARCHAR(20),
  telefono         VARCHAR(30),
  correo           VARCHAR(120),
  direccion        VARCHAR(200)
);

CREATE TABLE productos (
  id_producto     SERIAL PRIMARY KEY,
  codigo_producto VARCHAR(30) UNIQUE NOT NULL,
  nombre_producto VARCHAR(150) NOT NULL,
  descripcion     TEXT,
  precio_compra   NUMERIC(10,2) DEFAULT 0,
  precio_venta    NUMERIC(10,2) DEFAULT 0,
  stock_actual    INTEGER DEFAULT 0,
  stock_minimo    INTEGER DEFAULT 5,
  estado          VARCHAR(20) DEFAULT 'activo',
  id_categoria    INTEGER REFERENCES categorias(id_categoria) ON DELETE SET NULL,
  id_marca        INTEGER REFERENCES marcas(id_marca) ON DELETE SET NULL,
  id_unidad       INTEGER REFERENCES unidades_medida(id_unidad) ON DELETE SET NULL,
  id_proveedor    INTEGER REFERENCES proveedores(id_proveedor) ON DELETE SET NULL
);

CREATE TABLE producto_proveedor (
  id_producto   INTEGER REFERENCES productos(id_producto) ON DELETE CASCADE,
  id_proveedor  INTEGER REFERENCES proveedores(id_proveedor) ON DELETE CASCADE,
  precio_compra NUMERIC(10,2) DEFAULT 0,
  tiempo_entrega VARCHAR(30),
  estado        VARCHAR(20) DEFAULT 'activo',
  PRIMARY KEY (id_producto, id_proveedor)
);

-- =====================================================
-- CLIENTES
-- =====================================================
CREATE TABLE clientes (
  id_cliente SERIAL PRIMARY KEY,
  nombre     VARCHAR(120) NOT NULL,
  contacto   VARCHAR(120),
  telefono   VARCHAR(30),
  correo     VARCHAR(120),
  direccion  VARCHAR(200)
);

-- =====================================================
-- MOVIMIENTOS
-- =====================================================
CREATE TABLE tipo_movimiento (
  id_tipo_movimiento SERIAL PRIMARY KEY,
  nombre_tipo       VARCHAR(20) UNIQUE NOT NULL,
  descripcion       VARCHAR(200)
);

CREATE TABLE motivo_movimiento (
  id_motivo      SERIAL PRIMARY KEY,
  nombre_motivo  VARCHAR(80) UNIQUE NOT NULL,
  descripcion    VARCHAR(200)
);

CREATE TABLE movimientos (
  id_movimiento           SERIAL PRIMARY KEY,
  numero_venta            INTEGER,
  cantidad                INTEGER NOT NULL DEFAULT 0,
  fecha_hora              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  observacion             VARCHAR(200),
  estado                  VARCHAR(20) DEFAULT 'registrado',
  id_producto             INTEGER REFERENCES productos(id_producto) ON DELETE CASCADE,
  id_tipo_movimiento      INTEGER REFERENCES tipo_movimiento(id_tipo_movimiento) ON DELETE SET NULL,
  id_motivo               INTEGER REFERENCES motivo_movimiento(id_motivo) ON DELETE SET NULL,
  id_usuario_registro     INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  id_usuario_confirmacion INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

-- Índices
CREATE INDEX idx_productos_categoria  ON productos(id_categoria);
CREATE INDEX idx_productos_proveedor  ON productos(id_proveedor);
CREATE INDEX idx_movimientos_producto ON movimientos(id_producto);
CREATE INDEX idx_movimientos_fecha    ON movimientos(fecha_hora);
CREATE UNIQUE INDEX movimientos_numero_venta_uk ON movimientos(numero_venta) WHERE numero_venta IS NOT NULL;
