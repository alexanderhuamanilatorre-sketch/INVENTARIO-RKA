import { AppCore } from "../core/app-core.js";
import { initializeProtectedPage } from "../core/page-bootstrap.js";
import { ActionSheet } from "../core/action-sheet.js";
import { Validations } from "../core/validations.js";
import { NotificationModal } from "../core/notifications.js";

(async function initClientesModule() {
  if (!(await initializeProtectedPage())) return;
  const actionSheet = new ActionSheet();

  let appData = AppCore.loadAppData();
  AppCore.loadSampleDataIfEmpty(appData);

  const tbody = document.getElementById("clientesTableBody");
  const btnNuevoCliente = document.getElementById("btnNuevoCliente");
  const modalCliente = document.getElementById("modalCliente");
  const modalClienteCerrar = document.getElementById("modalClienteCerrar");
  const btnCancelarCliente = document.getElementById("btnCancelarCliente");
  const formCliente = document.getElementById("formCliente");
  const modalClienteTitulo = document.getElementById("modalClienteTitulo");

  let editingId = null;

  function renderClientes() {
    if (!tbody) return;
    if (appData.clientes.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state">
            <i class="bi bi-people empty-state__icon"></i>
            <p class="empty-state__text">No hay clientes registrados</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = appData.clientes
      .map((c) => `
        <tr>
          <td>${c.nombre}</td>
          <td>${c.contacto || ""}</td>
          <td>${c.telefono || ""}</td>
          <td>${c.email || ""}</td>
          <td>${c.direccion || ""}</td>
          <td class="table-actions">
            <button class="btn btn-sm btn-primary" data-action="view" data-id="${c.id}"><i class="bi bi-eye"></i> Ver</button>
          </td>
        </tr>`)
      .join("");
  }

  function openModal(cliente = null) {
    editingId = cliente ? cliente.id : null;
    if (modalClienteTitulo) modalClienteTitulo.textContent = cliente ? "Editar Cliente" : "Nuevo Cliente";
    formCliente?.reset();
    if (cliente) {
      document.getElementById("inputNombreCliente").value = cliente.nombre || "";
      document.getElementById("inputContactoCliente").value = cliente.contacto || "";
      document.getElementById("inputTelefonoCliente").value = cliente.telefono || "";
      document.getElementById("inputEmailCliente").value = cliente.email || "";
      document.getElementById("inputDireccionCliente").value = cliente.direccion || "";
    }
    modalCliente?.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
  }

  function closeModal() {
    modalCliente?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
    editingId = null;
  }

  formCliente?.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(formCliente);
    const nombre = (formData.get("nombre") || "").trim();
    const contacto = (formData.get("contacto") || "").trim();
    const telefono = (formData.get("telefono") || "").trim();
    const email = (formData.get("email") || "").trim();
    const direccion = (formData.get("direccion") || "").trim();

    const error = Validations.firstError([
      [Validations.required(nombre, 3), "El nombre es obligatorio y debe tener al menos 3 caracteres."],
      [Validations.required(contacto), "El contacto es obligatorio."],
      [Validations.isPhone(telefono), "El teléfono debe tener entre 7 y 15 dígitos."],
      [!email || Validations.isEmail(email), "El email no tiene un formato válido."],
      [Validations.required(direccion), "La dirección es obligatoria."],
    ]);
    if (error) {
      alert(error);
      return;
    }

    const cliente = { id: editingId || AppCore.generateId(), nombre, contacto, telefono, email, direccion };

    if (editingId) {
      const idx = appData.clientes.findIndex((c) => c.id === editingId);
      if (idx !== -1) appData.clientes[idx] = cliente;
    } else {
      appData.clientes.push(cliente);
    }

    AppCore.saveAppData(appData);
    closeModal();
    renderClientes();
    document.dispatchEvent(new CustomEvent("dataUpdated"));
  });

  tbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const cliente = appData.clientes.find((c) => c.id === id);
    if (!cliente) return;

    if (action === "view") {
      actionSheet.open({
        title: cliente.nombre,
        fields: [
          { label: "Contacto", value: cliente.contacto },
          { label: "Teléfono", value: cliente.telefono },
          { label: "Email", value: cliente.email },
          { label: "Dirección", value: cliente.direccion },
        ],
        onEdit: () => openModal(cliente),
        onDelete: async () => {
          const confirmar = await NotificationModal.confirm(
            `¿Eliminar el cliente "${cliente.nombre}"?`,
            { textoAceptar: "Eliminar" }
          );
          if (confirmar) {
            appData.clientes = appData.clientes.filter((c) => c.id !== id);
            AppCore.saveAppData(appData);
            renderClientes();
            document.dispatchEvent(new CustomEvent("dataUpdated"));
          }
        },
      });
    }
  });

  btnNuevoCliente?.addEventListener("click", () => openModal());
  modalClienteCerrar?.addEventListener("click", closeModal);
  btnCancelarCliente?.addEventListener("click", closeModal);

  renderClientes();
})();
