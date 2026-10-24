import { AppCore } from "../core/app-core.js";
import { initializeProtectedPage } from "../core/page-bootstrap.js";

(async function initDashboardModule() {
  if (!(await initializeProtectedPage())) return;

  let appData = AppCore.loadAppData();
  AppCore.loadSampleDataIfEmpty(appData);

  const totalProductosEl = document.getElementById("totalProductos");
  const totalEntradasEl = document.getElementById("totalEntradas");
  const totalSalidasEl = document.getElementById("totalSalidas");
  const stockBajoEl = document.getElementById("stockBajo");
  const movimientosRecientesTbody = document.getElementById("movimientosRecientes");

  function updateDashboard() {
    const totalProductos = appData.productos.length;

    const totalEntradas = appData.movimientos
      .filter((m) => m.tipo === "entrada")
      .reduce((sum, m) => sum + (Number(m.cantidad) || 0), 0);

    const totalSalidas = appData.movimientos
      .filter((m) => m.tipo === "salida")
      .reduce((sum, m) => sum + (Number(m.cantidad) || 0), 0);

    const stockBajo = appData.productos.filter((p) => {
      const stock = Number(p.stock) || 0;
      const min = Number(p.stockMinimo) || 5;
      return stock > 0 && stock <= min;
    }).length;

    if (totalProductosEl) totalProductosEl.textContent = totalProductos.toString();
    if (totalEntradasEl) totalEntradasEl.textContent = totalEntradas.toString();
    if (totalSalidasEl) totalSalidasEl.textContent = totalSalidas.toString();
    if (stockBajoEl) stockBajoEl.textContent = stockBajo.toString();

    renderMovimientosRecientes();
  }

  function renderMovimientosRecientes() {
    if (!movimientosRecientesTbody) return;

    const recientes = [...appData.movimientos]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 5);

    if (recientes.length === 0) {
      movimientosRecientesTbody.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state">
            <i class="bi bi-journal-text empty-state__icon"></i>
            <p class="empty-state__text">Aún no hay movimientos registrados</p>
          </div>
        </td></tr>`;
      return;
    }

    movimientosRecientesTbody.innerHTML = recientes
      .map((m) => {
        const producto = appData.productos.find((p) => p.id === m.productoId);
        const tipoClass = m.tipo === "entrada" ? "badge--success" : "badge--danger";
        const tipoLabel = m.tipo === "entrada" ? "Entrada" : "Salida";
        return `
          <tr>
            <td>${AppCore.formatDate(m.fecha)}</td>
            <td><span class="badge ${tipoClass}">${tipoLabel}</span></td>
            <td>${producto?.nombre || "N/A"}</td>
            <td>${m.cantidad || 0}</td>
            <td>${m.motivo || "-"}</td>
            <td>${m.usuario || "Admin"}</td>
          </tr>`;
      })
      .join("");
  }

  function renderAlertasReabastecimiento() {
    const body = document.getElementById("alertasReabastecimientoBody");
    if (!body) return;

    const alertas = appData.productos.filter((p) => {
      const estado = AppCore.getEstadoProducto(p);
      return estado === "bajo" || estado === "agotado";
    });

    if (alertas.length === 0) {
      body.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-check-circle empty-state__icon"></i>
          <p class="empty-state__text">No hay productos con stock bajo</p>
        </div>`;
      return;
    }

    body.innerHTML = alertas
      .map((p) => {
        const estado = AppCore.getEstadoProducto(p);
        return `
          <div class="alerta-item">
            <i class="bi bi-exclamation-triangle-fill alerta-item__icon"></i>
            <div class="alerta-item__body">
              <p class="alerta-item__title">${p.nombre || "Sin nombre"}</p>
              <p class="alerta-item__meta">Stock actual: ${p.stock ?? 0} unid. (Mínimo: ${p.stockMinimo ?? 5})</p>
            </div>
            <a href="./productos.html#productos" class="badge badge--danger" style="text-decoration:none; align-self:center;">Urgente</a>
          </div>`;
      })
      .join("");
  }

  function buildVentasChart() {
    const canvas = document.getElementById("ventasChart");
    if (!canvas || typeof Chart === "undefined") return;

    // Últimos 6 meses
    const meses = [];
    const labels = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      meses.push({ year: d.getFullYear(), month: d.getMonth() });
      labels.push(d.toLocaleString("es-ES", { month: "short" }).replace(".", "") + " " + d.getFullYear().toString().slice(2));
    }

    // Contar salidas por mes (se interpreta como ventas)
    const data = meses.map((m) =>
      appData.movimientos
        .filter((mv) => {
          if (mv.tipo !== "salida") return false;
          const d = new Date(mv.fecha);
          return d.getFullYear() === m.year && d.getMonth() === m.month;
        })
        .reduce((sum, mv) => sum + (Number(mv.cantidad) || 0), 0)
    );

    // Destruir gráfico previo si existe
    if (window._ventasChartInstance) {
      window._ventasChartInstance.destroy();
    }

    window._ventasChartInstance = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Unidades vendidas",
            data,
            backgroundColor: "rgba(13, 110, 253, 0.7)",
            borderColor: "#0d6efd",
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: "top" },
          title: { display: false },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Cantidad" } },
          x: { title: { display: true, text: "Mes" } },
        },
      },
    });
  }

  document.addEventListener("dataUpdated", () => {
    appData = AppCore.loadAppData();
    updateDashboard();
    renderAlertasReabastecimiento();
    buildVentasChart();
  });

  updateDashboard();
  renderAlertasReabastecimiento();
  buildVentasChart();
})();
