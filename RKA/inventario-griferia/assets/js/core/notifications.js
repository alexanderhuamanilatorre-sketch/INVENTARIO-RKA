/**
 * notifications.js
 * Sistema global de notificaciones MODALES de la aplicación.
 *
 * Características:
 *  - Siempre se muestran como modal en el CENTRO de la pantalla (nunca como toast ni diálogo nativo).
 *  - Sombra profunda (shadow-xl) y colores del sistema (variables CSS de la app).
 *  - Reemplaza window.alert() en toda la aplicación.
 *  - El botón de campana del topbar abre el centro de notificaciones (también modal).
 */

import { StorageService } from "./storage-service.js";

/** Tipos de notificación (colores del sistema: variables.css) */
const TIPOS = {
  info: { icono: "bi-info-circle-fill", titulo: "Información", boton: "btn-primary" },
  success: { icono: "bi-check-circle-fill", titulo: "Éxito", boton: "btn-success" },
  warning: { icono: "bi-exclamation-triangle-fill", titulo: "Atención", boton: "btn-primary" },
  danger: { icono: "bi-x-octagon-fill", titulo: "Error", boton: "btn-danger" },
};

/** Estado del modal de mensajes (una notificación a la vez, el resto se encolan) */
const estado = { cola: [], activa: null, cerrando: false };

/**
 * Deduce el tipo de notificación a partir del mensaje,
 * para que cada aviso use el color del sistema que le corresponde.
 */
/** Escapa texto antes de insertarlo con innerHTML (nombres de productos, códigos...) */
function escapar(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function deducirTipo(mensaje) {
  const m = String(mensaje ?? "").toLowerCase();
  if (/(correctamente|exitos|éxito|exito|guardad|cread|actualizad|eliminad|registrad|restablecid|copiad|sincronizad)/.test(m)) {
    return "success";
  }
  if (/(no se pudo|no se puede|no hay|no existe|no puede|error|obligatori|inválid|invalid|incorrect|insuficiente|faltan|denegad|requerid|sin conexión|conexión)/.test(m)) {
    return "danger";
  }
  if (/(próximamente|proximamente|atención|atencion|cuidado|verifique|advertencia|alerta)/.test(m)) {
    return "warning";
  }
  return "info";
}

/* ------------------------------------------------------------------ */
/*  DOM                                                                */
/* ------------------------------------------------------------------ */

function ensureDom() {
  if (document.getElementById("notifModal")) return;

  const modal = document.createElement("div");
  modal.className = "notif-modal notif-modal--info";
  modal.id = "notifModal";
  modal.setAttribute("role", "alertdialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-hidden", "true");
  modal.setAttribute("aria-labelledby", "notifModalTitulo");
  modal.setAttribute("aria-describedby", "notifModalMensaje");
  modal.innerHTML = `
    <div class="notif-modal__backdrop" data-notif-dismiss="auto"></div>
    <div class="notif-modal__dialog" role="document">
      <button type="button" class="notif-modal__close" data-notif-dismiss="auto" aria-label="Cerrar notificación">&times;</button>
      <span class="notif-modal__icon"><i class="bi bi-info-circle-fill"></i></span>
      <h3 class="notif-modal__title" id="notifModalTitulo">Información</h3>
      <p class="notif-modal__message" id="notifModalMensaje"></p>
      <div class="notif-modal__actions">
        <button type="button" class="btn btn-outline notif-modal__btn-cancel d-none">Cancelar</button>
        <button type="button" class="btn btn-primary notif-modal__btn-ok">Aceptar</button>
      </div>
    </div>
  `;
  (document.body || document.documentElement).appendChild(modal);

  modal.querySelectorAll("[data-notif-dismiss]").forEach((el) => {
    el.addEventListener("click", () => {
      const modo = el.getAttribute("data-notif-dismiss");
      finalizar(modo === "cancelar" ? false : true);
    });
  });

  modal.querySelector(".notif-modal__btn-ok").addEventListener("click", () => {
    finalizar(true);
  });
  modal.querySelector(".notif-modal__btn-cancel").addEventListener("click", () => {
    finalizar(false);
  });
}

function ensureCentroDom() {
  if (document.getElementById("notifCentro")) return;

  const centro = document.createElement("div");
  centro.className = "notif-modal notif-modal--centro notif-modal--info";
  centro.id = "notifCentro";
  centro.setAttribute("role", "dialog");
  centro.setAttribute("aria-modal", "true");
  centro.setAttribute("aria-hidden", "true");
  centro.setAttribute("aria-labelledby", "notifCentroTitulo");
  centro.innerHTML = `
    <div class="notif-modal__backdrop" data-notif-centro-close></div>
    <div class="notif-modal__dialog" role="document">
      <header class="notif-modal__header">
        <span class="notif-modal__header-icon"><i class="bi bi-bell-fill"></i></span>
        <div class="notif-modal__header-text">
          <h3 class="notif-modal__header-title" id="notifCentroTitulo">Notificaciones</h3>
          <p class="notif-modal__header-sub" id="notifCentroResumen">Centro de notificaciones</p>
        </div>
        <button type="button" class="notif-modal__close" data-notif-centro-close aria-label="Cerrar notificaciones">&times;</button>
      </header>
      <div class="notif-modal__list" id="notifCentroLista"></div>
      <footer class="notif-modal__footer">
        <button type="button" class="btn btn-outline" data-notif-centro-close>Cerrar</button>
      </footer>
    </div>
  `;
  (document.body || document.documentElement).appendChild(centro);

  centro.querySelectorAll("[data-notif-centro-close]").forEach((el) => {
    el.addEventListener("click", () => NotificationModal.cerrarCentro());
  });
}

/* ------------------------------------------------------------------ */
/*  Modal de mensajes (alert / confirm / notify)                       */
/* ------------------------------------------------------------------ */

function bloquearScroll(bloquear) {
  if (bloquear) {
    document.body.classList.add("overflow-hidden");
    return;
  }
  const abierto = document.querySelector(".modal.is-open, .action-sheet.is-open, .notif-modal.is-open");
  if (!abierto) document.body.classList.remove("overflow-hidden");
}

function pintar(opciones) {
  ensureDom();
  const {
    tipo = "info",
    titulo,
    mensaje = "",
    textoAceptar = "Aceptar",
    textoCancelar = "Cancelar",
    mostrarCancelar = false,
    textoExtra = "",
  } = opciones;

  const conf = TIPOS[tipo] || TIPOS.info;
  const modal = document.getElementById("notifModal");

  modal.classList.remove("notif-modal--info", "notif-modal--success", "notif-modal--warning", "notif-modal--danger");
  modal.classList.add(TIPOS[tipo] ? `notif-modal--${tipo}` : "notif-modal--info");

  const icono = modal.querySelector(".notif-modal__icon i");
  if (icono) icono.className = `bi ${conf.icono}`;

  const tituloEl = modal.querySelector(".notif-modal__title");
  if (tituloEl) tituloEl.textContent = titulo || conf.titulo;

  const mensajeEl = modal.querySelector(".notif-modal__message");
  if (mensajeEl) {
    const cuerpo = [mensaje == null ? "" : String(mensaje), textoExtra].filter(Boolean).join("\n");
    mensajeEl.textContent = cuerpo;
    mensajeEl.classList.toggle("d-none", !cuerpo);
  }

  const btnOk = modal.querySelector(".notif-modal__btn-ok");
  const btnCancelar = modal.querySelector(".notif-modal__btn-cancel");

  if (btnOk) {
    btnOk.textContent = textoAceptar;
    btnOk.className = `btn ${conf.boton} notif-modal__btn-ok`;
  }
  if (btnCancelar) {
    btnCancelar.textContent = textoCancelar;
    btnCancelar.classList.toggle("d-none", !mostrarCancelar);
  }
}

function mostrarModal() {
  ensureDom();

  // El centro de notificaciones y un aviso nunca se ven a la vez
  // (si estuviera abierto, taparía el mensaje y se vería descuadrado).
  const centro = document.getElementById("notifCentro");
  if (centro?.classList.contains("is-open")) {
    centro.classList.remove("is-open");
    centro.setAttribute("aria-hidden", "true");
  }

  const modal = document.getElementById("notifModal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  bloquearScroll(true);

  // Enfoca el botón de cancelar si está visible, si no el botón principal
  const btnCancelar = modal.querySelector(".notif-modal__btn-cancel");
  const btnOk = modal.querySelector(".notif-modal__btn-ok");
  const foco = btnCancelar && !btnCancelar.classList.contains("d-none") ? btnCancelar : btnOk;
  setTimeout(() => foco?.focus(), 30);
}

function ocultarModal() {
  const modal = document.getElementById("notifModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  bloquearScroll(false);
}

function encolar(opciones) {
  const trabajo = { opciones, resolver: null, promise: null };
  trabajo.promise = new Promise((resolver) => {
    trabajo.resolver = resolver;
  });
  estado.cola.push(trabajo);
  pintarSiguiente();
  return trabajo;
}

function pintarSiguiente() {
  if (estado.activa || estado.cerrando || estado.cola.length === 0) return;
  estado.activa = estado.cola.shift();
  pintar(estado.activa.opciones);
  mostrarModal();
}

function finalizar(valor) {
  if (!estado.activa) return;
  const { resolver } = estado.activa;
  estado.activa = null;
  ocultarModal();
  resolver(valor);

  if (estado.cola.length > 0) {
    // Pequeña pausa antes de la siguiente notificación para que ningún
    // clic o tecla residual cierre la que viene a continuación.
    estado.cerrando = true;
    setTimeout(() => {
      estado.cerrando = false;
      pintarSiguiente();
    }, 160);
  }
}

/* ------------------------------------------------------------------ */
/*  Centro de notificaciones (campana del topbar)                      */
/* ------------------------------------------------------------------ */

function obtenerNotificaciones() {
  const data = StorageService.getItem("appData", null) || {};
  const productos = Array.isArray(data.productos) ? data.productos : [];
  const items = [];

  productos.forEach((p) => {
    if (!p || typeof p !== "object") return;
    const stock = Number(p.stock) || 0;
    const minimo = Number(p.stockMinimo) || 5;
    const nombre = p.nombre || "Producto sin nombre";
    const codigo = p.codigo ? `Código: ${p.codigo}` : "";

    if (stock <= 0) {
      items.push({
        tipo: "danger",
        icono: "bi-exclamation-octagon-fill",
        titulo: "Producto agotado",
        mensaje: nombre,
        meta: `Stock: 0 unid. ${codigo}`.trim(),
      });
    } else if (stock <= minimo) {
      items.push({
        tipo: "warning",
        icono: "bi-exclamation-triangle-fill",
        titulo: "Stock bajo",
        mensaje: nombre,
        meta: `Stock: ${stock} unid. · Mínimo: ${minimo} ${codigo}`.trim(),
      });
    }
  });

  if (items.length === 0) {
    items.push({
      tipo: "success",
      icono: "bi-check-circle-fill",
      titulo: "Todo en orden",
      mensaje: "Sin alertas de inventario",
      meta: "No hay productos con stock bajo ni agotados.",
    });
  }
  return items;
}

function sincronizarBadge() {
  const pendientes = obtenerNotificaciones().filter((i) => i.tipo !== "success");
  document.querySelectorAll(".notification-badge").forEach((badge) => {
    badge.textContent = String(pendientes.length);
    badge.classList.toggle("d-none", pendientes.length === 0);
  });
}

/* ------------------------------------------------------------------ */
/*  API pública                                                        */
/* ------------------------------------------------------------------ */

export class NotificationModal {
  /** Muestra una notificación modal centrada y resuelve al aceptarla. */
  static alert(mensaje, opciones = {}) {
    const tipo = opciones.tipo || deducirTipo(mensaje);
    return encolar({
      tipo,
      titulo: opciones.titulo,
      mensaje,
      textoAceptar: opciones.textoAceptar || "Aceptar",
      textoExtra: opciones.textoExtra || "",
    }).promise;
  }

  /** Muestra un diálogo de confirmación modal centrado (Aceptar / Cancelar). */
  static confirm(mensaje, opciones = {}) {
    return encolar({
      tipo: opciones.tipo || "danger",
      titulo: opciones.titulo || "Confirmar",
      mensaje,
      mostrarCancelar: true,
      textoAceptar: opciones.textoAceptar || "Aceptar",
      textoCancelar: opciones.textoCancelar || "Cancelar",
      textoExtra: opciones.textoExtra || "",
    }).promise.then((valor) => Boolean(valor));
  }

  /** Notificación que se cierra sola (por defecto a los 4 segundos). */
  static notify(mensaje, opciones = {}) {
    const tipo = opciones.tipo || deducirTipo(mensaje);
    const trabajo = encolar({
      tipo,
      titulo: opciones.titulo,
      mensaje,
      textoAceptar: opciones.textoAceptar || "Aceptar",
      textoExtra: opciones.textoExtra || "",
    });
    const duracion = Number(opciones.duracion) > 0 ? Number(opciones.duracion) : 4000;
    setTimeout(() => {
      if (estado.activa === trabajo) finalizar(true);
    }, duracion);
    return trabajo.promise;
  }

  static success(mensaje, opciones = {}) {
    return this.alert(mensaje, { ...opciones, tipo: "success" });
  }

  static error(mensaje, opciones = {}) {
    return this.alert(mensaje, { ...opciones, tipo: "danger" });
  }

  static info(mensaje, opciones = {}) {
    return this.alert(mensaje, { ...opciones, tipo: "info" });
  }

  static warning(mensaje, opciones = {}) {
    return this.alert(mensaje, { ...opciones, tipo: "warning" });
  }

  /** Abre el centro de notificaciones (modal centrado en pantalla). */
  static abrirCentro() {
    // Si hay un aviso o confirmación en pantalla no lo tapamos
    if (estado.activa) return;
    ensureCentroDom();
    const centro = document.getElementById("notifCentro");
    const lista = document.getElementById("notifCentroLista");
    const resumen = document.getElementById("notifCentroResumen");
    const items = obtenerNotificaciones();
    const pendientes = items.filter((i) => i.tipo !== "success");

    if (resumen) {
      resumen.textContent = pendientes.length
        ? `${pendientes.length} alerta${pendientes.length === 1 ? "" : "s"} de inventario`
        : "Sin alertas pendientes";
    }

    if (lista) {
      lista.innerHTML = items
        .map(
          (item) => `
          <article class="notif-item notif-item--${item.tipo}">
            <span class="notif-item__icon"><i class="bi ${item.icono}"></i></span>
            <div class="notif-item__body">
              <p class="notif-item__title">${escapar(item.titulo)}</p>
              <p class="notif-item__message">${escapar(item.mensaje)}</p>
              ${item.meta ? `<p class="notif-item__meta">${escapar(item.meta)}</p>` : ""}
            </div>
          </article>`
        )
        .join("");
    }

    centro.classList.add("is-open");
    centro.setAttribute("aria-hidden", "false");
    bloquearScroll(true);
    setTimeout(() => centro.querySelector(".notif-modal__close")?.focus(), 30);
  }

  static cerrarCentro() {
    const centro = document.getElementById("notifCentro");
    if (!centro) return;
    centro.classList.remove("is-open");
    centro.setAttribute("aria-hidden", "true");
    bloquearScroll(false);
  }
}

/* ------------------------------------------------------------------ */
/*  Atajos de teclado y globals                                        */
/* ------------------------------------------------------------------ */

document.addEventListener("keydown", (e) => {
  const centro = document.getElementById("notifCentro");
  if (centro?.classList.contains("is-open")) {
    if (e.key === "Escape") {
      e.preventDefault();
      NotificationModal.cerrarCentro();
    }
    return;
  }

  if (!estado.activa) return;

  if (e.key === "Escape") {
    e.preventDefault();
    finalizar(false);
    return;
  }
  if (e.key === "Enter") {
    // Si el foco está en un botón del modal, el navegador dispara su propio click
    // (así "Enter" sobre Cancelar cancela, no acepta).
    const activo = document.activeElement;
    const modalEl = document.getElementById("notifModal");
    const esBotonDelModal =
      activo && modalEl && modalEl.contains(activo) && (activo.tagName === "BUTTON" || activo.tagName === "A");
    if (esBotonDelModal) return;
    e.preventDefault();
    finalizar(true);
    return;
  }
  if (e.key === "Tab") {
    // Trampa de foco simple dentro del modal
    const modal = document.getElementById("notifModal");
    const focables = modal
      ? Array.from(modal.querySelectorAll("button:not(.d-none), [href], input, select, textarea"))
      : [];
    if (focables.length === 0) return;
    const primero = focables[0];
    const ultimo = focables[focables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }
});

function instalarGlobales() {
  if (window.__rkalNotificaciones) return;
  window.__rkalNotificaciones = true;

  // Todas las notificaciones pasan a ser modales centradas
  window.alert = (mensaje) => {
    NotificationModal.alert(mensaje);
  };
}

function init() {
  document.querySelectorAll(".notification-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      NotificationModal.abrirCentro();
    });
  });

  sincronizarBadge();
  setTimeout(sincronizarBadge, 600);
  document.addEventListener("dataUpdated", sincronizarBadge);
}

instalarGlobales();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
