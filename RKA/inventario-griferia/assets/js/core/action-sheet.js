/**
 * ActionSheet
 * Muestra un panel inferior con los detalles del registro y botones Editar / Borrar.
 */
export class ActionSheet {
  constructor() {
    this._ensureSheet();
  }

  _ensureSheet() {
    if (document.getElementById("actionSheet")) return;
    const sheet = document.createElement("div");
    sheet.id = "actionSheet";
    sheet.className = "action-sheet";
    sheet.innerHTML = `
      <div class="action-sheet__backdrop" id="actionSheetBackdrop"></div>
      <div class="action-sheet__panel">
        <div class="action-sheet__handle"></div>
        <header class="action-sheet__header">
          <h3 class="action-sheet__title" id="actionSheetTitle">Detalles</h3>
          <button class="action-sheet__close" id="actionSheetClose" title="Cerrar">&times;</button>
        </header>
        <div class="action-sheet__body" id="actionSheetBody"></div>
        <footer class="action-sheet__footer">
          <button class="btn btn-outline" id="actionSheetEdit"><i class="bi bi-pencil"></i> Editar</button>
          <button class="btn btn-danger" id="actionSheetDelete"><i class="bi bi-trash"></i> Borrar</button>
        </footer>
      </div>
    `;
    document.body.appendChild(sheet);

    document
      .getElementById("actionSheetClose")
      .addEventListener("click", () => this.close());
    document
      .getElementById("actionSheetBackdrop")
      .addEventListener("click", () => this.close());
  }

  open({ title, fields, onEdit, onDelete }) {
    const sheet = document.getElementById("actionSheet");
    const body = document.getElementById("actionSheetBody");
    const titleEl = document.getElementById("actionSheetTitle");
    if (!sheet || !body || !titleEl) return;

    titleEl.textContent = title || "Detalles";
    body.innerHTML = `
      <dl class="action-sheet__details">
        ${fields
          .map(
            (f) =>
              `<div class="action-sheet__row"><dt>${f.label}</dt><dd>${f.value ?? "-"}</dd></div>`,
          )
          .join("")}
      </dl>`;

    const editBtn = document.getElementById("actionSheetEdit");
    const deleteBtn = document.getElementById("actionSheetDelete");

    // Si no hay acción de editar, ocultamos el botón de editar
    editBtn.style.display = typeof onEdit === "function" ? "" : "none";

    editBtn.onclick = () => {
      this.close();
      if (typeof onEdit === "function") onEdit();
    };
    deleteBtn.onclick = () => {
      this.close();
      if (typeof onDelete === "function") onDelete();
    };

    sheet.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
  }

  close() {
    const sheet = document.getElementById("actionSheet");
    sheet?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
  }
}
