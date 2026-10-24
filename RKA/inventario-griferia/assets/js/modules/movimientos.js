import { AppCore } from "../core/app-core.js";
import { initializeProtectedPage } from "../core/page-bootstrap.js";
import { ActionSheet } from "../core/action-sheet.js";
import { Validations } from "../core/validations.js";
import { NotificationModal } from "../core/notifications.js";

(async function initMovimientosModule() {
  if (!(await initializeProtectedPage())) return;
  const actionSheet = new ActionSheet();

  let appData = AppCore.loadAppData();
  AppCore.loadSampleDataIfEmpty(appData);

  const tbody = document.getElementById("movimientosTableBody");
  const btnNuevoMovimiento = document.getElementById("btnNuevoMovimiento");
  const searchMovimiento = document.getElementById("searchMovimiento");
  const filterTipoMovimiento = document.getElementById("filterTipoMovimiento");
  const filterFechaMovimiento = document.getElementById("filterFechaMovimiento");
  const modalMovimiento = document.getElementById("modalMovimiento");
  const modalMovimientoCerrar = document.getElementById("modalMovimientoCerrar");
  const btnCancelarMovimiento = document.getElementById("btnCancelarMovimiento");
  const formMovimiento = document.getElementById("formMovimiento");

  function populateProductos() {
    const selectProductoMovimiento = document.getElementById("selectProductoMovimiento");
    if (selectProductoMovimiento) {
      selectProductoMovimiento.innerHTML =
        '<option value="">Seleccionar producto</option>' +
        appData.productos
          .map((p) => `<option value="${p.id}">${p.nombre} (Stock: ${p.stock ?? 0})</option>`)
          .join("");
    }
  }

  function renderMovimientos() {
    if (!tbody) return;
    const todos = [...appData.movimientos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (todos.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7">
          <div class="empty-state">
            <i class="bi bi-arrow-left-right empty-state__icon"></i>
            <p class="empty-state__text">No hay movimientos registrados</p>
          </div>
        </td></tr>`;
      return;
    }

    const term = (searchMovimiento?.value || "").trim().toLowerCase();
    const tipoFiltro = filterTipoMovimiento?.value || "";
    const fechaFiltro = filterFechaMovimiento?.value || "todos";
    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const semana = new Date(hoy);
    semana.setDate(semana.getDate() - 7);
    const mes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

    const movimientos = todos.filter((m) => {
      const producto = appData.productos.find((p) => p.id === m.productoId);
      const texto = [producto?.nombre, m.motivo, m.usuario, m.tipo]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (term && !texto.includes(term)) return false;
      if (tipoFiltro && m.tipo !== tipoFiltro) return false;
      if (fechaFiltro !== "todos") {
        const fecha = new Date(m.fecha);
        if (Number.isNaN(fecha.getTime())) return false;
        if (fechaFiltro === "hoy" && fecha < hoy) return false;
        if (fechaFiltro === "semana" && fecha < semana) return false;
        if (fechaFiltro === "mes" && fecha < mes) return false;
      }
      return true;
    });

    if (movimientos.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7">
          <div class="empty-state">
            <i class="bi bi-search empty-state__icon"></i>
            <p class="empty-state__text">No hay movimientos que coincidan con los filtros</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = movimientos
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
            <td>${m.motivo || ""}</td>
            <td>${m.usuario || "Admin"}</td>
            <td class="table-actions">
              <button class="btn btn-sm btn-primary" data-action="view" data-id="${m.id}"><i class="bi bi-eye"></i> Ver</button>
            </td>
          </tr>`;
      })
      .join("");
  }

  function openModal() {
    populateProductos();
    formMovimiento?.reset();
    modalMovimiento?.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
  }

  function closeModal() {
    modalMovimiento?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
  }

  formMovimiento?.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(formMovimiento);
    const tipo = formData.get("tipo");
    const productoId = formData.get("productoId");
    const cantidad = parseInt(formData.get("cantidad"));
    const motivo = (formData.get("motivo") || "").trim();

    const producto = appData.productos.find((p) => p.id === productoId);
    const movimientoError = Validations.firstError([
      [Validations.required(tipo) && (tipo === "entrada" || tipo === "salida"), "Selecciona un tipo de movimiento válido."],
      [Boolean(producto), "Selecciona un producto válido."],
      [Validations.isPositiveInt(formData.get("cantidad")), "La cantidad debe ser un número entero mayor a 0."],
      [Validations.required(motivo, 3), "El motivo es obligatorio (mínimo 3 caracteres)."],
    ]);
    if (movimientoError) {
      alert(movimientoError);
      return;
    }
    if (tipo === "salida" && cantidad > (producto.stock || 0)) {
      alert("No hay suficiente stock para realizar la salida.");
      return;
    }

    if (tipo === "entrada") {
      producto.stock = (Number(producto.stock) || 0) + cantidad;
    } else {
      producto.stock = (Number(producto.stock) || 0) - cantidad;
    }

    appData.movimientos.push({
      id: AppCore.generateId(),
      fecha: new Date().toISOString(),
      tipo,
      productoId,
      cantidad,
      motivo,
      usuario: "Admin",
    });

    AppCore.saveAppData(appData);
    closeModal();
    renderMovimientos();
    populateProductos();
    document.dispatchEvent(new CustomEvent("dataUpdated"));
  });

  tbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const movimiento = appData.movimientos.find((m) => m.id === id);
    if (!movimiento) return;

    if (action === "view") {
      const producto = appData.productos.find((p) => p.id === movimiento.productoId);
      actionSheet.open({
        title: `${movimiento.tipo === "entrada" ? "Entrada" : "Salida"} - ${producto?.nombre || "N/A"}`,
        fields: [
          { label: "Fecha", value: AppCore.formatDateTime(movimiento.fecha) },
          { label: "Tipo", value: movimiento.tipo === "entrada" ? "Entrada" : "Salida" },
          { label: "Producto", value: producto?.nombre },
          { label: "Cantidad", value: movimiento.cantidad },
          { label: "Motivo", value: movimiento.motivo },
          { label: "Usuario", value: movimiento.usuario || "Admin" },
        ],
        onDelete: async () => {
          const confirmar = await NotificationModal.confirm(
            "¿Eliminar este movimiento? Esto revertirá su efecto sobre el stock.",
            { textoAceptar: "Eliminar" }
          );
          if (confirmar) {
            const p = appData.productos.find((x) => x.id === movimiento.productoId);
            if (p) {
              if (movimiento.tipo === "entrada") {
                p.stock = Math.max(0, (Number(p.stock) || 0) - (Number(movimiento.cantidad) || 0));
              } else {
                p.stock = (Number(p.stock) || 0) + (Number(movimiento.cantidad) || 0);
              }
            }
            appData.movimientos = appData.movimientos.filter((m) => m.id !== id);
            AppCore.saveAppData(appData);
            renderMovimientos();
            populateProductos();
            document.dispatchEvent(new CustomEvent("dataUpdated"));
          }
        },
      });
    }
  });

  btnNuevoMovimiento?.addEventListener("click", openModal);
  modalMovimientoCerrar?.addEventListener("click", closeModal);
  btnCancelarMovimiento?.addEventListener("click", closeModal);

  searchMovimiento?.addEventListener("input", renderMovimientos);
  filterTipoMovimiento?.addEventListener("change", renderMovimientos);
  filterFechaMovimiento?.addEventListener("change", renderMovimientos);

  renderMovimientos();
  populateProductos();
})();
