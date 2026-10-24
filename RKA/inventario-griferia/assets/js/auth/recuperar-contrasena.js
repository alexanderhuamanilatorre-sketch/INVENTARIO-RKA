import { AuthService } from "./auth-core.js";
// Notificaciones modales centradas (los avisos dejan de ser cajitas en línea)
import { NotificationModal } from "../core/notifications.js";
import "../core/input-guard.js";

(function initRecuperarContrasena() {
  const authService = new AuthService();
  authService.redirectIfAuthenticated("../pages/dashboard.html");

  const stepBuscarCuenta = document.getElementById("stepBuscarCuenta");
  const stepVerificarIdentidad = document.getElementById(
    "stepVerificarIdentidad",
  );
  const stepNuevaContrasena = document.getElementById("stepNuevaContrasena");
  const stepperItems = document.querySelectorAll(
    "#recoveryStepper .auth-stepper__item",
  );

  const formBuscarCuenta = document.getElementById("formBuscarCuenta");
  const inputBuscarCuenta = document.getElementById("inputBuscarCuenta");
  const btnBuscarCuenta = document.getElementById("btnBuscarCuenta");
  const alertBuscarCuenta = document.getElementById("alertBuscarCuenta");

  const lblUsuarioRecuperacion = document.getElementById(
    "lblUsuarioRecuperacion",
  );
  const lblCorreoRecuperacion = document.getElementById(
    "lblCorreoRecuperacion",
  );
  const lblPreguntaSeguridad = document.getElementById("lblPreguntaSeguridad");
  const formVerificarIdentidad = document.getElementById(
    "formVerificarIdentidad",
  );
  const inputRespuestaSeguridad = document.getElementById(
    "inputRespuestaSeguridad",
  );
  const btnVerificarIdentidad = document.getElementById(
    "btnVerificarIdentidad",
  );
  const btnVolverPaso1 = document.getElementById("btnVolverPaso1");
  const alertVerificarIdentidad = document.getElementById(
    "alertVerificarIdentidad",
  );

  const formNuevaContrasena = document.getElementById("formNuevaContrasena");
  const inputNuevaContrasena = document.getElementById("inputNuevaContrasena");
  const inputConfirmarContrasena = document.getElementById(
    "inputConfirmarContrasena",
  );
  const btnToggleNuevaPass = document.getElementById("btnToggleNuevaPass");
  const btnToggleConfirmPass = document.getElementById("btnToggleConfirmPass");
  const btnRestablecerContrasena = document.getElementById(
    "btnRestablecerContrasena",
  );
  const btnVolverPaso2 = document.getElementById("btnVolverPaso2");
  const alertNuevaContrasena = document.getElementById("alertNuevaContrasena");
  const alertExitoRecuperacion = document.getElementById(
    "alertExitoRecuperacion",
  );

  let solicitudId = null;
  let tokenRecuperacion = null;

  function clearFeedback(scopeForm) {
    if (!scopeForm) return;
    scopeForm
      .querySelectorAll(".form-feedback")
      .forEach((el) => (el.textContent = ""));
  }

  function setFieldFeedback(input, message) {
    if (!input) return;
    const feedbackEl = document.querySelector(
      `[data-feedback="${input.name}"]`,
    );
    if (feedbackEl) feedbackEl.textContent = message;
  }

  /**
   * Los avisos se muestran como MODAL centrado en pantalla (sombra y colores
   * del sistema), igual que en el resto de la aplicación. El div en línea solo
   * se limpia para que no conserve texto de un aviso anterior.
   */
  function showAlert(alertEl, message, type = "danger") {
    hideAlert(alertEl);
    const texto = message || "";
    if (type === "success") NotificationModal.success(texto);
    else NotificationModal.error(texto);
  }

  function hideAlert(alertEl) {
    if (!alertEl) return;
    alertEl.classList.add("d-none");
    alertEl.textContent = "";
  }

  function setStep(stepNumber) {
    stepBuscarCuenta?.classList.toggle("d-none", stepNumber !== 1);
    stepVerificarIdentidad?.classList.toggle("d-none", stepNumber !== 2);
    stepNuevaContrasena?.classList.toggle("d-none", stepNumber !== 3);
    stepperItems.forEach((item) => {
      const s = parseInt(item.dataset.step);
      item.classList.toggle("active", s <= stepNumber);
    });
    if (stepNumber === 1) inputBuscarCuenta?.focus();
    if (stepNumber === 2) inputRespuestaSeguridad?.focus();
    if (stepNumber === 3) inputNuevaContrasena?.focus();
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    const text = btn.querySelector(".btn-text");
    const spinner = btn.querySelector(".btn-spinner");
    if (text) text.classList.toggle("d-none", loading);
    if (spinner) spinner.classList.toggle("d-none", !loading);
  }

  function togglePassword(input, btn) {
    if (!input || !btn) return;
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    const icon = btn.querySelector("i");
    if (icon) {
      icon.classList.toggle("bi-eye", !isPass);
      icon.classList.toggle("bi-eye-slash", isPass);
    }
    btn.setAttribute("aria-pressed", String(isPass));
  }

  btnToggleNuevaPass?.addEventListener("click", () =>
    togglePassword(inputNuevaContrasena, btnToggleNuevaPass),
  );
  btnToggleConfirmPass?.addEventListener("click", () =>
    togglePassword(inputConfirmarContrasena, btnToggleConfirmPass),
  );

  formBuscarCuenta?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFeedback(formBuscarCuenta);
    hideAlert(alertBuscarCuenta);

    const identificador = inputBuscarCuenta?.value.trim();
    if (!identificador) {
      setFieldFeedback(
        inputBuscarCuenta,
        "Ingresa tu usuario o correo electrónico.",
      );
      return;
    }

    setBtnLoading(btnBuscarCuenta, true);
    const res = await authService.iniciarRecuperacionContrasena(identificador);
    setBtnLoading(btnBuscarCuenta, false);
    if (res.success && res.userData) {
      solicitudId = res.solicitudId;
      tokenRecuperacion = null;
      lblUsuarioRecuperacion.textContent = res.userData.usuario || "-";
      lblCorreoRecuperacion.textContent = res.userData.correo || "-";
      lblPreguntaSeguridad.value =
        res.userData.preguntaSeguridad || "No configurada";
      inputRespuestaSeguridad.value = "";
      setStep(2);
    } else {
      showAlert(
        alertBuscarCuenta,
        res.message || "No se pudo encontrar la cuenta.",
      );
    }
  });

  inputBuscarCuenta?.addEventListener("input", () => {
    hideAlert(alertBuscarCuenta);
    clearFeedback(formBuscarCuenta);
  });

  btnVolverPaso1?.addEventListener("click", () => setStep(1));

  formVerificarIdentidad?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFeedback(formVerificarIdentidad);
    hideAlert(alertVerificarIdentidad);

    const respuesta = inputRespuestaSeguridad?.value || "";
    if (!solicitudId) {
      showAlert(
        alertVerificarIdentidad,
        "La solicitud expiró. Vuelve a buscar tu cuenta.",
      );
      setStep(1);
      return;
    }
    if (!respuesta.trim()) {
      setFieldFeedback(
        inputRespuestaSeguridad,
        "La respuesta de seguridad es obligatoria.",
      );
      return;
    }

    setBtnLoading(btnVerificarIdentidad, true);
    const res = await authService.verificarRespuestaSeguridad(
      solicitudId,
      respuesta,
    );
    setBtnLoading(btnVerificarIdentidad, false);
    if (res.success) {
      tokenRecuperacion = res.token;
      inputNuevaContrasena.value = "";
      inputConfirmarContrasena.value = "";
      hideAlert(alertNuevaContrasena);
      hideAlert(alertExitoRecuperacion);
      setStep(3);
    } else {
      showAlert(
        alertVerificarIdentidad,
        res.message || "Respuesta incorrecta.",
      );
    }
  });

  inputRespuestaSeguridad?.addEventListener("input", () => {
    hideAlert(alertVerificarIdentidad);
    clearFeedback(formVerificarIdentidad);
  });

  btnVolverPaso2?.addEventListener("click", () => {
    // Al verificar se rota el token; volver a la pregunta exige una nueva solicitud.
    tokenRecuperacion = null;
    solicitudId = null;
    setStep(1);
  });

  formNuevaContrasena?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFeedback(formNuevaContrasena);
    hideAlert(alertNuevaContrasena);
    hideAlert(alertExitoRecuperacion);

    const nueva = inputNuevaContrasena?.value || "";
    const confirmar = inputConfirmarContrasena?.value || "";

    let hasErr = false;
    if (!nueva || nueva.length < 6) {
      setFieldFeedback(
        inputNuevaContrasena,
        "La contraseña debe tener al menos 6 caracteres.",
      );
      hasErr = true;
    }
    if (confirmar !== nueva) {
      setFieldFeedback(
        inputConfirmarContrasena,
        "Las contraseñas no coinciden.",
      );
      hasErr = true;
    }
    if (hasErr) return;

    if (!tokenRecuperacion) {
      showAlert(
        alertNuevaContrasena,
        "La verificación expiró. Vuelve a iniciar el proceso.",
      );
      setStep(1);
      return;
    }

    setBtnLoading(btnRestablecerContrasena, true);
    const res = await authService.restablecerContrasena(
      tokenRecuperacion,
      nueva,
    );
    setBtnLoading(btnRestablecerContrasena, false);
    if (res.success) {
      // Aviso modal centrado: al aceptarlo se redirige al inicio de sesión
      NotificationModal.success(
        "Ya puedes iniciar sesión con tu nueva contraseña.",
        {
          titulo: "Contraseña restablecida",
          textoAceptar: "Ir a iniciar sesión",
        },
      ).then(() => window.location.replace("./login.html"));
    } else {
      showAlert(
        alertNuevaContrasena,
        res.message || "No se pudo restablecer la contraseña.",
      );
    }
  });

  [inputNuevaContrasena, inputConfirmarContrasena].forEach((inp) =>
    inp?.addEventListener("input", () => {
      hideAlert(alertNuevaContrasena);
      hideAlert(alertExitoRecuperacion);
      clearFeedback(formNuevaContrasena);
    }),
  );

  setStep(1);
})();
