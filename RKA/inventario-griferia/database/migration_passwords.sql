-- ============================================================================
-- migration_passwords.sql
-- Recuperación de contraseña con verificación de documento/correo y tokens de un solo uso.
-- Es idempotente y puede ejecutarse sobre una base existente.
-- ============================================================================

-- Columnas heredadas de la recuperación por pregunta de seguridad. Se conservan
-- para no perder datos de instalaciones anteriores, pero el flujo actual ya no
-- las utiliza: la identidad se valida con documento y correo registrado.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pregunta_seguridad   VARCHAR(200);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS respuesta_seguridad  VARCHAR(255);
-- Contraseña visible para el panel administrativo, cifrada en reposo.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS contrasena_visible   TEXT;

-- El correo se agregó en seed_usuarios_auth.sql; se asegura aquí para que la
-- recuperación funcione también en instalaciones que no ejecutaron esa semilla.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo        VARCHAR(160);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nacionalidad  VARCHAR(80) DEFAULT 'Peruana';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_correo_uk
  ON usuarios (correo) WHERE correo IS NOT NULL;

CREATE TABLE IF NOT EXISTS recuperaciones_contrasena (
  id_recuperacion SERIAL PRIMARY KEY,
  id_usuario      INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  token_hash      VARCHAR(64) NOT NULL UNIQUE,
  verificado      BOOLEAN NOT NULL DEFAULT FALSE,
  usado           BOOLEAN NOT NULL DEFAULT FALSE,
  intentos        INTEGER NOT NULL DEFAULT 0,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en       TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recuperaciones_usuario
  ON recuperaciones_contrasena (id_usuario, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_recuperaciones_expira
  ON recuperaciones_contrasena (expira_en);

-- Limpieza de solicitudes antiguas (no borra las vigentes).
DELETE FROM recuperaciones_contrasena
 WHERE expira_en < now() OR usado = TRUE;
