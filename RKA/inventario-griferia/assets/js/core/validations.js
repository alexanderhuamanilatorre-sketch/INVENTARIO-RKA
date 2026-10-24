/**
 * Validaciones.js
 * Utilidades de validación reutilizables para todos los formularios del sistema.
 */

export const Validations = {
  /** Texto no vacío (mínimo `min` caracteres si se indica). */
  required(value, min = 1) {
    return typeof value === "string" && value.trim().length >= min;
  },

  /** Solo letras (incluye tildes, ñ y espacios). */
  onlyLetters(value) {
    return /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' ]+$/.test((value || "").trim());
  },

  /** Número entero >= 0. */
  isNonNegativeInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0;
  },

  /** Número entero >= 1. */
  isPositiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1;
  },

  /** Número mayor o igual a 0. */
  isNonNegativeNumber(value) {
    const n = Number(value);
    return !Number.isNaN(n) && n >= 0;
  },

  /** Email válido (formato general). */
  isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || "").trim());
  },

  /** Teléfono: 7 a 15 dígitos, permite +, espacios y guiones. */
  isPhone(value) {
    const v = (value || "").trim();
    const digitos = v.replace(/\D/g, "");
    return /^\+?[0-9\s-]{6,}$/.test(v) && digitos.length >= 7 && digitos.length <= 15;
  },

  /** DNI peruano: exactamente 8 dígitos numéricos. */
  isDNI(value) {
    return /^\d{8}$/.test((value || "").trim());
  },

  /**
   * Carnet de Extranjería (CE) para extranjeros en Perú.
   * Formato estándar emitido por Migraciones para ciudadanos de
   * Venezuela, Colombia y demás países de Latinoamérica:
   * exactamente 9 dígitos numéricos (p. ej. 009876543).
   */
  isCarnetExtranjeria(value) {
    return /^\d{9}$/.test((value || "").trim());
  },

  /** RUC peruano: exactamente 11 dígitos numéricos. */
  isRUC(value) {
    return /^\d{11}$/.test((value || "").trim());
  },

  /** Devuelve el primer mensaje de error encontrado, o null si todo es válido. */
  firstError(checks) {
    for (const [ok, message] of checks) {
      if (!ok) return message;
    }
    return null;
  },
};
