import { AuthService } from "./auth-core.js";
import { NotificationModal } from "../core/notifications.js";
import "../core/input-guard.js";

(async function initLogin() {
  const authService = new AuthService();
  if (await authService.redirectIfAuthenticated("../pages/dashboard.html"))
    return;

  const loginForm = document.getElementById("loginForm");
  const inputUsuario = document.getElementById("inputUsuario");
  const inputContrasena = document.getElementById("inputContrasena");
  const btnTogglePassword = document.getElementById("btnTogglePassword");
  const chkRecordarme = document.getElementById("chkRecordarme");
  const btnLogin = document.getElementById("btnLogin");
  const authYear = document.getElementById("authYear");

  if (!loginForm || !inputUsuario || !inputContrasena || !btnLogin) {
    throw new Error("No se encontró el formulario de inicio de sesión.");
  }

  if (authYear) authYear.textContent = new Date().getFullYear().toString();

  btnTogglePassword?.addEventListener("click", () => {
    const showPassword = inputContrasena.type === "password";
    inputContrasena.type = showPassword ? "text" : "password";
    btnTogglePassword.setAttribute("aria-pressed", String(showPassword));
    btnTogglePassword.setAttribute(
      "aria-label",
      showPassword ? "Ocultar contraseña" : "Mostrar contraseña",
    );
    const icon = btnTogglePassword.querySelector("i");
    icon?.classList.toggle("bi-eye", !showPassword);
    icon?.classList.toggle("bi-eye-slash", showPassword);
  });

  [inputUsuario, inputContrasena].forEach((input) => {
    input.addEventListener("input", () => {
      setFieldFeedback(input, "");
    });
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (btnLogin.disabled) return;

    const usuario = inputUsuario.value.trim();
    const contrasena = inputContrasena.value;
    let valido = true;

    if (!usuario) {
      setFieldFeedback(
        inputUsuario,
        "El correo institucional o usuario es obligatorio.",
      );
      valido = false;
    }
    if (!contrasena) {
      setFieldFeedback(inputContrasena, "La contraseña es obligatoria.");
      valido = false;
    }
    if (!valido) return;

    setLoading(true);
    try {
      const result = await authService.loginConApi(
        usuario,
        contrasena,
        Boolean(chkRecordarme?.checked),
      );

      if (!result.success) {
        NotificationModal.error(result.message || "No se pudo iniciar sesión.");
        inputContrasena.focus();
        return;
      }

      const returnTo = getReturnTo();
      if (returnTo) {
        window.location.replace(returnTo);
        return;
      }

      const inicio = result.user?.inicio;
      window.location.replace(
        inicio
          ? `../${inicio.replace(/^\/+/, "")}`
          : "../pages/403.html?motivo=sin-accesos",
      );
    } catch {
      NotificationModal.error(
        "No se pudo conectar con el servidor. Inténtalo nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  });

  function getReturnTo() {
    const rawReturnTo = new URLSearchParams(window.location.search).get(
      "returnTo",
    );
    if (!rawReturnTo || rawReturnTo.includes("\\")) return null;

    try {
      const destination = new URL(rawReturnTo, window.location.origin);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === "/auth/login.html"
      ) {
        return null;
      }
      return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch {
      return null;
    }
  }

  function setLoading(loading) {
    btnLogin.disabled = loading;
    const text = btnLogin.querySelector(".btn-text");
    const spinner = btnLogin.querySelector(".btn-spinner");
    if (text) text.classList.toggle("d-none", loading);
    if (spinner) spinner.classList.toggle("d-none", !loading);
  }

  function setFieldFeedback(input, message) {
    input.setAttribute("aria-invalid", String(Boolean(message)));
    const feedback = input
      .closest(".form-group")
      ?.querySelector(".form-feedback");
    if (feedback) feedback.textContent = message;
  }
})();
