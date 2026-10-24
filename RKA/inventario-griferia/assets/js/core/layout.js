import { AuthService } from "../auth/auth-core.js";

/**
 * LayoutManager
 * Gestiona sidebar, topbar, navegación entre secciones y búsqueda global
 */
export class LayoutManager {
  constructor() {
    this.authService = new AuthService();
    this.sidebar = document.getElementById("sidebar");
    this.sidebarToggle = document.getElementById("sidebarToggle");
    this.mobileMenuToggle = document.getElementById("mobileMenuToggle");
    this.sidebarBackdrop = document.getElementById("sidebarBackdrop");
    this.navLinks = document.querySelectorAll(".nav-link[data-section]");
    this.contentSections = document.querySelectorAll(".content-section");
    this.globalSearch = document.getElementById("globalSearch");
    this.userProfileBtn = document.getElementById("userProfileBtn");
    this.userProfileMenu = document.getElementById("userProfileMenu");
    this.btnLogout = document.getElementById("btnLogout");
    this.lblUserName = document.getElementById("lblUserName");
    this.lblUserNameMenu = document.getElementById("lblUserNameMenu");
    this.lblUserEmail = document.getElementById("lblUserEmail");
    this.userAvatar = document.getElementById("userAvatar");
    this.currentSection = this._getInitialSection();
  }

  init() {
    this._applyUserInfo();
    this._applyPermissions();
    this._bindSidebarEvents();
    this._bindNavigationEvents();
    this._bindGlobalSearch();
    this._bindUserMenuEvents();
    this._setActiveSection(this.currentSection);
    this._handleResponsiveSidebar();

    window.addEventListener("rkal:session-updated", () => {
      this._applyUserInfo();
      this._applyPermissions();
      this._setActiveSection(this.currentSection);
    });
  }

  /**
   * Oculta los enlaces sin permiso y añade "Permisos y accesos" solo para
   * quienes pueden administrar el RBAC. La seguridad real la aplica el backend.
   */
  _applyPermissions() {
    const permisos = this.authService.getPermisos();
    const porCodigo = new Map(permisos.map((p) => [p.codigo, p]));
    const permitidos = [];

    this.navLinks.forEach((link) => {
      const codigo = link.dataset.section;
      const permiso = porCodigo.get(codigo);
      const visible = Boolean(permiso && permiso.puedeVer);
      const item = link.closest(".sidebar-nav__item");
      if (item) item.hidden = !visible;
      if (visible) permitidos.push(codigo);
    });

    const navList = document.querySelector(".sidebar-nav__list");
    if (!navList) {
      document.documentElement.setAttribute("data-rkal-allow", Array.from(new Set(permitidos)).join(" "));
      return;
    }

    // Clientes permanece en la base de datos y en su página, pero ya no se
    // muestra en la navegación lateral.
    navList
      .querySelectorAll('.nav-link[data-section="clientes"]')
      .forEach((link) => link.closest(".sidebar-nav__item")?.remove());

    // Panel RBAC: solo visible para Administrador y Jefe General.
    const rbac = porCodigo.get("configuracion.permisos");
    if (rbac?.puedeVer) {
      let link = navList.querySelector('[data-section="configuracion.permisos"]');
      if (!link) {
        navList.insertAdjacentHTML(
          "beforeend",
          `<li class="sidebar-nav__item"><a href="./permisos.html#permisos" class="nav-link" data-section="configuracion.permisos"><i class="bi bi-shield-lock-fill nav-link__icon"></i><span class="nav-link__label">Permisos y accesos</span></a></li>`
        );
        link = navList.querySelector('[data-section="configuracion.permisos"]');
      }
      if (link?.closest(".sidebar-nav__item")) link.closest(".sidebar-nav__item").hidden = false;
      permitidos.push("configuracion.permisos");
    }

    this._orderNavigation(navList);

    // Refrescar la lista usada por los listeners de navegación.
    this.navLinks = document.querySelectorAll(".nav-link[data-section]");

    // Fuente de verdad visual del CSS anti-parpadeo (solo secciones visibles).
    document.documentElement.setAttribute("data-rkal-allow", Array.from(new Set(permitidos)).join(" "));
  }

  /**
   * Ordena el menú lateral de forma centralizada. Configuración queda siempre
   * al final, después de Permisos y accesos.
   */
  _orderNavigation(navList) {
    const orden = [
      "dashboard",
      "productos",
      "inventario",
      "movimientos",
      "ventas",
      "proveedores",
      "reportes",
      "configuracion.permisos",
      "configuracion",
    ];
    const posicion = new Map(orden.map((codigo, indice) => [codigo, indice]));
    const items = Array.from(navList.children).filter((item) =>
      item.classList.contains("sidebar-nav__item")
    );

    items.sort((a, b) => {
      const codigoA = a.querySelector(".nav-link[data-section]")?.dataset.section;
      const codigoB = b.querySelector(".nav-link[data-section]")?.dataset.section;
      const posA = posicion.has(codigoA) ? posicion.get(codigoA) : orden.length;
      const posB = posicion.has(codigoB) ? posicion.get(codigoB) : orden.length;
      return posA - posB;
    });

    items.forEach((item) => navList.appendChild(item));
  }

  setActiveSection(sectionId) {
    this._setActiveSection(sectionId);
  }

  _applyUserInfo() {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return;

    const nombre = currentUser.nombre || currentUser.usuario || "Usuario";
    const correo = currentUser.correo || "";

    if (this.lblUserName) this.lblUserName.textContent = nombre;
    if (this.lblUserNameMenu) this.lblUserNameMenu.textContent = nombre;
    if (this.lblUserEmail) this.lblUserEmail.textContent = correo;

    if (this.userAvatar) {
      this.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=0D6EFD&color=fff&bold=true`;
      this.userAvatar.alt = `Avatar de ${nombre}`;
    }
  }

  _getInitialSection() {
    const hash = window.location.hash.replace("#", "");
    const validSections = Array.from(this.contentSections).map((s) => s.id);
    return validSections.includes(hash) ? hash : "dashboard";
  }

  _bindSidebarEvents() {
    this.sidebarToggle?.addEventListener("click", () => this._toggleSidebarCollapse());
    this.mobileMenuToggle?.addEventListener("click", () => this._openMobileSidebar());
    this.sidebarBackdrop?.addEventListener("click", () => this._closeMobileSidebar());
    window.addEventListener("resize", () => this._handleResponsiveSidebar());
  }

  /**
   * Colapsa/expande el sidebar. Al colapsar conserva el ancho reducido con
   * el logo y los iconos de cada sección visibles, y oculta los textos.
   */
  _toggleSidebarCollapse() {
    if (window.innerWidth <= 768) {
      this._closeMobileSidebar();
      return;
    }
    const isCollapsed = document.documentElement.classList.toggle("rkal-sidebar-collapsed");
    localStorage.setItem("rkal_sidebar_collapsed", isCollapsed ? "1" : "0");
  }

  _openMobileSidebar() {
    this.sidebar?.classList.add("is-open");
    this.sidebarBackdrop?.classList.add("is-visible");
    document.body.classList.add("overflow-hidden");
  }

  _closeMobileSidebar() {
    this.sidebar?.classList.remove("is-open");
    this.sidebarBackdrop?.classList.remove("is-visible");
    document.body.classList.remove("overflow-hidden");
  }

  _handleResponsiveSidebar() {
    const isMobile = window.innerWidth <= 768;

    if (!isMobile) this._closeMobileSidebar();

    const collapsed = localStorage.getItem("rkal_sidebar_collapsed") === "1";
    if (isMobile) {
      document.documentElement.classList.remove("rkal-sidebar-collapsed");
    } else {
      document.documentElement.classList.toggle("rkal-sidebar-collapsed", collapsed);
    }
  }

  _bindNavigationEvents() {
    this.navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href");
        if (href && href.includes(".html")) {
          return; // Navegación a otra página
        }
        e.preventDefault();
        const sectionId = link.dataset.section;
        if (!sectionId) return;
        this._setActiveSection(sectionId);
        window.location.hash = `#${sectionId}`;
        if (window.innerWidth <= 768) this._closeMobileSidebar();
      });
    });

    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.replace("#", "");
      if (hash) this._setActiveSection(hash);
    });
  }

  _setActiveSection(sectionId) {
    this.contentSections.forEach((section) => {
      section.classList.toggle("is-active", section.id === sectionId);
    });

    this.navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.section === sectionId);
    });

    this.currentSection = sectionId;

    document.dispatchEvent(
      new CustomEvent("sectionChange", { detail: { sectionId } })
    );
  }

  _bindGlobalSearch() {
    this.globalSearch?.addEventListener("input", (e) => {
      const term = e.target.value.trim().toLowerCase();
      document.dispatchEvent(new CustomEvent("globalSearch", { detail: { term } }));
    });

    this.globalSearch?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.target.value = "";
        e.target.blur();
        document.dispatchEvent(new CustomEvent("globalSearch", { detail: { term: "" } }));
      }
    });
  }

  _bindUserMenuEvents() {
    this.userProfileBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.userProfileMenu?.classList.toggle("is-open");
    });

    document.addEventListener("click", (e) => {
      if (!this.userProfileMenu?.contains(e.target) && !this.userProfileBtn?.contains(e.target)) {
        this.userProfileMenu?.classList.remove("is-open");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.userProfileMenu?.classList.remove("is-open");
    });

    this.btnLogout?.addEventListener("click", async () => {
      await this.authService.logout();
      window.location.replace("../auth/login.html");
    });
  }
}
