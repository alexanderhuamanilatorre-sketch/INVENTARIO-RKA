import { AppCore } from "../core/app-core.js";
import { initializeProtectedPage } from "../core/page-bootstrap.js";
import { ActionSheet } from "../core/action-sheet.js";
import { Validations } from "../core/validations.js";
import { NotificationModal } from "../core/notifications.js";

(async function initProductosModule() {
  if (!(await initializeProtectedPage())) return;
  const actionSheet = new ActionSheet();

  let appData = AppCore.loadAppData();
  AppCore.loadSampleDataIfEmpty(appData);

  const tbody = document.getElementById("productosTableBody");
  const btnNuevoProducto = document.getElementById("btnNuevoProducto");
  const searchProducto = document.getElementById("searchProducto");
  const filterCodigoProducto = document.getElementById("filterCodigoProducto");
  const filterCategoriaProducto = document.getElementById("filterCategoriaProducto");
  const filterProveedorProducto = document.getElementById("filterProveedorProducto");

  const modalProducto = document.getElementById("modalProducto");
  const modalProductoCerrar = document.getElementById("modalProductoCerrar");
  const btnCancelarProducto = document.getElementById("btnCancelarProducto");
  const formProducto = document.getElementById("formProducto");
  const modalProductoTitulo = document.getElementById("modalProductoTitulo");

  let editingProductId = null;

  function populateSelects() {
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

  function prefijoCodigo(codigo) {
    return String(codigo || "")
      .trim()
      .toUpperCase()
      .split("-")[0]
      .slice(0, 3);
  }

  function populateFiltros() {
    if (filterCodigoProducto) {
      const actual = filterCodigoProducto.value;
      const prefijos = [
        ...new Set(
          appData.productos
            .map((p) => prefijoCodigo(p.codigo))
            .filter((p) => /^[A-Z0-9]{3}$/.test(p))
        ),
      ].sort();
      filterCodigoProducto.innerHTML =
        '<option value="">Todos los códigos</option>' +
        prefijos.map((p) => `<option value="${p}">${p}</option>`).join("");
      filterCodigoProducto.value = actual;
    }
    if (filterCategoriaProducto) {
      const actual = filterCategoriaProducto.value;
      filterCategoriaProducto.innerHTML =
        '<option value="">Todas las categorías</option>' +
        appData.categorias.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("");
      filterCategoriaProducto.value = actual;
    }
    if (filterProveedorProducto) {
      const actual = filterProveedorProducto.value;
      filterProveedorProducto.innerHTML =
        '<option value="">Todos los proveedores</option>' +
        appData.proveedores.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
      filterProveedorProducto.value = actual;
    }
  }

  function renderProductos() {
    if (!tbody) return;
    if (appData.productos.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state">
            <i class="bi bi-tag empty-state__icon"></i>
            <p class="empty-state__text">No hay productos registrados</p>
          </div>
        </td></tr>`;
      return;
    }

    const term = (searchProducto?.value || "").trim().toLowerCase();
    const codigoFiltro = filterCodigoProducto?.value || "";
    const categoriaId = filterCategoriaProducto?.value || "";
    const proveedorId = filterProveedorProducto?.value || "";
    const productos = appData.productos.filter((p) => {
      const categoria = appData.categorias.find((c) => c.id === p.categoriaId);
      const proveedor = appData.proveedores.find((pr) => pr.id === p.proveedorId);
      const texto = [p.codigo, p.nombre, p.descripcion, categoria?.nombre, proveedor?.nombre]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (term && !texto.includes(term)) return false;
      if (codigoFiltro && prefijoCodigo(p.codigo) !== codigoFiltro) return false;
      if (categoriaId && String(p.categoriaId) !== String(categoriaId)) return false;
      if (proveedorId && String(p.proveedorId) !== String(proveedorId)) return false;
      return true;
    });

    if (productos.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state">
            <i class="bi bi-search empty-state__icon"></i>
            <p class="empty-state__text">No hay productos que coincidan con los filtros</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = productos
      .map((p) => {
        const categoria = appData.categorias.find((c) => c.id === p.categoriaId);
        const proveedor = appData.proveedores.find((pr) => pr.id === p.proveedorId);
        return `
          <tr>
            <td>${p.codigo || ""}</td>
            <td>${p.nombre || ""}</td>
            <td>${categoria?.nombre || ""}</td>
            <td>${AppCore.truncate(p.descripcion || "", 50)}</td>
            <td>${proveedor?.nombre || ""}</td>
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
    formProducto?.reset();
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
    modalProducto?.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
  }

  function closeProductModal() {
    modalProducto?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
    editingProductId = null;
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
      codigo, nombre, categoriaId, proveedorId, stock, stockMinimo, precio, descripcion,
    };

    if (editingProductId) {
      const idx = appData.productos.findIndex((p) => p.id === editingProductId);
      if (idx !== -1) appData.productos[idx] = producto;
    } else {
      appData.productos.push(producto);
    }

    AppCore.saveAppData(appData);
    closeProductModal();
    renderProductos();
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
      const proveedor = appData.proveedores.find((pr) => pr.id === producto.proveedorId);
      actionSheet.open({
        title: producto.nombre,
        fields: [
          { label: "Código", value: producto.codigo },
          { label: "Categoría", value: categoria?.nombre },
          { label: "Proveedor", value: proveedor?.nombre },
          { label: "Stock", value: producto.stock ?? 0 },
          { label: "Precio", value: AppCore.formatCurrency(producto.precio) },
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
            renderProductos();
            document.dispatchEvent(new CustomEvent("dataUpdated"));
          }
        },
      });
    }
  });

  btnNuevoProducto?.addEventListener("click", () => openProductModal());
  modalProductoCerrar?.addEventListener("click", closeProductModal);
  btnCancelarProducto?.addEventListener("click", closeProductModal);

  searchProducto?.addEventListener("input", renderProductos);
  filterCodigoProducto?.addEventListener("change", renderProductos);
  filterCategoriaProducto?.addEventListener("change", renderProductos);
  filterProveedorProducto?.addEventListener("change", renderProductos);

  populateSelects();
  populateFiltros();
  renderProductos();
})();
