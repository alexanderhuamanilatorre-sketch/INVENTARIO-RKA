import { AppCore } from "../core/app-core.js";
import { initializeProtectedPage } from "../core/page-bootstrap.js";
import { ActionSheet } from "../core/action-sheet.js";
import { Validations } from "../core/validations.js";
import { NotificationModal } from "../core/notifications.js";

(async function initProveedoresModule() {
  if (!(await initializeProtectedPage())) return;
  const actionSheet = new ActionSheet();

  let appData = AppCore.loadAppData();
  AppCore.loadSampleDataIfEmpty(appData);

  const tbody = document.getElementById("proveedoresTableBody");
  const btnNuevoProveedor = document.getElementById("btnNuevoProveedor");
  const modalProveedor = document.getElementById("modalProveedor");
  const modalProveedorCerrar = document.getElementById("modalProveedorCerrar");
  const btnCancelarProveedor = document.getElementById("btnCancelarProveedor");
  const formProveedor = document.getElementById("formProveedor");
  const modalProveedorTitulo = document.getElementById("modalProveedorTitulo");

  let editingId = null;

  function renderProveedores() {
    if (!tbody) return;
    if (appData.proveedores.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7">
          <div class="empty-state">
            <i class="bi bi-truck empty-state__icon"></i>
            <p class="empty-state__text">No hay proveedores registrados</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = appData.proveedores
      .map((p) => `
        <tr>
          <td>${p.nombre}</td>
          <td>${p.ruc || ""}</td>
          <td>${p.contacto || ""}</td>
          <td>${p.telefono || ""}</td>
          <td>${p.email || ""}</td>
          <td>${p.direccion || ""}</td>
          <td class="table-actions">
            <button class="btn btn-sm btn-primary" data-action="view" data-id="${p.id}"><i class="bi bi-eye"></i> Ver</button>
          </td>
        </tr>`)
      .join("");
  }

  function openModal(proveedor = null) {
    editingId = proveedor ? proveedor.id : null;
    if (modalProveedorTitulo) modalProveedorTitulo.textContent = proveedor ? "Editar Proveedor" : "Nuevo Proveedor";
    formProveedor?.reset();
    if (proveedor) {
      document.getElementById("inputNombreProveedor").value = proveedor.nombre || "";
      document.getElementById("inputRucProveedor").value = proveedor.ruc || "";
      document.getElementById("inputContactoProveedor").value = proveedor.contacto || "";
      document.getElementById("inputTelefonoProveedor").value = proveedor.telefono || "";
      document.getElementById("inputEmailProveedor").value = proveedor.email || "";
      document.getElementById("inputDireccionProveedor").value = proveedor.direccion || "";
    }
    modalProveedor?.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
  }

  function closeModal() {
    modalProveedor?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
    editingId = null;
  }

  formProveedor?.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(formProveedor);
    const nombre = (formData.get("nombre") || "").trim();
    const ruc = (formData.get("ruc") || "").trim();
    const contacto = (formData.get("contacto") || "").trim();
    const telefono = (formData.get("telefono") || "").trim();
    const email = (formData.get("email") || "").trim();
    const direccion = (formData.get("direccion") || "").trim();

    const error = Validations.firstError([
      [Validations.required(nombre, 3), "El nombre del proveedor es obligatorio (mínimo 3 caracteres)."],
      [Validations.isRUC(ruc), "El RUC debe tener exactamente 11 dígitos."],
      [Validations.required(contacto), "El contacto es obligatorio."],
      [Validations.isPhone(telefono), "El teléfono debe tener entre 7 y 15 dígitos."],
      [!email || Validations.isEmail(email), "El email no tiene un formato válido."],
    ]);
    if (error) {
      alert(error);
      return;
    }

    const proveedor = { id: editingId || AppCore.generateId(), nombre, ruc, contacto, telefono, email, direccion };

    if (editingId) {
      const idx = appData.proveedores.findIndex((p) => p.id === editingId);
      if (idx !== -1) appData.proveedores[idx] = proveedor;
    } else {
      appData.proveedores.push(proveedor);
    }

    AppCore.saveAppData(appData);
    closeModal();
    renderProveedores();
    document.dispatchEvent(new CustomEvent("dataUpdated"));
  });

  tbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const proveedor = appData.proveedores.find((p) => p.id === id);
    if (!proveedor) return;

    if (action === "view") {
      actionSheet.open({
        title: proveedor.nombre,
        fields: [
          { label: "RUC", value: proveedor.ruc },
          { label: "Contacto", value: proveedor.contacto },
          { label: "Teléfono", value: proveedor.telefono },
          { label: "Email", value: proveedor.email },
          { label: "Dirección", value: proveedor.direccion },
        ],
        onEdit: () => openModal(proveedor),
        onDelete: async () => {
          const confirmar = await NotificationModal.confirm(
            `¿Eliminar el proveedor "${proveedor.nombre}"?`,
            { textoAceptar: "Eliminar" }
          );
          if (confirmar) {
            appData.proveedores = appData.proveedores.filter((p) => p.id !== id);
            AppCore.saveAppData(appData);
            renderProveedores();
            document.dispatchEvent(new CustomEvent("dataUpdated"));
          }
        },
      });
    }
  });

  btnNuevoProveedor?.addEventListener("click", () => openModal());
  modalProveedorCerrar?.addEventListener("click", closeModal);
  btnCancelarProveedor?.addEventListener("click", closeModal);

  renderProveedores();
})();
