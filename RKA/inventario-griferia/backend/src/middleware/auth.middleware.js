const { getSession } = require("../lib/session");
const { tienePermiso } = require("../services/rbac.service");

const PAGE_SECTION_MAP = new Map([
  ["/pages/dashboard.html", "dashboard"],
  ["/pages/productos.html", "productos"],
  ["/pages/categorias.html", "productos.categorias"],
  ["/pages/inventario.html", "inventario"],
  ["/pages/movimientos.html", "movimientos"],
  ["/pages/ventas.html", "ventas"],
  ["/pages/proveedores.html", "proveedores"],
  ["/pages/clientes.html", "clientes"],
  ["/pages/reportes.html", "reportes"],
  ["/pages/configuracion.html", "configuracion"],
  ["/pages/permisos.html", "configuracion.permisos"],
]);

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

async function requireAuth(req, res, next) {
  try {
    const usuario = await getSession(req);
    if (!usuario) {
      return res.status(401).json({
        error: "NO_AUTENTICADO",
        mensaje: "Tu sesión expiró o no has iniciado sesión.",
      });
    }
    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

function requirePermission(codigo, campo = "acceder") {
  return async (req, res, next) => {
    try {
      if (!req.usuario) {
        return res.status(401).json({ error: "NO_AUTENTICADO" });
      }

      const permitido = await tienePermiso(req.usuario.idRol, codigo, campo);
      if (!permitido) {
        return res.status(403).json({
          error: "FORBIDDEN",
          seccion: codigo,
          mensaje: "No tienes permiso para acceder a esta sección.",
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireSameOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  try {
    const originUrl = new URL(origin);
    if (originUrl.host === req.headers.host) return next();
  } catch (_err) {
    /* origen inválido */
  }

  return res.status(403).json({
    error: "ORIGIN_NOT_ALLOWED",
    mensaje: "Origen de la petición no permitido.",
  });
}

/**
 * Protege las páginas HTML antes de que se sirvan desde express.static.
 * Evita que un usuario sin permiso vea aunque sea un instante el contenido.
 */
async function pageGuard(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const pathname = normalizePath(req.path);
  if (pathname === "/pages/403.html") return next();

  const seccion = PAGE_SECTION_MAP.get(pathname);
  if (!seccion) return next();

  try {
    const usuario = await getSession(req);
    if (!usuario) {
      const returnTo = encodeURIComponent(req.originalUrl || pathname);
      return res.redirect(302, `/auth/login.html?returnTo=${returnTo}`);
    }

    const permitido = await tienePermiso(usuario.idRol, seccion, "acceder");
    if (!permitido) {
      return res.redirect(302, `/pages/403.html?seccion=${encodeURIComponent(seccion)}`);
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireAuth,
  requirePermission,
  requireSameOrigin,
  pageGuard,
  PAGE_SECTION_MAP,
};
