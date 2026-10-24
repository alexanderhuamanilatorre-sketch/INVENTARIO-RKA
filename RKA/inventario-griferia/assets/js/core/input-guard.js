/**
 * input-guard.js
 * ---------------------------------------------------------------------------
 * Guardián de validación en tiempo real para TODOS los formularios del sistema.
 * Bloquea el ingreso de caracteres no permitidos en `keydown`, sanitiza en
 * `input` (también cubre autocompletado/dictado) y filtra en `paste` y `drop`.
 *
 * Uso declarativo en HTML:
 *
 *   <input data-type="string">   Solo letras y espacios (á, é, í, ó, ú, ñ, Ñ)
 *   <input data-type="int">      Solo dígitos enteros positivos (0-9)
 *   <input data-type="double">   Solo dígitos + UN solo punto decimal
 *   <input data-type="text">     Texto libre (letras, números y puntuación básica)
 *   <input data-type="email">    Correo electrónico (letras, números y @ . _ - + %)
 *   <input data-type="identifier"> Usuario o correo institucional: acepta
 *                                 letras, números y símbolos (como la contraseña)
 *   <input data-type="phone">    Teléfono
 *   <input data-type="code">     Códigos (SKU, usuario, RUC)
 *   <input data-type="search">   Cadenas de búsqueda
 *   <input data-type="password"> Contraseñas
 *
 * También acepta clases CSS equivalentes:
 *   .field-string  .field-int  .field-double  .field-text  .field-email
 *   .field-phone   .field-code .field-search
 *
 * Comportamiento:
 *   - Tecla inválida  -> preventDefault() + aviso inmediato (borde rojo)
 *   - Pegado/drop     -> se filtra el portapapeles y se inserta solo lo válido
 *   - Envío (submit)  -> sanea todos los campos antes de la validación del módulo
 *   - Los campos se inicializan normalizados al cargar la página
 * ---------------------------------------------------------------------------
 */

const LETRAS = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ";

/** Tipos de <input> que nunca se tocan (selector nativo, casillas, archivos...). */
const SKIP_TYPES = new Set([
  "checkbox",
  "radio",
  "file",
  "submit",
  "button",
  "reset",
  "image",
  "hidden",
  "color",
  "range",
  "date",
  "time",
  "month",
  "week",
  "datetime-local",
]);

/** Equivalencia clase CSS -> tipo de regla. */
const CLASS_TYPES = {
  "field-string": "string",
  "field-int": "int",
  "field-double": "double",
  "field-text": "text",
  "field-email": "email",
  "field-identifier": "identifier",
  "field-phone": "phone",
  "field-code": "code",
  "field-search": "search",
};

/**
 * Reglas. Cada una define `clean()` (filtro), `msg` (mensaje de alerta) y
 * opcionalmente `valid()` para la prueba de valor completo.
 */
const RULES = {
  string: {
    label: "Texto (solo letras)",
    msg: "Solo letras y espacios: no se permiten números ni símbolos.",
    clean: (v) => v.replace(new RegExp(`[^${LETRAS} ]+`, "g"), ""),
  },

  int: {
    label: "Número entero",
    msg: "Solo se permiten dígitos (0-9): sin letras, espacios ni símbolos.",
    clean: (v) => v.replace(/[^0-9]+/g, ""),
  },

  double: {
    label: "Número decimal",
    msg: "Solo dígitos y un único punto decimal: no se permite la coma.",
    clean: (v) => {
      const s = v.replace(/[^0-9.]+/g, "");
      const i = s.indexOf(".");
      return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
    },
    valid: (v) => v !== "." && /^[0-9]*(\.[0-9]*)?$/.test(v),
  },

  text: {
    label: "Texto",
    msg: "Carácter no permitido en el campo de texto.",
    clean: (v) => v.replace(/[^\p{L}\p{N} .,:;()#+\-_/@°%'"&[\]]+/gu, ""),
  },

  email: {
    label: "Correo electrónico",
    msg: "Carácter no permitido en el correo: use letras, números y @ . _ - + %",
    fullMsg: "El correo debe tener el formato: correo@dominio.com",
    clean: (v) => v.replace(/[^A-Za-z0-9._%+\-@]+/g, ""),
    // Por tecla SOLO se comprueba que el carácter esté permitido: así se puede
    // escribir el correo de forma progresiva (no se exige el formato completo
    // hasta enviar el formulario, si no, quedaría bloqueado carácter a carácter).
    valid: (v) => v.length === 0 || /^[A-Za-z0-9._%+\-@]+$/.test(v),
    // Comprobación estricta del formato, aplicada al enviar (inputs type="email").
    fullValid: (v) =>
      v.length === 0 ||
      /^[A-Za-z0-9._%+\-@]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(
        v,
      ),
  },

  identifier: {
    label: "Usuario o correo",
    msg: "No se permiten espacios ni caracteres de control en el usuario o correo.",
    clean: (v) => v.replace(/[\s\u0000-\u001F\u007F]+/g, ""),
  },

  phone: {
    label: "Teléfono",
    msg: "Solo números, espacios y los símbolos + ( ) -",
    clean: (v) => v.replace(/[^0-9+()\- ]+/g, ""),
  },

  code: {
    label: "Código",
    msg: "Solo letras, números y los símbolos . _ - / # [ ] ( )",
    clean: (v) => v.replace(/[^A-Za-z0-9 ._\-/#[\]()]+/g, ""),
  },

  search: {
    label: "Búsqueda",
    msg: "Carácter no permitido en la búsqueda.",
    clean: (v) => v.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ ._\-/#@]+/g, ""),
  },

  password: {
    label: "Contraseña",
    msg: "La contraseña no puede contener espacios ni caracteres de control.",
    clean: (v) => v.replace(/[\s\u0000-\u001F\u007F]+/g, ""),
  },
};

/** Deriva `valid()` y `charOk()` a partir de `clean()`. */
Object.values(RULES).forEach((rule) => {
  if (!rule.valid) rule.valid = (v) => rule.clean(v) === v;
  rule.charOk = (ch) => rule.clean(ch) === ch;
});

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

function getType(el) {
  const ds = el.dataset ? el.dataset.type : null;
  if (ds && RULES[ds]) return ds;
  const list = el.classList;
  if (list) {
    for (const key in CLASS_TYPES) {
      if (list.contains(key)) return CLASS_TYPES[key];
    }
  }
  return null;
}

function isGuardable(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
  if (SKIP_TYPES.has((el.type || "text").toLowerCase())) return false;
  if (el.disabled || el.readOnly) return false;
  return Boolean(getType(el));
}

function getRule(el) {
  const type = getType(el);
  return type ? RULES[type] : null;
}

/** Mapea una posición del valor original al valor ya saneado. */
function mapPosition(raw, clean, pos) {
  let j = 0;
  for (let i = 0; i < pos && i < raw.length; i++) {
    if (j < clean.length && raw[i] === clean[j]) j++;
  }
  return j;
}

/**
 * Posición del cursor segura: `type="email"` y `type="number"` lanzan
 * InvalidStateError al leer selectionStart/selectionEnd.
 */
function getSelection(el) {
  try {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (typeof start === "number" && typeof end === "number")
      return { start, end };
  } catch (_e) {
    /* tipo de input sin soporte de selección */
  }
  return { start: el.value.length, end: el.value.length };
}

function setCursor(el, pos) {
  try {
    el.setSelectionRange(pos, pos);
  } catch (_e) {
    /* type="number" no soporta setSelectionRange */
  }
}

function insertText(el, text) {
  const { start, end } = getSelection(el);
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  el.value = before + text + after;
  setCursor(el, start + text.length);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/* -------------------------------------------------------------------------- */
/* Retroalimentación visual                                                    */
/* -------------------------------------------------------------------------- */

const TIP_ID = "inputGuardTip";
let tipEl = null;
let tipTimer = null;

function ensureTip() {
  if (tipEl && document.body.contains(tipEl)) return tipEl;
  tipEl = document.createElement("div");
  tipEl.id = TIP_ID;
  tipEl.className = "input-guard__tip";
  tipEl.setAttribute("role", "status");
  tipEl.setAttribute("aria-live", "polite");
  document.body.appendChild(tipEl);
  return tipEl;
}

function hideTip() {
  if (tipEl) tipEl.classList.remove("is-visible");
}

function showTip(el, msg) {
  const tip = ensureTip();
  tip.textContent = msg;
  tip.classList.add("is-visible");

  const r = el.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 8;

  if (left + tr.width > window.innerWidth - 8)
    left = window.innerWidth - tr.width - 8;
  if (left < 8) left = 8;
  if (top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 8;
  if (top < 8) top = 8;

  tip.style.left = Math.round(left) + "px";
  tip.style.top = Math.round(top) + "px";

  clearTimeout(tipTimer);
  tipTimer = setTimeout(hideTip, 3200);
}

function markInvalid(el, rule, msg) {
  if (el.__igClearTimer) {
    clearTimeout(el.__igClearTimer);
    el.__igClearTimer = null;
  }
  el.classList.add("input-guard--invalid");
  el.setAttribute("aria-invalid", "true");
  el.classList.remove("input-guard--flash");
  void el.offsetWidth;
  el.classList.add("input-guard--flash");

  const group = el.closest(".form-group");
  const fb = group ? group.querySelector(".form-feedback") : null;
  if (fb) {
    fb.textContent = msg || rule.msg;
    fb.dataset.guardMsg = "1";
  }
}

function clearInvalid(el) {
  if (el.__igClearTimer) {
    clearTimeout(el.__igClearTimer);
    el.__igClearTimer = null;
  }
  if (!el.classList.contains("input-guard--invalid")) return;
  el.classList.remove("input-guard--invalid", "input-guard--flash");
  el.removeAttribute("aria-invalid");

  const group = el.closest(".form-group");
  const fb = group ? group.querySelector(".form-feedback") : null;
  if (fb && fb.dataset.guardMsg === "1") {
    fb.textContent = "";
    delete fb.dataset.guardMsg;
  }
}

function scheduleClear(el, delay) {
  if (el.__igClearTimer) clearTimeout(el.__igClearTimer);
  el.__igClearTimer = setTimeout(() => {
    el.__igClearTimer = null;
    clearInvalid(el);
  }, delay);
}

/** Sanea y (si hubo cambios) avisa. Devuelve true si el valor quedó válido. */
function sanitize(el, rule, notify) {
  const shouldNotify = notify !== false;
  const raw = el.value;
  const clean = rule.clean(raw);

  if (clean !== raw) {
    const { start } = getSelection(el);
    const nextPos = mapPosition(raw, clean, start);
    el.value = clean;
    setCursor(el, nextPos);
    if (shouldNotify) {
      showTip(el, rule.msg);
      markInvalid(el, rule);
    }
  }

  if (el.value === "" || rule.valid(el.value)) {
    // Si se filtraron caracteres se mantiene el borde rojo un instante
    // para que el usuario perciba que su entrada fue corregida.
    if (clean !== raw && shouldNotify) scheduleClear(el, 1800);
    else clearInvalid(el);
    return true;
  }

  if (shouldNotify) markInvalid(el, rule);
  return false;
}

/* -------------------------------------------------------------------------- */
/* Manejadores (delegación a nivel documento: cubre modales dinámicos)          */
/* -------------------------------------------------------------------------- */

function onKeydown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const el = e.target;
  if (!isGuardable(el)) return;

  const rule = getRule(el);
  const key = e.key;
  if (!rule || !key || key.length !== 1) return; // Enter, Esc, Backspace, nav...

  const { start: s, end: en } = getSelection(el);
  const next = el.value.slice(0, s) + key + el.value.slice(en);

  if (rule.charOk(key) && rule.valid(next)) return;

  e.preventDefault();
  showTip(el, rule.msg);
  markInvalid(el, rule);
}

function onInput(e) {
  const el = e.target;
  if (!isGuardable(el)) return;
  const rule = getRule(el);
  if (rule) sanitize(el, rule, true);
}

function onPaste(e) {
  const el = e.target;
  if (!isGuardable(el)) return;
  const rule = getRule(el);
  if (!rule) return;

  e.preventDefault();
  const data = e.clipboardData || window.clipboardData;
  const text = data ? data.getData("text") : "";
  const clean = rule.clean(text);

  if (clean !== text) {
    showTip(el, rule.msg);
    markInvalid(el, rule);
  }
  if (clean !== "") insertText(el, clean);
}

function onDrop(e) {
  const el = e.target;
  if (!isGuardable(el)) return;
  const rule = getRule(el);
  if (!rule) return;

  e.preventDefault();
  const text = e.dataTransfer ? e.dataTransfer.getData("text") : "";
  const clean = rule.clean(text);

  if (clean !== text) {
    showTip(el, rule.msg);
    markInvalid(el, rule);
  }
  if (clean !== "") insertText(el, clean);
}

function onFocusOut(e) {
  const el = e.target;
  if (!isGuardable(el)) return;
  const rule = getRule(el);
  if (!rule) return;
  sanitize(el, rule, true);
  setTimeout(hideTip, 120);
}

/** Sanea y valida todo el formulario justo antes de la validación del módulo. */
function onSubmit(e) {
  const form = e.target;
  if (!form || form.tagName !== "FORM") return;

  form.querySelectorAll("input, textarea").forEach((el) => {
    if (!isGuardable(el)) return;
    const rule = getRule(el);
    if (!rule) return;

    el.value = rule.clean(el.value);

    const required = el.hasAttribute("required");
    if (el.value === "" && !required) {
      clearInvalid(el);
      return;
    }
    // Si la regla define comprobación de formato completo (fullValid, correo)
    // se exige al enviar; el resto valida con la regla normal.
    const comprobacion = rule.fullValid || rule.valid;
    if (comprobacion(el.value)) clearInvalid(el);
    else markInvalid(el, rule, rule.fullMsg);
  });
}

/** Normaliza todos los campos existentes al cargar la página (sin avisar). */
function sweep() {
  document.querySelectorAll("input, textarea").forEach((el) => {
    if (!isGuardable(el)) return;
    const rule = getRule(el);
    if (!rule) return;
    const clean = rule.clean(el.value);
    if (clean !== el.value) el.value = clean;
  });
}

/* -------------------------------------------------------------------------- */
/* Inicialización                                                              */
/* -------------------------------------------------------------------------- */

let initialized = false;

function init() {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("input", onInput, false);
  document.addEventListener("paste", onPaste, false);
  document.addEventListener("drop", onDrop, false);
  document.addEventListener("focusout", onFocusOut, false);
  document.addEventListener("submit", onSubmit, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sweep, { once: true });
  } else {
    sweep();
  }
}

export const InputGuard = {
  init,
  rules: RULES,
  getType,
  getRule,
  isGuardable,
  sanitize,
  sweep,
};

init();

export default InputGuard;
