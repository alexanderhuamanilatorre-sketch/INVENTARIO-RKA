import { AppCore } from "../core/app-core.js";
import { initializeProtectedPage } from "../core/page-bootstrap.js";

(async function initReportesModule() {
  if (!(await initializeProtectedPage())) return;

  let appData = AppCore.loadAppData();
  AppCore.loadSampleDataIfEmpty(appData);

  const filterMarca = document.getElementById("filterMarca");
  const btnExportarExcel = document.getElementById("btnExportarExcel");
  const btnExportarPDF = document.getElementById("btnExportarPDF");

  let chartVentasInstance = null;
  let chartInventarioInstance = null;
  let tipoReporteActual = "ventas";

  // ---------------------------------------------------------------
  // Poblado de marcas en el filtro
  // ---------------------------------------------------------------
  function populateMarcas() {
    if (!filterMarca) return;
    const categorias = appData.categorias || [];
    filterMarca.innerHTML =
      '<option value="todas">Todas</option>' +
      categorias
        .map((c) => `<option value="${c.id}">${c.nombre}</option>`)
        .join("");
  }

  // ---------------------------------------------------------------
  // Cambio de tipo de reporte
  // ---------------------------------------------------------------
  function mostrarReporte(tipo) {
    tipoReporteActual = tipo;

    document.querySelectorAll(".reporte-card").forEach((c) => {
      c.classList.toggle("reporte-card--active", c.dataset.tipo === tipo);
    });

    // Ocultar todas las vistas
    document.querySelectorAll(".reporte-vista").forEach((v) => {
      v.classList.remove("is-active");
      v.style.display = "none";
    });

    // Mostrar la vista seleccionada
    const vista = document.getElementById(`vista${capitalize(tipo)}`);
    if (vista) {
      vista.style.display = "flex";
      vista.classList.add("is-active");
    }

    // Renderizar contenido según el tipo
    if (tipo === "ventas") {
      renderVentas();
    } else if (tipo === "inventario") {
      renderInventario();
    } else if (tipo === "movimientos") {
      renderMovimientos();
    } else if (tipo === "ranking") {
      renderRanking();
    }
  }

  function setupReporteCards() {
    document.querySelectorAll(".reporte-card").forEach((card) => {
      card.addEventListener("click", () => mostrarReporte(card.dataset.tipo));
    });
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ---------------------------------------------------------------
  // REPORTE DE VENTAS
  // ---------------------------------------------------------------
  // Una venta real tiene número de venta asignado; las ventas antiguas se
  // reconocen por su motivo "Venta". Así evitamos contar ajustes u otras
  // salidas de inventario como ventas.
  function esVenta(movimiento) {
    if (!movimiento) return false;
    if (movimiento.numeroVenta !== undefined && movimiento.numeroVenta !== null) {
      return true;
    }
    if (movimiento.tipo !== "salida") return false;
    return String(movimiento.motivo || "").trim().toLowerCase() === "venta";
  }

  function getDatosGraficoVentas() {
    const now = new Date();
    const meses = [];
    const labels = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      meses.push({ year: d.getFullYear(), month: d.getMonth() });
      labels.push(d.toLocaleString("es-ES", { month: "short" }).replace(".", ""));
    }

    const valores = meses.map((m) =>
      appData.movimientos
        .filter((mv) => {
          if (!esVenta(mv)) return false;
          const d = new Date(mv.fecha);
          return d.getFullYear() === m.year && d.getMonth() === m.month;
        })
        .reduce((sum, mv) => {
          const producto = appData.productos.find((p) => p.id === mv.productoId);
          const precio = Number(producto?.precio) || 0;
          return sum + (Number(mv.cantidad) || 0) * precio;
        }, 0)
    );

    return { labels, valores };
  }

  function getDatosTablaVentas() {
    const categorias = appData.categorias || [];
    const productos = appData.productos || [];
    const movimientos = appData.movimientos || [];

    const datos = categorias.map((cat) => {
      const productosCat = productos.filter((p) => p.categoriaId === cat.id);
      const movimientosCat = movimientos.filter((mv) => {
        if (!esVenta(mv)) return false;
        return productosCat.some((p) => p.id === mv.productoId);
      });

      const unidades = movimientosCat.reduce((sum, mv) => sum + (Number(mv.cantidad) || 0), 0);
      const ingreso = movimientosCat.reduce((sum, mv) => {
        const producto = productos.find((p) => p.id === mv.productoId);
        const precio = Number(producto?.precio) || 0;
        return sum + (Number(mv.cantidad) || 0) * precio;
      }, 0);

      return { categoria: cat.nombre, unidades, ingreso, porcentaje: 0 };
    });

    const totalIngreso = datos.reduce((sum, d) => sum + d.ingreso, 0);
    datos.forEach((d) => {
      d.porcentaje = totalIngreso > 0 ? Math.round((d.ingreso / totalIngreso) * 100) : 0;
    });

    return datos.filter((d) => d.unidades > 0);
  }

  function renderVentas() {
    renderGraficoVentas();
    renderTablaVentas();
  }

  function renderGraficoVentas() {
    const canvas = document.getElementById("reportesChartVentas");
    if (!canvas || typeof Chart === "undefined") return;

    const datos = getDatosGraficoVentas();

    if (chartVentasInstance) {
      chartVentasInstance.destroy();
    }

    chartVentasInstance = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: datos.labels,
        datasets: [{
          label: "Ventas Totales",
          data: datos.valores,
          backgroundColor: "rgba(13, 148, 136, 0.75)",
          borderColor: "#0d9488",
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `S/ ${context.parsed.y.toLocaleString("es-PE")}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => `S/ ${value / 1000}k` },
            grid: { color: "rgba(16, 24, 40, 0.05)" },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }

  function renderTablaVentas() {
    const tbody = document.getElementById("reportesTableBodyVentas");
    if (!tbody) return;
    const datos = getDatosTablaVentas();

    if (datos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="bi bi-inbox empty-state__icon"></i><p class="empty-state__text">No hay datos para mostrar</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = datos.map((d) => `
      <tr>
        <td>${d.categoria}</td>
        <td>${d.unidades}</td>
        <td>${AppCore.formatCurrency(d.ingreso)}</td>
        <td>${d.porcentaje}%</td>
      </tr>`).join("");
  }

  // ---------------------------------------------------------------
  // REPORTE DE INVENTARIO
  // ---------------------------------------------------------------
  function getDatosInventario() {
    const productos = appData.productos || [];
    const categorias = appData.categorias || [];

    const valorTotal = productos.reduce((sum, p) => {
      const precio = Number(p.precio) || 0;
      const stock = Number(p.stock) || 0;
      return sum + precio * stock;
    }, 0);

    const totalUnidades = productos.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);

    const stockBajo = productos.filter((p) => {
      const stock = Number(p.stock) || 0;
      const min = Number(p.stockMinimo) || 5;
      return stock <= min;
    }).length;

    // Valor por categoría para el gráfico de dona
    const valorPorCategoria = categorias.map((cat) => {
      const productosCat = productos.filter((p) => p.categoriaId === cat.id);
      const valor = productosCat.reduce((sum, p) => {
        const precio = Number(p.precio) || 0;
        const stock = Number(p.stock) || 0;
        return sum + precio * stock;
      }, 0);
      return { categoria: cat.nombre, valor };
    }).filter((d) => d.valor > 0);

    return { valorTotal, totalUnidades, stockBajo, valorPorCategoria };
  }

  function getTablaInventario() {
    const productos = appData.productos || [];
    const categorias = appData.categorias || [];

    return productos.map((p) => {
      const categoria = categorias.find((c) => c.id === p.categoriaId);
      const precio = Number(p.precio) || 0;
      const stock = Number(p.stock) || 0;
      const min = Number(p.stockMinimo) || 5;
      const valorizacion = precio * stock;

      let estado, estadoClass;
      if (stock <= 0) {
        estado = "Agotado";
        estadoClass = "badge--danger";
      } else if (stock <= min) {
        estado = "Crítico";
        estadoClass = "badge--danger";
      } else if (stock <= min * 2) {
        estado = "Reorden";
        estadoClass = "badge--warning";
      } else {
        estado = "Óptimo";
        estadoClass = "badge--success";
      }

      return {
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: categoria?.nombre || "N/A",
        stock,
        costoUnitario: precio,
        valorizacion,
        estado,
        estadoClass,
      };
    });
  }

  function renderInventario() {
    renderKPIsInventario();
    renderGraficoInventario();
    renderTablaInventario();
  }

  function renderKPIsInventario() {
    const datos = getDatosInventario();
    const elValor = document.getElementById("invValorTotal");
    const elUnidades = document.getElementById("invTotalUnidades");
    const elStockBajo = document.getElementById("invStockBajo");

    if (elValor) elValor.textContent = AppCore.formatCurrency(datos.valorTotal);
    if (elUnidades) elUnidades.textContent = datos.totalUnidades.toLocaleString("es-PE");
    if (elStockBajo) elStockBajo.textContent = datos.stockBajo;
  }

  function renderGraficoInventario() {
    const canvas = document.getElementById("reportesChartInventario");
    if (!canvas || typeof Chart === "undefined") return;

    const datos = getDatosInventario().valorPorCategoria;

    if (chartInventarioInstance) {
      chartInventarioInstance.destroy();
    }

    const colores = [
      "rgba(13, 148, 136, 0.85)",
      "rgba(16, 185, 129, 0.85)",
      "rgba(13, 110, 253, 0.85)",
      "rgba(245, 158, 11, 0.85)",
      "rgba(139, 92, 246, 0.85)",
      "rgba(239, 68, 68, 0.85)",
    ];

    chartInventarioInstance = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: datos.map((d) => d.categoria),
        datasets: [{
          data: datos.map((d) => d.valor),
          backgroundColor: colores,
          borderWidth: 2,
          borderColor: "#ffffff",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              padding: 16,
              usePointStyle: true,
              pointStyle: "circle",
              font: { size: 12 },
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
                return ` ${context.label}: S/ ${context.parsed.toLocaleString("es-PE")} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  function renderTablaInventario() {
    const tbody = document.getElementById("reportesTableBodyInventario");
    if (!tbody) return;
    const datos = getTablaInventario();

    if (datos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="bi bi-inbox empty-state__icon"></i><p class="empty-state__text">No hay datos para mostrar</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = datos.map((d) => `
      <tr>
        <td>${d.codigo}</td>
        <td>${d.nombre}</td>
        <td>${d.categoria}</td>
        <td>${d.stock}</td>
        <td>${AppCore.formatCurrency(d.costoUnitario)}</td>
        <td>${AppCore.formatCurrency(d.valorizacion)}</td>
        <td><span class="badge ${d.estadoClass}">${d.estado}</span></td>
      </tr>`).join("");
  }

  // ---------------------------------------------------------------
  // REPORTE DE MOVIMIENTOS
  // ---------------------------------------------------------------
  function renderMovimientos() {
    const tbody = document.getElementById("reportesTableBodyMovimientos");
    if (!tbody) return;

    const movimientos = [...appData.movimientos]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (movimientos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-inbox empty-state__icon"></i><p class="empty-state__text">No hay movimientos registrados</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = movimientos.map((m) => {
      const producto = appData.productos.find((p) => p.id === m.productoId);
      const tipoClass = m.tipo === "entrada" ? "badge--success" : "badge--danger";
      const tipoLabel = m.tipo === "entrada" ? "Entrada" : "Salida";
      return `
        <tr>
          <td>${AppCore.formatDate(m.fecha)}</td>
          <td><span class="badge ${tipoClass}">${tipoLabel}</span></td>
          <td>${producto?.nombre || "N/A"}</td>
          <td>${m.cantidad}</td>
          <td>${m.motivo || "-"}</td>
          <td>${m.usuario || "Admin"}</td>
        </tr>`;
    }).join("");
  }

  // ---------------------------------------------------------------
  // REPORTE DE RANKING
  // ---------------------------------------------------------------
  function renderRanking() {
    const tbody = document.getElementById("reportesTableBodyRanking");
    if (!tbody) return;

    const productos = appData.productos || [];
    const categorias = appData.categorias || [];
    const movimientos = appData.movimientos.filter(esVenta);

    const ranking = productos.map((p) => {
      const ventas = movimientos.filter((m) => m.productoId === p.id);
      const unidades = ventas.reduce((sum, m) => sum + (Number(m.cantidad) || 0), 0);
      const ingreso = ventas.reduce((sum, m) => sum + (Number(m.cantidad) || 0) * (Number(p.precio) || 0), 0);
      const categoria = categorias.find((c) => c.id === p.categoriaId);
      return {
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: categoria?.nombre || "N/A",
        unidades,
        ingreso,
      };
    }).filter((p) => p.unidades > 0).sort((a, b) => b.unidades - a.unidades);

    if (ranking.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-inbox empty-state__icon"></i><p class="empty-state__text">No hay datos para mostrar</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = ranking.map((p, i) => `
      <tr>
        <td><span class="badge ${i < 3 ? "badge--success" : "badge--neutral"}">#${i + 1}</span></td>
        <td>${p.codigo}</td>
        <td>${p.nombre}</td>
        <td>${p.categoria}</td>
        <td>${p.unidades}</td>
        <td>${AppCore.formatCurrency(p.ingreso)}</td>
      </tr>`).join("");
  }

  // ---------------------------------------------------------------
  // Exportación
  // ---------------------------------------------------------------
  function exportarExcel() {
    let csv = "";
    if (tipoReporteActual === "ventas") {
      csv = "Categoría,Unidades Vendidas,Ingreso Estimado,Porcentaje\n";
      getDatosTablaVentas().forEach((d) => { csv += `${d.categoria},${d.unidades},${d.ingreso},${d.porcentaje}%\n`; });
    } else if (tipoReporteActual === "inventario") {
      csv = "Código,Producto,Categoría,Stock,Costo Unitario,Valorización,Estado\n";
      getTablaInventario().forEach((d) => { csv += `${d.codigo},${d.nombre},${d.categoria},${d.stock},${d.costoUnitario},${d.valorizacion},${d.estado}\n`; });
    }
    AppCore.downloadCSV(csv, `reporte_${tipoReporteActual}.csv`);
  }

  function exportarPDF() {
    alert("La exportación a PDF estará disponible próximamente.\nUse 'Exportar Excel' para descargar los datos.");
  }

  // ---------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------
  btnExportarExcel?.addEventListener("click", exportarExcel);
  btnExportarPDF?.addEventListener("click", exportarPDF);

  document.addEventListener("dataUpdated", () => {
    appData = AppCore.loadAppData();
    populateMarcas();
    mostrarReporte(tipoReporteActual);
  });

  // ---------------------------------------------------------------
  // Inicialización
  // ---------------------------------------------------------------
  populateMarcas();
  setupReporteCards();
  mostrarReporte("ventas");
})();
