import { AppCore } from "../core/app-core.js";
import { initializeProtectedPage } from "../core/page-bootstrap.js";
import { Validations } from "../core/validations.js";

(async function initVentasModule() {
  if (!(await initializeProtectedPage())) return;

  let appData = AppCore.loadAppData();
  AppCore.loadSampleDataIfEmpty(appData);

  const ventasHoyEl = document.getElementById("ventasHoy");
  const ventasHoyHintEl = document.getElementById("ventasHoyHint");
  const ventasSemanaEl = document.getElementById("ventasSemana");
  const ventasSemanaHintEl = document.getElementById("ventasSemanaHint");
  const ventasMesEl = document.getElementById("ventasMes");
  const ventasMesHintEl = document.getElementById("ventasMesHint");
  const tbody = document.getElementById("ventasTableBody");
  const searchInput = document.getElementById("searchVenta");
  const filterFecha = document.getElementById("filterFecha");
  const filterMetodo = document.getElementById("filterMetodo");
  const filterEstado = document.getElementById("filterEstado");
  const btnNuevaVenta = document.getElementById("btnNuevaVenta");
  const modalVenta = document.getElementById("modalVenta");
  const modalVentaCerrar = document.getElementById("modalVentaCerrar");
  const btnCancelarVenta = document.getElementById("btnCancelarVenta");
  const formVenta = document.getElementById("formVenta");
  const selectProductoVenta = document.getElementById("selectProductoVenta");

  // ---------------------------------------------------------------
  // Derivación de ventas desde movimientos de salida + productos
  // ---------------------------------------------------------------
  function esVenta(movimiento) {
    if (!movimiento) return false;
    if (movimiento.numeroVenta !== undefined && movimiento.numeroVenta !== null) {
      return true;
    }
    if (movimiento.tipo !== "salida") return false;
    if (movimiento.origen === "venta" || movimiento.esVenta === true) return true;
    return String(movimiento.motivo || "").trim().toLowerCase() === "venta";
  }

  function getVentas() {
    const base = appData.movimientos
      .map((movimiento, orden) => ({ movimiento, orden }))
      .filter(({ movimiento }) => esVenta(movimiento));

    const conNumero = [];
    const sinNumero = [];
    for (const item of base) {
      const numero = Number(item.movimiento.numeroVenta);
      if (Number.isFinite(numero) && numero > 0) {
        conNumero.push({ ...item, numeroVenta: numero });
      } else {
        sinNumero.push(item);
      }
    }

    // Compatibilidad con ventas antiguas guardadas antes de la numeración.
    let maximo = conNumero.reduce((max, item) => Math.max(max, item.numeroVenta), 0);
    sinNumero
      .sort((a, b) => {
        const fechaA = new Date(a.movimiento.fecha).getTime() || 0;
        const fechaB = new Date(b.movimiento.fecha).getTime() || 0;
        return fechaA - fechaB || a.orden - b.orden;
      })
      .forEach((item) => {
        maximo += 1;
        conNumero.push({ ...item, numeroVenta: maximo });
      });

    return conNumero
      .sort((a, b) => b.numeroVenta - a.numeroVenta)
      .map(({ movimiento, numeroVenta }) => {
        const producto = appData.productos.find((p) => p.id === movimiento.productoId);
        const precio = Number(producto?.precio) || 0;
        const cantidad = Number(movimiento.cantidad) || 0;
        return {
          id: movimiento.id,
          numeroVenta,
          fecha: movimiento.fecha,
          producto: producto?.nombre || "N/A",
          cantidad,
          monto: cantidad * precio,
          cliente: "Cliente General",
          metodoPago: "Efectivo",
          estado: "Completado",
        };
      });
  }

  function siguienteNumeroVenta() {
    return getVentas().reduce((max, venta) => Math.max(max, venta.numeroVenta), 0) + 1;
  }

  // ---------------------------------------------------------------
  // KPIs calculados desde datos reales
  // ---------------------------------------------------------------
  function calcularKPIs(ventas) {
    const now = new Date();
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const semana = new Date(hoy);
    semana.setDate(semana.getDate() - 7);
    const mes = new Date(now.getFullYear(), now.getMonth(), 1);

    const ventasHoy = ventas.filter((v) => new Date(v.fecha) >= hoy);
    const ventasSemana = ventas.filter((v) => new Date(v.fecha) >= semana);
    const ventasMes = ventas.filter((v) => new Date(v.fecha) >= mes);

    const sumHoy = ventasHoy.reduce((s, v) => s + v.monto, 0);
    const sumSemana = ventasSemana.reduce((s, v) => s + v.monto, 0);
    const sumMes = ventasMes.reduce((s, v) => s + v.monto, 0);

    // Avance semanal vs semana anterior
    const semanaAnterior = new Date(semana);
    semanaAnterior.setDate(semanaAnterior.getDate() - 7);
    const sumSemanaAnterior = ventas
      .filter((v) => {
        const f = new Date(v.fecha);
        return f >= semanaAnterior && f < semana;
      })
      .reduce((s, v) => s + v.monto, 0);
    const avance = sumSemanaAnterior > 0
      ? ((sumSemana - sumSemanaAnterior) / sumSemanaAnterior) * 100
      : (sumSemana > 0 ? 100 : 0);

    return {
      sumHoy,
      countHoy: ventasHoy.length,
      sumSemana,
      avance,
      sumMes,
    };
  }

  function renderKPIs(ventas) {
    const kpis = calcularKPIs(ventas);
    if (ventasHoyEl) ventasHoyEl.textContent = AppCore.formatCurrency(kpis.sumHoy);
    if (ventasHoyHintEl) ventasHoyHintEl.textContent = `${kpis.countHoy} transaccione${kpis.countHoy === 1 ? "" : "s"}`;
    if (ventasSemanaEl) ventasSemanaEl.textContent = AppCore.formatCurrency(kpis.sumSemana);
    if (ventasSemanaHintEl) {
      const signo = kpis.avance >= 0 ? "+" : "";
      ventasSemanaHintEl.textContent = `${signo}${kpis.avance.toFixed(1)}% de avance`;
    }
    if (ventasMesEl) ventasMesEl.textContent = AppCore.formatCurrency(kpis.sumMes);
    if (ventasMesHintEl) ventasMesHintEl.textContent = "Progreso de metas de facturación";
  }

  // ---------------------------------------------------------------
  // Tabla con filtros
  // ---------------------------------------------------------------
  function getVentasFiltradas() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const fecha = filterFecha?.value || "todos";
    const metodo = filterMetodo?.value || "todos";
    const estado = filterEstado?.value || "todos";

    const now = new Date();
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const semana = new Date(hoy);
    semana.setDate(semana.getDate() - 7);
    const mes = new Date(now.getFullYear(), now.getMonth(), 1);

    return getVentas().filter((v) => {
      if (term) {
        const hay = `#${v.numeroVenta} ${v.cliente} ${v.producto}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (fecha !== "todos") {
        const f = new Date(v.fecha);
        if (fecha === "hoy" && f < hoy) return false;
        if (fecha === "semana" && f < semana) return false;
        if (fecha === "mes" && f < mes) return false;
      }
      if (metodo !== "todos" && v.metodoPago !== metodo) return false;
      if (estado !== "todos" && v.estado !== estado) return false;
      return true;
    });
  }

  function renderTabla() {
    if (!tbody) return;
    const ventas = getVentasFiltradas();

    if (ventas.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="8">
          <div class="empty-state">
            <i class="bi bi-cart-x empty-state__icon"></i>
            <p class="empty-state__text">No hay ventas registradas</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = ventas
      .map((v) => {
        const estadoClass = v.estado === "Completado" ? "badge--success" : "badge--warning";
        const estadoLabel = v.estado === "Completado" ? "Completado" : "Pendiente";
        return `
          <tr>
            <td>#${v.numeroVenta}</td>
            <td>${AppCore.formatDate(v.fecha)}</td>
            <td>${v.cliente}</td>
            <td>${v.producto}</td>
            <td>${v.cantidad}</td>
            <td>${AppCore.formatCurrency(v.monto)}</td>
            <td>${v.metodoPago}</td>
            <td><span class="badge ${estadoClass}">${estadoLabel}</span></td>
          </tr>`;
      })
      .join("");
  }

  // ---------------------------------------------------------------
  // Modal Nueva Venta
  // ---------------------------------------------------------------
  function populateProductos() {
    if (!selectProductoVenta) return;
    selectProductoVenta.innerHTML =
      '<option value="">Seleccionar producto</option>' +
      appData.productos
        .map((p) => `<option value="${p.id}">${p.nombre} (Stock: ${p.stock ?? 0})</option>`)
        .join("");
  }

  function openModal() {
    populateProductos();
    formVenta?.reset();
    modalVenta?.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
  }

  function closeModal() {
    modalVenta?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
  }

  formVenta?.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(formVenta);
    const productoId = formData.get("productoId");
    const cantidad = parseInt(formData.get("cantidad"), 10);

    const producto = appData.productos.find((p) => p.id === productoId);
    const error = Validations.firstError([
      [Boolean(producto), "Selecciona un producto válido."],
      [Validations.isPositiveInt(formData.get("cantidad")), "La cantidad debe ser un número entero mayor a 0."],
    ]);
    if (error) {
      alert(error);
      return;
    }
    if (cantidad > (producto.stock || 0)) {
      alert("No hay suficiente stock para realizar la venta.");
      return;
    }

    producto.stock = (Number(producto.stock) || 0) - cantidad;

    appData.movimientos.push({
      id: AppCore.generateId(),
      numeroVenta: siguienteNumeroVenta(),
      fecha: new Date().toISOString(),
      tipo: "salida",
      productoId,
      cantidad,
      motivo: "Venta",
      origen: "venta",
      usuario: "Admin",
    });

    AppCore.saveAppData(appData);
    closeModal();
    renderKPIs(getVentas());
    renderTabla();
    populateProductos();
    document.dispatchEvent(new CustomEvent("dataUpdated"));
  });

  // ---------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------
  searchInput?.addEventListener("input", renderTabla);
  filterFecha?.addEventListener("change", renderTabla);
  filterMetodo?.addEventListener("change", renderTabla);
  filterEstado?.addEventListener("change", renderTabla);
  btnNuevaVenta?.addEventListener("click", openModal);
  modalVentaCerrar?.addEventListener("click", closeModal);
  btnCancelarVenta?.addEventListener("click", closeModal);

  document.addEventListener("dataUpdated", () => {
    appData = AppCore.loadAppData();
    renderKPIs(getVentas());
    renderTabla();
  });

  // ---------------------------------------------------------------
  // Inicialización
  // ---------------------------------------------------------------
  renderKPIs(getVentas());
  renderTabla();
})();
