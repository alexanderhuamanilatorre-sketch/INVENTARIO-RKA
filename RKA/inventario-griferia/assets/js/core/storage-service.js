/**
 * StorageService
 * Abstracción para persistencia de datos en localStorage con prefijo de aplicación.
 */
export class StorageService {
  static APP_PREFIX = "rkal_inventory_v2";

  static getKey(key) {
    if (!key || typeof key !== "string") {
      throw new Error("StorageService.getKey: La clave debe ser un string válido");
    }
    return `${this.APP_PREFIX}::${key}`;
  }

  static setItem(key, value) {
    try {
      localStorage.setItem(this.getKey(key), JSON.stringify(value));
    } catch (error) {
      console.error("StorageService.setItem: Error al guardar", error);
    }
  }

  static getItem(key, defaultValue = null) {
    try {
      const rawValue = localStorage.getItem(this.getKey(key));
      if (rawValue === null) return defaultValue;
      return JSON.parse(rawValue);
    } catch (error) {
      console.error("StorageService.getItem: Error al leer", error);
      return defaultValue;
    }
  }

  static removeItem(key) {
    try {
      localStorage.removeItem(this.getKey(key));
    } catch (error) {
      console.error("StorageService.removeItem: Error al eliminar", error);
    }
  }

  static hasItem(key) {
    try {
      return localStorage.getItem(this.getKey(key)) !== null;
    } catch (error) {
      console.error("StorageService.hasItem: Error al verificar", error);
      return false;
    }
  }

  static clearAppData() {
    try {
      const prefix = this.getKey("");
      Object.keys(localStorage).forEach((storageKey) => {
        if (storageKey.startsWith(prefix)) {
          localStorage.removeItem(storageKey);
        }
      });
    } catch (error) {
      console.error("StorageService.clearAppData: Error al limpiar", error);
    }
  }
}
