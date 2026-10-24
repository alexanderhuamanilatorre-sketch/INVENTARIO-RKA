import { StorageService } from "./storage-service.js";
import { AuthService } from "../auth/auth-core.js";
// Guardián de validación en tiempo real (input/paste/keydown) para todos los formularios
import "./input-guard.js";
// Notificaciones modales centradas (reemplaza window.alert en toda la app)
import "./notifications.js";

/**
 * AppCore
 * Utilidades, helpers y estado global de la aplicación
 */
export class AppCore {
  static APP_NAME = "RKA - Sistema de Gestión de Inventario";
  static STORAGE_KEY = "appData";

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Valida la sesión contra el servidor y comprueba el permiso de la página.
   * La protección principal está en el backend (pageGuard + middleware);
   * esto mantiene la UI coherente y evita mostrar una página sin permiso.
   */
  async initAuthGuard() {
    const user = await this.authService.refreshSession();
    if (!user) {
      const returnTo = encodeURIComponent(
        window.location.pathname +
          window.location.search +
          (window.location.hash || ""),
      );
      window.location.replace(`../auth/login.html?returnTo=${returnTo}`);
      return false;
    }

    const seccion = AppCore.getSectionFromPath();
    if (seccion && !this.authService.hasPermission(seccion, "acceder")) {
      window.location.replace(
        `./403.html?seccion=${encodeURIComponent(seccion)}`,
      );
      return false;
    }
    return true;
  }

  static getSectionFromPath() {
    const file = (
      window.location.pathname.split("/").pop() || ""
    ).toLowerCase();
    return (
      {
        "dashboard.html": "dashboard",
        "productos.html": "productos",
        "categorias.html": "productos.categorias",
        "inventario.html": "inventario",
        "movimientos.html": "movimientos",
        "ventas.html": "ventas",
        "proveedores.html": "proveedores",
        "clientes.html": "clientes",
        "reportes.html": "reportes",
        "configuracion.html": "configuracion",
        "permisos.html": "configuracion.permisos",
      }[file] || null
    );
  }

  static generateId() {
    return (
      Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
    );
  }

  static formatDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("es-ES");
  }

  static formatDateTime(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("es-ES");
  }

  static formatCurrency(amount) {
    const value = Number(amount) || 0;
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
    }).format(value);
  }

  static capitalize(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  static truncate(text, maxLength = 60) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...`;
  }

  static downloadCSV(csvContent, filename) {
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static escapeCSV(value) {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (
      str.includes(",") ||
      str.includes('"') ||
      str.includes("\n") ||
      str.includes("\r")
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  static getInitialData() {
    return {
      productos: [],
      categorias: [
        {
          id: "cat_1",
          nombre: "Griferías",
          descripcion: "Griferías para baño y cocina",
        },
        {
          id: "cat_2",
          nombre: "Accesorios",
          descripcion: "Accesorios de plomería",
        },
        {
          id: "cat_3",
          nombre: "Tuberías",
          descripcion: "Tuberías y conexiones",
        },
      ],
      proveedores: [],
      clientes: [],
      movimientos: [],
      configuracion: {
        nombreEmpresa: "RKA - Grifería",
        ruc: "",
        direccion: "",
        telefono: "",
        email: "",
        ciudad: "",
        web: "",
      },
    };
  }

  static loadAppData() {
    this._hydrateFromDatabase();
    const stored = StorageService.getItem(this.STORAGE_KEY, null);
    if (stored && typeof stored === "object") {
      const initial = this.getInitialData();
      return {
        productos: Array.isArray(stored.productos)
          ? stored.productos
          : initial.productos,
        categorias: Array.isArray(stored.categorias)
          ? stored.categorias
          : initial.categorias,
        proveedores: Array.isArray(stored.proveedores)
          ? stored.proveedores
          : initial.proveedores,
        clientes: Array.isArray(stored.clientes)
          ? stored.clientes
          : initial.clientes,
        movimientos: Array.isArray(stored.movimientos)
          ? stored.movimientos
          : initial.movimientos,
        configuracion: {
          ...initial.configuracion,
          ...(stored.configuracion || {}),
        },
      };
    }
    return this.getInitialData();
  }

  static saveAppData(data) {
    if (!data || typeof data !== "object") return Promise.resolve();
    StorageService.setItem(this.STORAGE_KEY, data);
    return this._syncToDatabase(data);
  }

  // Envía los datos al backend/PostgreSQL sin bloquear la UI
  static async _syncToDatabase(data) {
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorias: data.categorias || [],
          proveedores: data.proveedores || [],
          productos: data.productos || [],
          clientes: data.clientes || [],
          movimientos: data.movimientos || [],
        }),
      });
    } catch (err) {
      console.warn("No se pudo sincronizar con la base de datos:", err);
    }
  }

  // Carga los datos desde la base de datos y recarga la página si cambiaron
  static async _hydrateFromDatabase() {
    if (AppCore._hydrating) return;
    AppCore._hydrating = true;
    try {
      const resp = await fetch("/api/sync");
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data || typeof data !== "object" || !Array.isArray(data.productos))
        return;
      const current = StorageService.getItem(this.STORAGE_KEY, null);
      // Preservar la configuración local (no está en la BD)
      data.configuracion = current?.configuracion || data.configuracion || {};
      if (JSON.stringify(current) !== JSON.stringify(data)) {
        StorageService.setItem(this.STORAGE_KEY, data);
        window.location.reload();
      }
    } catch (err) {
      console.warn("No se pudo cargar desde la base de datos:", err);
    }
  }

  static loadSampleDataIfEmpty(data) {
    // Los datos reales vienen de la base de datos (ver _hydrateFromDatabase),
    // por lo que ya no se insertan datos de ejemplo desde el frontend.
    return;
  }

  static _loadSampleDataIfEmptyOriginal(data) {
    if (!data) return;
    const empty =
      data.productos.length === 0 &&
      data.proveedores.length === 0 &&
      data.clientes.length === 0 &&
      data.movimientos.length === 0;
    if (!empty) {
      // Si no hay salidas (ventas), agregamos datos de ejemplo para el gráfico
      const hasSalidas = data.movimientos.some((m) => m.tipo === "salida");
      if (!hasSalidas && data.productos.length > 0) {
        const now = new Date();
        const ventasEjemplo = [12, 19, 8, 15, 22, 17];
        const prodId = data.productos[0].id;
        ventasEjemplo.forEach((cant, idx) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 10);
          data.movimientos.push({
            id: AppCore.generateId(),
            fecha: d.toISOString(),
            tipo: "salida",
            productoId: prodId,
            cantidad: cant,
            motivo: "Venta",
            usuario: "Admin",
          });
        });
        AppCore.saveAppData(data);
      }
      return;
    }

    const proveedorId = AppCore.generateId();
    data.proveedores.push({
      id: proveedorId,
      nombre: "Proveedor Griferías S.A.C.",
      ruc: "20601122334",
      contacto: "Juan Pérez",
      telefono: "01-555-1234",
      email: "ventas@proveedorgriferias.com",
      direccion: "Lima, Perú",
    });

    const prod1Id = AppCore.generateId();
    data.productos.push(
      {
        id: prod1Id,
        codigo: "GRF-001",
        nombre: "Grifería Mezcladora Cromada",
        categoriaId: "cat_1",
        proveedorId,
        stock: 50,
        stockMinimo: 10,
        precio: 150.0,
        descripcion: "Grifería mezcladora para lavabo",
      },
      {
        id: AppCore.generateId(),
        codigo: "GRF-002",
        nombre: "Grifería de Cocina",
        categoriaId: "cat_1",
        proveedorId: null,
        stock: 8,
        stockMinimo: 10,
        precio: 180.0,
        descripcion: "Grifería alta para cocina",
      },
      {
        id: AppCore.generateId(),
        codigo: "ACC-001",
        nombre: "Ducha Flexible",
        categoriaId: "cat_2",
        proveedorId: null,
        stock: 0,
        stockMinimo: 5,
        precio: 45.0,
        descripcion: "Manguera flexible para ducha",
      },
    );

    data.movimientos.push({
      id: AppCore.generateId(),
      fecha: new Date().toISOString(),
      tipo: "entrada",
      productoId: prod1Id,
      cantidad: 50,
      motivo: "Inventario inicial",
      usuario: "Admin",
    });

    // Datos de ejemplo de ventas (salidas) en los últimos 6 meses
    const now = new Date();
    const ventasEjemplo = [12, 19, 8, 15, 22, 17];
    ventasEjemplo.forEach((cant, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 10);
      data.movimientos.push({
        id: AppCore.generateId(),
        fecha: d.toISOString(),
        tipo: "salida",
        productoId: prod1Id,
        cantidad: cant,
        motivo: "Venta",
        usuario: "Admin",
      });
    });

    AppCore.saveAppData(data);
  }

  static getEstadoProducto(producto = {}) {
    const stock = Number(producto.stock) || 0;
    const min = Number(producto.stockMinimo) || 5;
    if (stock <= 0) return "agotado";
    if (stock <= min) return "bajo";
    return "disponible";
  }

  static getEstadoLabel(estado) {
    const map = {
      disponible: "Disponible",
      bajo: "Stock Bajo",
      agotado: "Agotado",
    };
    return map[estado] || estado;
  }

  static getEstadoBadgeClass(estado) {
    const map = {
      disponible: "badge--success",
      bajo: "badge--warning",
      agotado: "badge--danger",
    };
    return map[estado] || "badge--neutral";
  }
}
