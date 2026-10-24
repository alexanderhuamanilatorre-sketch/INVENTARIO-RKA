-- ============================================================================
-- migration_ventas.sql
-- Número secuencial de venta para los movimientos de salida de tipo venta.
-- Es idempotente y puede ejecutarse sobre una base existente.
-- ============================================================================

ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS numero_venta INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS movimientos_numero_venta_uk
  ON movimientos (numero_venta) WHERE numero_venta IS NOT NULL;

-- Rellena las ventas históricas que aún no tienen número. Se ordenan por fecha
-- y por id para que los números existentes no cambien al volver a ejecutar.
WITH base AS (
  SELECT COALESCE(MAX(numero_venta), 0) AS maximo
  FROM movimientos
),
ventas AS (
  SELECT m.id_movimiento,
         b.maximo + ROW_NUMBER() OVER (
           ORDER BY m.fecha_hora ASC, m.id_movimiento ASC
         ) AS nuevo_numero
  FROM movimientos m
  JOIN tipo_movimiento t ON t.id_tipo_movimiento = m.id_tipo_movimiento
  LEFT JOIN motivo_movimiento mo ON mo.id_motivo = m.id_motivo
  CROSS JOIN base b
  WHERE t.nombre_tipo = 'salida'
    AND LOWER(TRIM(COALESCE(mo.nombre_motivo, ''))) = 'venta'
    AND m.numero_venta IS NULL
)
UPDATE movimientos m
   SET numero_venta = v.nuevo_numero
  FROM ventas v
 WHERE m.id_movimiento = v.id_movimiento;
