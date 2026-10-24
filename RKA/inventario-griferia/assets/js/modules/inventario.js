import { AppCore } from "../core/app-core.js";
import { initializeProtectedPage } from "../core/page-bootstrap.js";
import { ActionSheet } from "../core/action-sheet.js";
import { Validations } from "../core/validations.js";
import { NotificationModal } from "../core/notifications.js";

(async function initInventarioModule() {
  if (!(await initializeProtectedPage())) return;
  const actionSheet = new ActionSheet();

  let appData = AppCore.loadAppData();
  AppCore.loadSampleDataIfEmpty(appData);

  const tbody = document.getElementById("inventarioTableBody");
  const filterCategoria = document.getElementById("filterCategoria");
  const filterEstado = document.getElementById("filterEstado");
  const searchInventario = document.getElementById("searchInventario");
  const btnExportarInventario = document.getElementById("btnExportarInventario");
  const btnAgregarProductoInventario = document.getElementById("btnAgregarProductoInventario");

  const modalProducto = document.getElementById("modalProducto");
  const modalProductoCerrar = document.getElementById("modalProductoCerrar");
  const btnCancelarProducto = document.getElementById("btnCancelarProducto");
  const formProducto = document.getElementById("formProducto");
  const modalProductoTitulo = document.getElementById("modalProductoTitulo");

  const modalAjustarStock = document.getElementById("modalAjustarStock");
  const modalAjustarStockCerrar = document.getElementById("modalAjustarStockCerrar");
  const btnCancelarAjuste = document.getElementById("btnCancelarAjuste");
  const formAjustarStock = document.getElementById("formAjustarStock");

  let editingProductId = null;
  let adjustingProductId = null;

  function populateSelects() {
    if (filterCategoria) {
      const current = filterCategoria.value;
      filterCategoria.innerHTML =
        '<option value="">Todas las categorías</option>' +
        appData.categorias.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("");
      filterCategoria.value = current;
    }

    const selectCategoria = document.getElementById("selectCategoria");
    if (selectCategoria) {
      selectCategoria.innerHTML =
        '<option value="">Seleccionar categoría</option>' +
        appData.categorias.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("");
    }

    const selectProveedor = document.getElementById("selectProveedor");
    if (selectProveedor) {
      selectProveedor.innerHTML =
        '<option value="">Sin proveedor</option>' +
        appData.proveedores.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
    }
  }

  function renderInventario() {
    if (!tbody) return;

    const categoriaFilter = filterCategoria?.value || "";
    const estadoFilter = filterEstado?.value || "";
    const search = (searchInventario?.value || "").toLowerCase();

    let filtered = [...appData.productos];

    if (categoriaFilter) filtered = filtered.filter((p) => p.categoriaId === categoriaFilter);
    if (estadoFilter) filtered = filtered.filter((p) => AppCore.getEstadoProducto(p) === estadoFilter);
    if (search) {
      filtered = filtered.filter(
        (p) =>
          (p.nombre || "").toLowerCase().includes(search) ||
          (p.codigo || "").toLowerCase().includes(search)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="8">
          <div class="empty-state">
            <i class="bi bi-inbox empty-state__icon"></i>
            <p class="empty-state__text">No se encontraron productos</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((p) => {
        const estado = AppCore.getEstadoProducto(p);
        const categoria = appData.categorias.find((c) => c.id === p.categoriaId);
        const badgeClass = AppCore.getEstadoBadgeClass(estado);
        const badgeLabel = AppCore.getEstadoLabel(estado);
        return `
          <tr>
            <td>${p.codigo || ""}</td>
            <td>${p.nombre || ""}</td>
            <td>${categoria?.nombre || ""}</td>
            <td>${p.stock || 0}</td>
            <td>${p.stockMinimo || 5}</td>
            <td>${AppCore.formatCurrency(p.precio)}</td>
            <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
            <td class="table-actions">
              <button class="btn btn-sm btn-primary" data-action="view" data-id="${p.id}"><i class="bi bi-eye"></i> Ver</button>
            </td>
          </tr>`;
      })
      .join("");
  }

  function openProductModal(producto = null) {
    editingProductId = producto ? producto.id : null;
    if (modalProductoTitulo) modalProductoTitulo.textContent = producto ? "Editar Producto" : "Nuevo Producto";

    if (formProducto) {
      formProducto.reset();
      if (producto) {
        document.getElementById("inputCodigo").value = producto.codigo || "";
        document.getElementById("inputNombre").value = producto.nombre || "";
        document.getElementById("selectCategoria").value = producto.categoriaId || "";
        document.getElementById("selectProveedor").value = producto.proveedorId || "";
        document.getElementById("inputStock").value = producto.stock ?? 0;
        document.getElementById("inputStockMinimo").value = producto.stockMinimo ?? 5;
        document.getElementById("inputPrecio").value = producto.precio ?? 0;
        document.getElementById("inputDescripcion").value = producto.descripcion || "";
      } else {
        document.getElementById("inputStock").value = 0;
        document.getElementById("inputStockMinimo").value = 5;
      }
    }

    modalProducto?.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
  }

  function closeProductModal() {
    modalProducto?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
    editingProductId = null;
  }

  function openAdjustModal(producto) {
    if (!producto) return;
    adjustingProductId = producto.id;
    document.getElementById("inputProductoStock").value = producto.nombre || "";
    document.getElementById("inputStockActual").value = (producto.stock ?? 0).toString();
    document.getElementById("selectTipoMovimiento").value = "entrada";
    document.getElementById("inputCantidadMovimiento").value = "";
    document.getElementById("inputMotivoMovimiento").value = "";
    modalAjustarStock?.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
  }

  function closeAdjustModal() {
    modalAjustarStock?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
    adjustingProductId = null;
  }

  formProducto?.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(formProducto);

    const codigo = (formData.get("codigo") || "").trim();
    const nombre = (formData.get("nombre") || "").trim();
    const categoriaId = formData.get("categoriaId");
    const proveedorId = formData.get("proveedorId") || null;
    const stock = parseInt(formData.get("stock")) || 0;
    const stockMinimo = parseInt(formData.get("stockMinimo")) || 5;
    const precio = parseFloat(formData.get("precio")) || 0;
    const descripcion = (formData.get("descripcion") || "").trim();

    const productoError = Validations.firstError([
      [Validations.required(codigo), "El código es obligatorio."],
      [Validations.required(nombre, 3), "El nombre es obligatorio (mínimo 3 caracteres)."],
      [Validations.required(categoriaId), "Selecciona una categoría."],
      [Validations.isNonNegativeInt(formData.get("stock")), "El stock debe ser un número entero mayor o igual a 0."],
      [Validations.isNonNegativeInt(formData.get("stockMinimo")), "El stock mínimo debe ser un número entero mayor o igual a 0."],
      [precio > 0 && Validations.isNonNegativeNumber(formData.get("precio")), "El precio debe ser un número mayor a 0."],
    ]);
    if (productoError) {
      alert(productoError);
      return;
    }

    const producto = {
      id: editingProductId || AppCore.generateId(),
      codigo,
      nombre,
      categoriaId,
      proveedorId,
      stock,
      stockMinimo,
      precio,
      descripcion,
    };

    if (editingProductId) {
      const idx = appData.productos.findIndex((p) => p.id === editingProductId);
      if (idx !== -1) appData.productos[idx] = producto;
    } else {
      appData.productos.push(producto);
    }

    AppCore.saveAppData(appData);
    closeProductModal();
    populateSelects();
    renderInventario();
    document.dispatchEvent(new CustomEvent("dataUpdated"));
  });

  formAjustarStock?.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(formAjustarStock);
    const tipo = formData.get("tipo");
    const cantidad = parseInt(formData.get("cantidad"));
    const motivo = (formData.get("motivo") || "").trim();

    const producto = appData.productos.find((p) => p.id === adjustingProductId);
    if (!producto) {
      closeAdjustModal();
      return;
    }

    const adjustError = Validations.firstError([
      [Validations.isPositiveInt(formData.get("cantidad")), "La cantidad debe ser un número entero mayor a 0."],
      [Validations.required(motivo, 3), "El motivo es obligatorio (mínimo 3 caracteres)."],
    ]);
    if (adjustError) {
      alert(adjustError);
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
      productoId: producto.id,
      cantidad,
      motivo,
      usuario: "Admin",
    });

    AppCore.saveAppData(appData);
    closeAdjustModal();
    renderInventario();
    document.dispatchEvent(new CustomEvent("dataUpdated"));
  });

  tbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const producto = appData.productos.find((p) => p.id === id);
    if (!producto) return;

    if (action === "view") {
      const categoria = appData.categorias.find((c) => c.id === producto.categoriaId);
      actionSheet.open({
        title: producto.nombre,
        fields: [
          { label: "Código", value: producto.codigo },
          { label: "Categoría", value: categoria?.nombre },
          { label: "Stock", value: producto.stock ?? 0 },
          { label: "Stock Mínimo", value: producto.stockMinimo ?? 5 },
          { label: "Precio", value: AppCore.formatCurrency(producto.precio) },
          { label: "Estado", value: AppCore.getEstadoLabel(AppCore.getEstadoProducto(producto)) },
          { label: "Descripción", value: producto.descripcion },
        ],
        onEdit: () => openProductModal(producto),
        onDelete: async () => {
          const confirmar = await NotificationModal.confirm(
            `¿Eliminar el producto "${producto.nombre}"?`,
            { textoAceptar: "Eliminar" }
          );
          if (confirmar) {
            appData.productos = appData.productos.filter((p) => p.id !== id);
            AppCore.saveAppData(appData);
            renderInventario();
            document.dispatchEvent(new CustomEvent("dataUpdated"));
          }
        },
      });
    }
  });

  btnExportarInventario?.addEventListener("click", () => {
    let csv = "Código,Nombre,Categoría,Stock,Stock Mínimo,Precio,Estado\n";
    appData.productos.forEach((p) => {
      const categoria = appData.categorias.find((c) => c.id === p.categoriaId);
      const estado = AppCore.getEstadoProducto(p);
      csv += `${AppCore.escapeCSV(p.codigo)},${AppCore.escapeCSV(p.nombre)},${AppCore.escapeCSV(categoria?.nombre || "")},${p.stock || 0},${p.stockMinimo || 0},${p.precio || 0},${estado}\n`;
    });
    AppCore.downloadCSV(csv, "inventario.csv");
  });

  btnAgregarProductoInventario?.addEventListener("click", () => openProductModal());
  modalProductoCerrar?.addEventListener("click", closeProductModal);
  btnCancelarProducto?.addEventListener("click", closeProductModal);
  modalAjustarStockCerrar?.addEventListener("click", closeAdjustModal);
  btnCancelarAjuste?.addEventListener("click", closeAdjustModal);
  filterCategoria?.addEventListener("change", renderInventario);
  filterEstado?.addEventListener("change", renderInventario);
  searchInventario?.addEventListener("input", renderInventario);

  document.addEventListener("globalSearch", (e) => {
    if (searchInventario) {
      searchInventario.value = e.detail.term || "";
      renderInventario();
    }
  });

  populateSelects();
  renderInventario();
})();
