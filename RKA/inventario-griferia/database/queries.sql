-- =====================================================
-- RKA - Consultas útiles
-- =====================================================

-- 1. Listar productos con su categoría y proveedor
SELECT p.codigo, p.nombre, c.nombre AS categoria, pr.nombre AS proveedor, p.stock, p.precio
FROM productos p
LEFT JOIN categorias c  ON c.id = p.categoria_id
LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
ORDER BY p.codigo;

-- 2. Productos con stock bajo (stock <= stock_minimo)
SELECT codigo, nombre, stock, stock_minimo
FROM productos
WHERE stock <= stock_minimo
ORDER BY stock ASC;

-- 3. Ventas (salidas) por mes de los últimos 6 meses
SELECT TO_CHAR(fecha, 'YYYY-MM') AS mes, SUM(cantidad) AS total_vendido
FROM movimientos
WHERE tipo = 'salida'
  AND fecha >= NOW() - INTERVAL '6 months'
GROUP BY TO_CHAR(fecha, 'YYYY-MM')
ORDER BY mes;

-- 4. Total de productos y valor estimado del inventario
SELECT COUNT(*) AS total_productos,
       SUM(stock * precio) AS valor_inventario
FROM productos;

-- 5. Historial de movimientos con producto
SELECT m.fecha, m.tipo, p.nombre AS producto, m.cantidad, m.motivo, m.usuario
FROM movimientos m
JOIN productos p ON p.id = m.producto_id
ORDER BY m.fecha DESC;
