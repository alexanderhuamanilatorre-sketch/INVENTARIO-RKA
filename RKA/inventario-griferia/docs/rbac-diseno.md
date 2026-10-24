# Módulo de Gestión de Permisos y Control de Acceso (RBAC)

**Proyecto:** RKA — Sistema de Gestión de Inventario de Grifería

**Documento:** Diseño funcional, UX/UI y modelo de datos  
**Versión:** 1.0  
**Ámbito:** Panel de configuración de visibilidad y acceso por roles

---

## 1. Resumen ejecutivo

Se propone un módulo llamado **“Permisos y accesos”**, ubicado en:

```
Configuración → Seguridad → Permisos y accesos
```

Características principales:

- Solo los roles **Administrador** y **Jefe General** pueden abrir el panel y modificar permisos.
- El administrador selecciona **otro rol** y configura, sección por sección:
  - **Visible en menú:** si la sección aparece en la navegación lateral.
  - **Acceso permitido:** si la ruta y las API de esa sección pueden utilizarse.
- La configuración se guarda de forma **explícita y confirmada**, no con autoguardado.
- El backend es la autoridad final. Ocultar un botón en el frontend **no** es una medida de seguridad.
- Todo cambio queda auditado y protegido contra ediciones concurrentes.
- Las secciones protegidas, como la propia configuración de permisos, **no se pueden modificar desde la interfaz**.

> **Decisión clave:** “Visible” y “acceder” son permisos distintos. Un usuario puede tener acceso a una sección sin verla en el menú (por ejemplo, un detalle al que solo se llega desde un enlace), pero **no puede verla en el menú si no tiene acceso**, porque se produciría un enlace roto.

---

## 2. Contexto actual del sistema

### 2.1 Stack

- Frontend: HTML, CSS y JavaScript vanilla.
- Backend: Node.js + Express.
- Base de datos: PostgreSQL.
- Autenticación actual: el login contra PostgreSQL devuelve los datos del usuario y el frontend crea una sesión en `localStorage`.

### 2.2 Secciones actuales

Según la navegación de `pages/*.html`, el catálogo base es:

| Código | Sección | Ruta |
|---|---|---|
| `dashboard` | Dashboard | `pages/dashboard.html#dashboard` |
| `productos` | Productos | `pages/productos.html#productos` |
| `inventario` | Inventario | `pages/inventario.html#inventario` |
| `movimientos` | Movimientos | `pages/movimientos.html#movimientos` |
| `ventas` | Ventas | `pages/ventas.html#ventas` |
| `proveedores` | Proveedores | `pages/proveedores.html#proveedores` |
| `reportes` | Reportes | `pages/reportes.html#reportes` |
| `configuracion` | Configuración | `pages/configuracion.html#configuracion` |
| `categorias` | Categorías | `pages/categorias.html#categorias` |

> **Observación:** `clientes.html` y su tabla se conservan por compatibilidad de datos,
> pero la sección `clientes` fue retirada del catálogo, de la navegación y del panel
> de permisos. La página responde `403` y la API queda bloqueada. El menú se ordena
> de forma centralizada y `configuracion` queda siempre al final.

### 2.3 Roles actuales

En la interfaz de configuración se usan etiquetas como:

- Jefe General
- Jefa de Tienda
- Subjefe de Tienda
- Personal de Almacén

En la semilla SQL existen:

- `administrador`
- `vendedor`

**Problema:** los nombres no están normalizados y el código actual asocia roles por etiqueta. Para el RBAC se recomienda separar:

- `codigo`: identificador estable, en minúsculas y sin espacios (ej. `jefe_general`).
- `nombre_rol` o `nombre_visible`: etiqueta mostrada al usuario (ej. `Jefe General`).

### 2.4 Limitación crítica de seguridad

El esquema actual de `roles`, `permisos` y `rol_permisos` es plano y no modela secciones ni subsecciones. Además, la autenticación del frontend vive en `localStorage` y las rutas de la API no verifican identidad ni permisos.

**Conclusión:** el RBAC no puede considerarse seguro hasta que:

1. La sesión se valide en el servidor (cookie `HttpOnly` o token firmado).
2. Cada endpoint protegido ejecute un middleware de autorización.
3. Las contraseñas se almacenen con hash (bcrypt/argon2), no en texto plano.

Este documento asume que esos cambios forman parte de la implementación. Sin ellos, el panel sería solo cosmético.

---

## 3. Principios de diseño

1. **Denegar por defecto:** si no existe un permiso explícito, no hay acceso.
2. **El backend manda:** la interfaz oculta lo que el usuario no puede usar, pero la API siempre valida.
3. **Mínimo privilegio:** cada rol recibe solo lo necesario.
4. **Separación visual/acceso:** “ver en menú” y “poder acceder” son columnas independientes.
5. **Herencia jerárquica:** si un módulo padre está oculto o bloqueado, sus subsecciones quedan bloqueadas efectivamente.
6. **Configuración explícita:** botón “Guardar cambios” + confirmación con resumen de impacto.
7. **Trazabilidad:** cada cambio registra actor, rol afectado, valores anteriores, valores nuevos y fecha.
8. **Protección contra auto-bloqueo:** un usuario no puede modificar los permisos de su propio rol.
9. **Secciones protegidas:** el permiso que da acceso a este panel no se puede otorgar ni quitar desde la matriz.
10. **Extensible:** el modelo debe permitir añadir mañana acciones CRUD (`crear`, `editar`, `eliminar`, `exportar`) sin rediseñar todo.

---

## 4. Roles autorizados al panel

### 4.1 Regla de acceso

El acceso al panel se controla con el permiso de sección:

```
configuracion.permisos
```

Inicialmente, solo los roles con código `administrador` y `jefe_general` tienen ese permiso en `permisos_rol`.

No se debe programar la regla como:

```js
if (usuario.rol === "Administrador" || usuario.rol === "Jefe General")
```

porque cualquier cambio de etiqueta rompe la seguridad. La comprobación correcta es por permiso:

```js
if (await rolPuede(usuario.id_rol, "configuracion.permisos", "acceder"))
```

### 4.2 Matriz de capacidades del panel

| Capacidad | Administrador | Jefe General | Otros roles |
|---|---:|---:|---:|
| Ver el ítem “Permisos y accesos” en el menú | Sí | Sí | No |
| Abrir la ruta del panel | Sí | Sí | No (403) |
| Consultar la matriz de permisos | Sí | Sí | No (403) |
| Editar permisos de otros roles | Sí | Sí | No (403) |
| Editar permisos de su propio rol | No | No | No |
| Otorgar/quitar `configuracion.permisos` | No | No | No |
| Crear roles | Sí | Sí | No |
| Desactivar roles | Sí | Sí | No |
| Ver historial de cambios | Sí | Sí | No |

### 4.3 Invariante de seguridad

Debe existir **al menos un usuario activo** cuyo rol tenga el permiso `configuracion.permisos`. Como ese permiso es protegido y no se puede retirar desde la interfaz, la invariante se mantiene por diseño. Ante cualquier cambio directo en base de datos, una validación de arranque o un test debe comprobarla.

---

## 5. Flujo de trabajo

### 5.1 Flujo principal

```
┌─────────────┐
│   Login     │
└──────┬──────┘
       ▼
┌──────────────────────────────┐
│ Backend autentica y devuelve │
│ rol + permisos efectivos     │
└──────┬───────────────────────┘
       ▼
┌──────────────────────────────┐
│ Frontend construye el menú   │
│ solo con secciones visibles  │
└──────┬───────────────────────┘
       ▼
┌──────────────────────────────┐
│ Admin / Jefe General abre    │
│ Configuración → Permisos     │
└──────┬───────────────────────┘
       ▼
┌──────────────────────────────┐
│ Selecciona otro rol          │
└──────┬───────────────────────┘
       ▼
┌──────────────────────────────┐
│ Edita switches de la matriz  │
│ (estado “cambios sin guardar”)│
└──────┬───────────────────────┘
       ▼
┌──────────────────────────────┐
│ Pulsa “Guardar cambios”      │
└──────┬───────────────────────┘
       ▼
┌──────────────────────────────┐
│ Modal de confirmación        │
│ con resumen de impacto       │
└──────┬───────────────────────┘
       ▼
┌──────────────────────────────┐
│ PUT /api/roles/:id/permisos  │
│ - valida sesión y permiso    │
│ - valida versión (409)       │
│ - valida secciones protegidas│
│ - guarda en transacción      │
│ - registra auditoría         │
└──────┬───────────────────────┘
       ▼
┌──────────────────────────────┐
│ Cambios aplicados            │
│ Sesiones activas: siguiente  │
│ petición ya los respeta      │
└──────────────────────────────┘
```

### 5.2 Flujo de acceso no autorizado

```
Usuario autenticado intenta abrir /pages/inventario.html
        │
        ▼
Guard de página consulta permisos efectivos
        │
        ├── Tiene acceso ──► Renderiza la página
        │
        └── No tiene acceso ──► Vista 403
                                  ├── “Ir a mi panel”
                                  └── “Solicitar acceso”
```

Para una llamada a la API:

```
GET /api/productos
        │
        ▼
Middleware requirePermission("productos", "acceder")
        │
        ├── Autorizado ──► 200
        └── No autorizado ──► 403 { error: "FORBIDDEN" }
```

### 5.3 Flujo de creación de un rol

```
Admin pulsa “Nuevo rol”
        │
        ▼
Formulario: nombre, código, descripción, clonar de (opcional)
        │
        ▼
Se crea en estado “borrador”, con todos los permisos en false
        │
        ▼
Admin configura accesos mínimos
        │
        ▼
Valida que exista al menos una sección accesible
        │
        ▼
Activa el rol
        │
        ▼
El rol aparece en el selector y puede asignarse a usuarios
```

### 5.4 Guardado: decisión de UX

Se recomienda **guardado explícito con confirmación**, no guardado en tiempo real.

Razones:

- La matriz puede implicar decenas de cambios.
- Un clic accidental puede dejar sin acceso a un grupo completo de usuarios.
- La confirmación permite mostrar el impacto (“4 usuarios activos”).
- Es más fácil auditar un cambio intencional que decenas de autoguardados.
- Se evita que dos administradores se pisen continuamente.

Los cambios se aplican **inmediatamente después de confirmar**. No es necesario reiniciar sesión: la siguiente petición del usuario afectado consulta los permisos actualizados.

Opcionalmente, para equipos que quieran “tiempo real”, se puede emitir un evento SSE/WebSocket `permisos.actualizados` que fuerce al frontend a refrescar el menú. No se recomienda autoguardado por switch en la versión 1.

---

## 6. Diseño de interfaz (wireframe en texto)

### 6.1 Navegación lateral

Se añade un ítem dentro de Configuración:

```
┌──────────────────────────────┐
│  RKA                        │
│                              │
│  ▣ Dashboard                 │
│  ▣ Productos                 │
│  ▣ Inventario                │
│  ▣ Movimientos               │
│  ▣ Ventas                    │
│  ▣ Proveedores               │
│  ▣ Reportes                  │
│  ▾ Configuración             │
│      Usuarios y roles        │
│      Permisos y accesos  ◀   │
│      Datos de la empresa     │
└──────────────────────────────┘
```

- El ítem solo se renderiza si el usuario tiene `configuracion.permisos` con `ver = true`.
- Si el usuario escribe la URL directamente y no tiene acceso, se muestra la vista 403.
- Aunque se manipule el DOM para mostrar el ítem, la API rechazará las operaciones.

### 6.2 Pantalla principal — vista “Por rol”

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ RKA   [sidebar]        Permisos y control de acceso          Admin ▾        │
├────────────────┬─────────────────────────────────────────────────────────────┤
│ Dashboard      │  Configuración / Seguridad / Permisos y accesos              │
│ Productos      │                                                             │
│ Inventario     │  Define qué secciones puede ver y usar cada rol.            │
│ Movimientos    │  Solo Administrador y Jefe General pueden editar esta        │
│ Ventas         │  configuración.                                             │
│ Proveedores    │                                                             │
│ Reportes       │  ┌───────────────────────────────────────────────────────┐  │
│ Configuración  │  │ Rol a configurar: [ Jefe de Tienda        ▾ ]         │  │
│   Usuarios     │  │ Usuarios activos: 4   ·   Estado: Activo              │  │
│   Permisos ◀   │  │ Última modificación: 18/10/2026 10:42 por Admin       │  │
│                │  └───────────────────────────────────────────────────────┘  │
│                │                                                             │
│                │  [🔍 Buscar sección o código...]  [Filtro: Todos ▾]         │
│                │  [Expandir todo] [Contraer todo]   [Por rol | Matriz]       │
│                │                                                             │
│                │  ┌───────────────────────────────────────────────────────┐  │
│                │  │ Sección                         Visible   Acceso       │  │
│                │  ├───────────────────────────────────────────────────────┤  │
│                │  │ ▾ Dashboard                      [● ]     [● ]        │  │
│                │  │ ▾ Productos                      [● ]     [● ]        │  │
│                │  │     Catálogo                     [● ]     [● ]        │  │
│                │  │     Categorías                   [○ ]     [○ ]        │  │
│                │  │     Marcas                       [○ ]     [○ ]        │  │
│                │  │ ▾ Inventario                     [● ]     [● ]        │  │
│                │  │     Stock actual                 [● ]     [● ]        │  │
│                │  │     Alertas de stock             [● ]     [○ ]        │  │
│                │  │     Ajustes                      [○ ]     [○ ]        │  │
│                │  │ ▾ Movimientos                    [● ]     [● ]        │  │
│                │  │     Entradas                     [● ]     [● ]        │  │
│                │  │     Salidas                      [● ]     [● ]        │  │
│                │  │     Historial                    [● ]     [● ]        │  │
│                │  │ ▸ Ventas                         [● ]     [● ]        │  │
│                │  │ ▸ Proveedores                    [● ]     [● ]        │  │
│                │  │ ▸ Reportes                       [○ ]     [○ ]        │  │
│                │  │ ▸ Configuración                  [○ ]     [○ ]        │  │
│                │  │     Usuarios y roles             [○ ]     [○ ]        │  │
│                │  │     🔒 Permisos y accesos        [● ]     [● ]        │  │
│                │  └───────────────────────────────────────────────────────┘  │
│                │                                                             │
│                │  4 cambios sin guardar                                      │
│                │                       [Descartar cambios] [Guardar cambios]│
└────────────────┴─────────────────────────────────────────────────────────────┘
```

#### Elementos de la pantalla

| Zona | Elemento | Comportamiento |
|---|---|---|
| Cabecera | Título y breadcrumb | Contexto de ubicación |
| Cabecera | Botón “Historial” | Abre drawer de auditoría |
| Tarjeta de rol | Selector de rol | Solo roles distintos al del usuario actual |
| Tarjeta de rol | Usuarios activos | Impacto potencial del cambio |
| Tarjeta de rol | Estado y última modificación | Confianza y trazabilidad |
| Barra de herramientas | Buscador | Filtra por nombre o código; expande coincidencias |
| Barra de herramientas | Filtro | Todos / Módulos / Subsecciones / Con acceso / Sin acceso / Protegidas |
| Barra de herramientas | Expandir/Contraer | Control de densidad |
| Barra de herramientas | Vista | “Por rol” (edición) y “Matriz” (comparación) |
| Tabla | Fila de sección | Icono, nombre, código, indentación jerárquica |
| Tabla | Switch “Visible” | Muestra u oculta en el menú |
| Tabla | Switch “Acceso” | Permite o bloquea ruta y API |
| Tabla | Candado | Sección protegida, no editable |
| Pie sticky | Resumen de cambios | “N cambios sin guardar” |
| Pie sticky | Descartar | Vuelve al último estado guardado, con confirmación |
| Pie sticky | Guardar | Abre modal de confirmación |

#### Reglas visuales de los switches

| Acción del usuario | Efecto inmediato en la UI |
|---|---|
| Activa “Visible” | Activa automáticamente “Acceso” |
| Desactiva “Acceso” | Desactiva automáticamente “Visible” |
| Activa “Acceso” con “Visible” apagado | Se permite: sección accesible solo por enlace directo. Se muestra ayuda: “No aparecerá en el menú” |
| Desactiva un módulo padre | Sus subsecciones se muestran bloqueadas y con la etiqueta “Heredado: bloqueado”. Los valores guardados de las subsecciones no se destruyen |
| Reactiva el módulo padre | Las subsecciones recuperan sus valores previos |
| Intenta editar una sección protegida | Switch deshabilitado + tooltip “Permiso protegido; solo puede cambiarse por migración” |
| Intenta activar una subsección con el padre bloqueado | La UI activa automáticamente los ancestros necesarios y avisa con un toast |

### 6.3 Vista “Matriz” (comparación roles vs. secciones)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Por rol | Matriz]     Buscar: [__________________]     [Solo diferencias]  │
├──────────────────────────┬────────┬─────────┬─────────────┬─────────┬────────┤
│ Sección                  │ Admin  │ Jefe G. │ Jefe Tienda │ Subjefe │ Almacén│
├──────────────────────────┼────────┼─────────┼─────────────┼─────────┼────────┤
│ Dashboard                │   ✔    │    ✔    │      ✔      │    ✔    │   ✔    │
│ Productos                │   ✔    │    ✔    │      ✔      │    —    │   —    │
│   Catálogo               │   ✔    │    ✔    │      ✔      │    ◐    │   ✔    │
│   Categorías             │   ✔    │    ✔    │      ○      │    —    │   —    │
│ Inventario               │   ✔    │    ✔    │      ✔      │    ✔    │   ✔    │
│   Alertas de stock       │   ✔    │    ✔    │      ◐      │    ✔    │   ○    │
│ Reportes                 │   ✔    │    ✔    │      —      │    —    │   —    │
│ Configuración            │   ✔    │    ✔    │      —      │    —    │   —    │
│   🔒 Permisos y accesos  │   🔒   │    🔒   │      🔒     │    🔒   │   🔒   │
└──────────────────────────┴────────┴─────────┴─────────────┴─────────┴────────┘

Leyenda:
✔  Visible + acceso
◐  Solo acceso (oculto del menú)
○  Sin permiso
—  Bloqueado por un ancestro
🔒  Sección protegida
```

- La primera columna y la cabecera quedan fijas al hacer scroll.
- Cada celda es un botón con estado; al pulsarla se abre la vista “Por rol” enfocada en esa sección.
- Los roles del usuario actual se muestran en solo lectura.
- En pantallas pequeñas, la matriz se sustituye por la vista de acordeón; no se fuerza scroll horizontal.

### 6.4 Modal de confirmación

```
┌──────────────────────────────────────────────────────────────┐
│  Guardar cambios de permisos                             ✕  │
├──────────────────────────────────────────────────────────────┤
│  Rol: Jefe de Tienda                                         │
│  Usuarios activos afectados: 4                               │
│                                                              │
│  Resumen:                                                    │
│   • 3 accesos otorgados                                      │
│   • 1 acceso revocado                                        │
│   • 1 sección ocultada del menú                              │
│                                                              │
│  Secciones que pierden acceso:                               │
│   • Reportes                                                 │
│                                                              │
│  Motivo del cambio (opcional, recomendado si revocas):        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ☐ Entiendo que los usuarios perderán acceso inmediatamente  │
│                                                              │
│                           [Cancelar]  [Confirmar y aplicar]  │
└──────────────────────────────────────────────────────────────┘
```

Reglas:

- El checkbox de confirmación es obligatorio solo si hay revocaciones.
- El botón “Confirmar y aplicar” se deshabilita mientras la petición está en curso.
- Si el backend devuelve `409`, se muestra un modal de conflicto.
- Al terminar, toast: “Permisos de Jefe de Tienda actualizados. 4 usuarios afectados.”
- Se ofrece “Deshacer” durante 10 segundos, implementado como una nueva escritura auditada, no como borrado de auditoría.

### 6.5 Vista 403

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                         🔒                                   │
│                                                              │
│              Acceso no autorizado                            │
│                                                              │
│   Tu rol (Jefe de Tienda) no tiene permiso para acceder a    │
│   esta sección.                                              │
│                                                              │
│   Código: 403 · Sección: inventario.stock                    │
│                                                              │
│        [Ir a mi panel]        [Solicitar acceso]             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- No redirigir silenciosamente al dashboard: el usuario debe entender por qué no puede entrar.
- “Ir a mi panel” lleva a la primera sección accesible según el orden del catálogo.
- “Solicitar acceso” puede crear una notificación al Administrador (fase 2).
- Para APIs, la respuesta es JSON `403`, nunca una página HTML.

### 6.6 Estados de la pantalla

| Estado | Comportamiento |
|---|---|
| Cargando | Skeleton de tabla y selector deshabilitado |
| Sin roles configurables | “No hay otros roles para configurar” |
| Rol sin accesos | Aviso: “Este rol no tiene ninguna sección activa. Sus usuarios no podrán ingresar” |
| Cambios sin guardar | Badge + botón Guardar habilitado + aviso al cerrar/recargar |
| Guardando | Overlay en el botón, switches bloqueados |
| Error de red | Banner con “Reintentar”; no se pierden los cambios locales |
| Conflicto 409 | Modal: “Otro usuario modificó estos permisos” con opción de recargar |
| Éxito | Toast + actualización de “Última modificación” |
| Sin permiso | Vista 403, no la pantalla vacía |

### 6.7 Responsive y accesibilidad

- **Escritorio:** tabla completa con columnas fijas.
- **Tablet:** se oculta la columna de código; se mantienen switches.
- **Móvil:** selector de rol + acordeón por módulo; barra de guardado fija inferior.
- **Teclado:** todos los switches son enfocables; `Espacio` alterna; `Tab` recorre la matriz.
- **ARIA:** `role="switch"`, `aria-checked`, `aria-label="Visible en menú: Inventario"`.
- **Contraste:** no depender solo del color; usar icono + texto.
- **Anuncios:** `aria-live="polite"` para “Cambios guardados”.
- **Modales:** foco atrapado, cierre con `Esc`, retorno de foco al botón que abrió.
- **Textos:** “Visible en menú” y “Acceso permitido” con tooltips explicativos.

### 6.8 Microcopy recomendado

- Título: “Permisos y accesos”.
- Subtítulo: “Define qué puede ver y usar cada rol. Los cambios se aplican al guardar.”
- Ayuda de “Visible”: “Si se desactiva, la sección no aparece en el menú. Si además se quita el acceso, tampoco podrá abrirse por URL.”
- Ayuda de “Acceso”: “Permite abrir la ruta y usar las API de la sección.”
- Estado protegido: “Este permiso está protegido. Solo puede modificarse mediante una migración autorizada.”
- Éxito: “Permisos actualizados. Los cambios ya están vigentes.”

---

## 7. Modelo de datos

### 7.1 Diagrama entidad-relación

```
┌──────────────┐        ┌────────────────┐        ┌──────────────────┐
│   usuarios   │ N────1 │     roles      │ 1────N │   permisos_rol   │
└──────────────┘        └────────────────┘        └────────┬─────────┘
                                                            │ N
                                                            │
                                                   ┌────────▼─────────┐
                                                   │    secciones     │
                                                   │ (jerárquica)     │
                                                   └────────┬─────────┘
                                                            │ 1
                                                            │ N
                                                   ┌────────▼─────────┐
                                                   │    secciones     │
                                                   │    (hijas)       │
                                                   └──────────────────┘

┌──────────────────────┐
│ auditoria_permisos   │  Registra cada guardado y su diff
└──────────────────────┘
```

### 7.2 DDL propuesto (PostgreSQL)

> Este script asume el esquema actual de `schema.sql`. Si se parte de cero, se pueden crear directamente `roles`, `secciones`, `permisos_rol` y `auditoria_permisos`.

```sql
BEGIN;

-- ============================================================
-- 1. Ampliación de roles
-- ============================================================
ALTER TABLE roles
  ADD COLUMN codigo           VARCHAR(50),
  ADD COLUMN es_sistema       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN version_permisos INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now();

-- Normalizar códigos a partir del nombre existente
UPDATE roles
SET codigo = lower(regexp_replace(nombre_rol, '[^a-zA-Z0-9]+', '_', 'g'))
WHERE codigo IS NULL;

ALTER TABLE roles ALTER COLUMN codigo SET NOT NULL;

CREATE UNIQUE INDEX uq_roles_codigo ON roles (codigo);

-- ============================================================
-- 2. Catálogo jerárquico de secciones
-- ============================================================
CREATE TABLE secciones (
  id_seccion    SERIAL PRIMARY KEY,
  codigo        VARCHAR(80)  NOT NULL UNIQUE,
  nombre        VARCHAR(100) NOT NULL,
  id_padre      INTEGER REFERENCES secciones(id_seccion) ON DELETE CASCADE,
  ruta          VARCHAR(180),
  icono         VARCHAR(60),
  orden         INTEGER NOT NULL DEFAULT 0,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'seccion'
                CHECK (tipo IN ('modulo', 'seccion', 'subseccion')),
  es_contenedor BOOLEAN NOT NULL DEFAULT FALSE,
  es_protegida  BOOLEAN NOT NULL DEFAULT FALSE,
  es_inicio     BOOLEAN NOT NULL DEFAULT FALSE,
  estado        VARCHAR(20) NOT NULL DEFAULT 'activo'
                CHECK (estado IN ('activo', 'inactivo')),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_secciones_padre ON secciones (id_padre);
CREATE INDEX idx_secciones_orden ON secciones (orden);

-- Solo puede existir una sección marcada como inicio
CREATE UNIQUE INDEX uq_seccion_inicio
  ON secciones (es_inicio)
  WHERE es_inicio = TRUE;

-- ============================================================
-- 3. Permisos por rol y sección
-- ============================================================
CREATE TABLE permisos_rol (
  id_rol          INTEGER NOT NULL REFERENCES roles(id_rol) ON DELETE CASCADE,
  id_seccion      INTEGER NOT NULL REFERENCES secciones(id_seccion) ON DELETE CASCADE,
  puede_ver       BOOLEAN NOT NULL DEFAULT FALSE,
  puede_acceder   BOOLEAN NOT NULL DEFAULT FALSE,
  actualizado_por INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_rol, id_seccion),
  CONSTRAINT chk_ver_implica_acceso
    CHECK (NOT puede_ver OR puede_acceder)
);

CREATE INDEX idx_permisos_rol_seccion ON permisos_rol (id_seccion);

-- ============================================================
-- 4. Auditoría
-- ============================================================
CREATE TABLE auditoria_permisos (
  id_auditoria BIGSERIAL PRIMARY KEY,
  id_actor     INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  id_rol       INTEGER REFERENCES roles(id_rol) ON DELETE SET NULL,
  accion       VARCHAR(30) NOT NULL
               CHECK (accion IN (
                 'crear_rol', 'activar_rol', 'desactivar_rol',
                 'actualizar_permisos'
               )),
  antes        JSONB,
  despues      JSONB,
  motivo       VARCHAR(300),
  ip           INET,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditoria_rol_fecha
  ON auditoria_permisos (id_rol, creado_en DESC);

-- ============================================================
-- 5. Trigger de actualización
-- ============================================================
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_roles_actualizado
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

CREATE TRIGGER trg_permisos_rol_actualizado
BEFORE UPDATE ON permisos_rol
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- ============================================================
-- 6. Protección de secciones del sistema
-- ============================================================
CREATE OR REPLACE FUNCTION proteger_seccion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.es_protegida THEN
    RAISE EXCEPTION 'No se puede eliminar una sección protegida: %', OLD.codigo;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_proteger_seccion
BEFORE DELETE ON secciones
FOR EACH ROW EXECUTE FUNCTION proteger_seccion();

COMMIT;
```

### 7.3 Diccionario de datos

#### `roles`

| Campo | Tipo | Descripción |
|---|---|---|
| `id_rol` | SERIAL PK | Identificador |
| `codigo` | VARCHAR(50) UNIQUE | Código estable (`administrador`, `jefe_general`, etc.) |
| `nombre_rol` | VARCHAR(50) UNIQUE | Etiqueta visible |
| `descripcion` | VARCHAR(200) | Propósito del rol |
| `estado` | VARCHAR(20) | `activo`, `inactivo`, `borrador` |
| `es_sistema` | BOOLEAN | Si es `true`, no se puede eliminar |
| `version_permisos` | INTEGER | Control de concurrencia optimista |
| `creado_en` / `actualizado_en` | TIMESTAMPTZ | Auditoría temporal |

#### `secciones`

| Campo | Tipo | Descripción |
|---|---|---|
| `id_seccion` | SERIAL PK | Identificador |
| `codigo` | VARCHAR(80) UNIQUE | Clave usada por el frontend y el backend (`inventario.stock`) |
| `nombre` | VARCHAR(100) | Texto visible |
| `id_padre` | INTEGER FK | Padre en la jerarquía; `NULL` para módulos raíz |
| `ruta` | VARCHAR(180) | URL de la página; `NULL` si es solo contenedor |
| `icono` | VARCHAR(60) | Clase de Bootstrap Icons |
| `orden` | INTEGER | Orden del menú |
| `tipo` | VARCHAR(20) | `modulo`, `seccion`, `subseccion` |
| `es_contenedor` | BOOLEAN | Si es un agrupador sin página propia |
| `es_protegida` | BOOLEAN | No editable desde la matriz |
| `es_inicio` | BOOLEAN | Sección de aterrizaje tras el login |
| `estado` | VARCHAR(20) | `activo` / `inactivo` |

#### `permisos_rol`

| Campo | Tipo | Descripción |
|---|---|---|
| `id_rol` | INTEGER FK | Rol |
| `id_seccion` | INTEGER FK | Sección |
| `puede_ver` | BOOLEAN | Aparece en el menú |
| `puede_acceder` | BOOLEAN | Puede abrir ruta y API |
| `actualizado_por` | INTEGER FK | Último actor |
| `actualizado_en` | TIMESTAMPTZ | Fecha del último cambio |

Restricción: `puede_ver = true` exige `puede_acceder = true`.

#### `auditoria_permisos`

| Campo | Tipo | Descripción |
|---|---|---|
| `id_auditoria` | BIGSERIAL PK | Identificador |
| `id_actor` | INTEGER FK | Usuario que realizó el cambio |
| `id_rol` | INTEGER FK | Rol afectado |
| `accion` | VARCHAR(30) | Tipo de operación |
| `antes` / `despues` | JSONB | Matriz o diff antes/después |
| `motivo` | VARCHAR(300) | Justificación opcional |
| `ip` | INET | Origen de la petición |
| `creado_en` | TIMESTAMPTZ | Fecha |

### 7.4 Semilla del catálogo de secciones

Ejemplo representativo; debe completarse con todas las subsecciones reales:

```sql
INSERT INTO secciones
  (codigo, nombre, id_padre, ruta, icono, orden, tipo, es_contenedor, es_protegida, es_inicio)
VALUES
  ('dashboard', 'Dashboard', NULL,
   'pages/dashboard.html#dashboard', 'bi-grid-1x2-fill', 10, 'modulo', FALSE, FALSE, TRUE),

  ('productos', 'Productos', NULL,
   'pages/productos.html#productos', 'bi-tag-fill', 20, 'modulo', FALSE, FALSE, FALSE),

  ('productos.catalogo', 'Catálogo',
   (SELECT id_seccion FROM secciones WHERE codigo = 'productos'),
   'pages/productos.html#productos', 'bi-list-ul', 21, 'subseccion', FALSE, FALSE, FALSE),

  ('productos.categorias', 'Categorías',
   (SELECT id_seccion FROM secciones WHERE codigo = 'productos'),
   'pages/categorias.html#categorias', 'bi-tags', 22, 'subseccion', FALSE, FALSE, FALSE),

  ('inventario', 'Inventario', NULL,
   'pages/inventario.html#inventario', 'bi-box-seam-fill', 30, 'modulo', FALSE, FALSE, FALSE),

  ('inventario.stock', 'Stock actual',
   (SELECT id_seccion FROM secciones WHERE codigo = 'inventario'),
   'pages/inventario.html#inventario', 'bi-boxes', 31, 'subseccion', FALSE, FALSE, FALSE),

  ('inventario.alertas', 'Alertas de stock',
   (SELECT id_seccion FROM secciones WHERE codigo = 'inventario'),
   'pages/inventario.html#alertas', 'bi-exclamation-triangle', 32, 'subseccion', FALSE, FALSE, FALSE),

  ('movimientos', 'Movimientos', NULL,
   'pages/movimientos.html#movimientos', 'bi-arrow-left-right', 40, 'modulo', FALSE, FALSE, FALSE),

  ('ventas', 'Ventas', NULL,
   'pages/ventas.html#ventas', 'bi-cart-fill', 50, 'modulo', FALSE, FALSE, FALSE),

  ('proveedores', 'Proveedores', NULL,
   'pages/proveedores.html#proveedores', 'bi-truck', 60, 'modulo', FALSE, FALSE, FALSE),

  ('reportes', 'Reportes', NULL,
   'pages/reportes.html#reportes', 'bi-bar-chart-fill', 70, 'modulo', FALSE, FALSE, FALSE),

  ('configuracion', 'Configuración', NULL,
   'pages/configuracion.html#configuracion', 'bi-gear-fill', 80, 'modulo', FALSE, FALSE, FALSE),

  ('configuracion.usuarios', 'Usuarios y roles',
   (SELECT id_seccion FROM secciones WHERE codigo = 'configuracion'),
   'pages/configuracion.html#usuarios', 'bi-people-fill', 81, 'subseccion', FALSE, FALSE, FALSE),

  ('configuracion.permisos', 'Permisos y accesos',
   (SELECT id_seccion FROM secciones WHERE codigo = 'configuracion'),
   'pages/permisos.html#permisos', 'bi-shield-lock-fill', 82, 'subseccion', TRUE, TRUE, FALSE);
```

### 7.5 Semilla de permisos protegidos

```sql
-- Los dos roles autorizados reciben acceso al módulo Configuración
-- y a la sección protegida de permisos.
INSERT INTO permisos_rol (id_rol, id_seccion, puede_ver, puede_acceder)
SELECT r.id_rol, s.id_seccion, TRUE, TRUE
FROM roles r
JOIN secciones s
  ON s.codigo IN ('configuracion', 'configuracion.permisos')
WHERE r.codigo IN ('administrador', 'jefe_general')
ON CONFLICT (id_rol, id_seccion) DO UPDATE
SET puede_ver = TRUE,
    puede_acceder = TRUE;
```

### 7.6 Migración desde el esquema actual

El esquema actual tiene:

- `permisos (id_permiso, nombre_categoria, descripcion)`
- `rol_permisos (id_rol, id_permiso)`

Es un modelo plano que no distingue módulos, subsecciones, visibilidad ni acceso. Se recomienda:

1. Crear `secciones`, `permisos_rol` y `auditoria_permisos`.
2. Migrar las categorías existentes de `permisos` a `secciones` como módulos.
3. Revisar y sembrar manualmente la jerarquía real.
4. Actualizar el backend para que use `secciones`/`permisos_rol`.
5. Solo entonces eliminar `rol_permisos` y `permisos` (o mantenerlas como legado de solo lectura durante una versión).

No conviene añadir `id_seccion` a `permisos` porque el nombre de la tabla y su semántica actual (“categoría de permiso”) no representan la navegación.

### 7.7 Función de permiso efectivo

La herencia se calcula recorriendo la cadena de ancestros. Si cualquier ancestro tiene `puede_acceder = false`, la sección queda bloqueada aunque su propio flag sea `true`.

```sql
CREATE OR REPLACE FUNCTION rol_puede(
  p_id_rol INTEGER,
  p_codigo TEXT,
  p_campo  TEXT DEFAULT 'acceder'
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_resultado BOOLEAN;
BEGIN
  IF p_campo NOT IN ('ver', 'acceder') THEN
    RAISE EXCEPTION 'Campo de permiso inválido: %', p_campo;
  END IF;

  WITH RECURSIVE cadena AS (
    SELECT s.id_seccion, s.id_padre
    FROM secciones s
    WHERE s.codigo = p_codigo
      AND s.estado = 'activo'

    UNION ALL

    SELECT p.id_seccion, p.id_padre
    FROM secciones p
    JOIN cadena c ON c.id_padre = p.id_seccion
  )
  SELECT COALESCE(
    bool_and(
      CASE p_campo
        WHEN 'ver' THEN COALESCE(pr.puede_ver, FALSE)
        ELSE COALESCE(pr.puede_acceder, FALSE)
      END
    ),
    FALSE
  )
  INTO v_resultado
  FROM cadena c
  LEFT JOIN permisos_rol pr
    ON pr.id_seccion = c.id_seccion
   AND pr.id_rol = p_id_rol;

  RETURN v_resultado;
END;
$$;
```

Uso:

```sql
SELECT rol_puede(3, 'inventario.stock', 'acceder');
SELECT rol_puede(3, 'inventario.stock', 'ver');
```

> Para un catálogo pequeño (decenas de secciones) esta función es suficiente. Si el catálogo crece, se puede materializar una vista `permisos_efectivos` y refrescarla al guardar.

### 7.8 Índices y rendimiento

- `UNIQUE (id_rol, id_seccion)` en `permisos_rol`.
- Índice por `id_seccion` para construir la matriz.
- Índice por `id_rol` implícito en la PK.
- Índice de auditoría por rol y fecha.
- Para catálogos grandes, cachear el menú por `version_permisos` del rol y invalidar al guardar.

---

## 8. Lógica de backend

### 8.1 Prerrequisito: sesión de servidor

El login actual devuelve el usuario y el frontend guarda la sesión en `localStorage`. Para RBAC se necesita:

1. `POST /api/usuarios/login` valida credenciales con hash.
2. El servidor crea una sesión (`express-session` con store en PostgreSQL/Redis, o JWT firmado de corta duración).
3. Se emite una cookie `HttpOnly`, `Secure` en producción, `SameSite=Lax/Strict`.
4. El frontend no decide el rol ni los permisos; solo los muestra.
5. Cada petición protegida pasa por `requireAuth` y `requirePermission`.

Sin este cambio, cualquiera puede editar `localStorage` y hacerse pasar por Administrador. El panel sería una maqueta.

### 8.2 Middleware de autorización

```js
// src/middleware/require-permission.js
function requirePermission(codigo, campo = "acceder") {
  return async (req, res, next) => {
    try {
      const usuario = req.session?.usuario;
      if (!usuario) {
        return res.status(401).json({ error: "NO_AUTENTICADO" });
      }

      const { rows } = await db.query(
        "SELECT rol_puede($1, $2, $3) AS permitido",
        [usuario.id_rol, codigo, campo]
      );

      if (!rows[0]?.permitido) {
        return res.status(403).json({
          error: "FORBIDDEN",
          seccion: codigo,
          mensaje: "No tienes permiso para acceder a esta sección.",
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
```

Aplicación:

```js
router.get(
  "/api/roles",
  requireAuth,
  requirePermission("configuracion.permisos", "acceder"),
  rolesController.listar
);
```

### 8.3 Endpoints propuestos

| Método | Ruta | Función | Protección |
|---|---|---|---|
| `GET` | `/api/me` | Usuario, rol y sección de inicio | Sesión |
| `GET` | `/api/me/permisos` | Menú y permisos efectivos | Sesión |
| `GET` | `/api/roles` | Lista de roles (sin el propio, o marcado) | `configuracion.permisos` |
| `GET` | `/api/roles/:id/permisos` | Matriz del rol + versión | `configuracion.permisos` |
| `PUT` | `/api/roles/:id/permisos` | Guardar matriz completa | `configuracion.permisos` |
| `POST` | `/api/roles` | Crear rol en borrador | `configuracion.permisos` |
| `PATCH` | `/api/roles/:id/estado` | Activar/desactivar rol | `configuracion.permisos` |
| `GET` | `/api/roles/:id/impacto` | Usuarios activos afectados | `configuracion.permisos` |
| `GET` | `/api/secciones` | Árbol de secciones | `configuracion.permisos` |
| `GET` | `/api/auditoria/permisos` | Historial con filtros | `configuracion.permisos` |
| `POST` | `/api/me/solicitudes-acceso` | Solicitar acceso (fase 2) | Sesión |

### 8.4 Contrato de `PUT /api/roles/:id/permisos`

```json
{
  "version": 7,
  "motivo": "Se retira Reportes al rol de tienda",
  "permisos": [
    { "idSeccion": 1, "ver": true,  "acceder": true  },
    { "idSeccion": 2, "ver": true,  "acceder": true  },
    { "idSeccion": 3, "ver": false, "acceder": false }
  ]
}
```

Reglas del contrato:

- Es una **sustitución completa** de la matriz editable del rol.
- Las secciones omitidas se interpretan como sin permiso.
- Las secciones protegidas se rechazan con `403` si el payload intenta cambiarlas.
- El rol del actor no puede ser el afectado.
- Debe incluirse la versión leída para evitar sobreescrituras.

Respuesta:

```json
{
  "idRol": 3,
  "version": 8,
  "actualizadoEn": "2026-10-22T15:04:00.000Z",
  "resumen": {
    "otorgados": 3,
    "revocados": 1,
    "ocultados": 1
  }
}
```

### 8.5 Transacción de guardado

```js
async function guardarPermisos(req, res) {
  const idRol = Number(req.params.id);
  const actor = req.session.usuario;
  const { version, permisos, motivo } = req.body;

  if (idRol === actor.id_rol) {
    return res.status(403).json({ error: "SELF_EDIT_NOT_ALLOWED" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Bloquear el rol y comprobar versión
    const { rows: [rol] } = await client.query(
      `SELECT id_rol, codigo, nombre_rol, version_permisos
         FROM roles
        WHERE id_rol = $1
        FOR UPDATE`,
      [idRol]
    );

    if (!rol) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "ROL_NO_ENCONTRADO" });
    }

    if (Number(version) !== rol.version_permisos) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "VERSION_CONFLICT",
        versionActual: rol.version_permisos,
      });
    }

    // 2. Cargar catálogo y validar secciones protegidas
    const { rows: secciones } = await client.query(
      `SELECT id_seccion, codigo, es_protegida
         FROM secciones
        WHERE estado = 'activo'`
    );

    const protegidas = new Set(
      secciones.filter((s) => s.es_protegida).map((s) => s.id_seccion)
    );

    for (const p of permisos) {
      if (protegidas.has(p.idSeccion)) {
        const antes = await permisoActual(client, idRol, p.idSeccion);
        if (antes.puede_ver !== p.ver || antes.puede_acceder !== p.acceder) {
          await client.query("ROLLBACK");
          return res.status(403).json({ error: "PROTECTED_SECTION" });
        }
      }
    }

    // 3. Snapshot anterior para auditoría
    const { rows: antes } = await client.query(
      `SELECT id_seccion, puede_ver, puede_acceder
         FROM permisos_rol
        WHERE id_rol = $1`,
      [idRol]
    );

    // 4. Upsert de la matriz
    for (const p of permisos) {
      await client.query(
        `INSERT INTO permisos_rol
           (id_rol, id_seccion, puede_ver, puede_acceder, actualizado_por)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id_rol, id_seccion)
         DO UPDATE SET
           puede_ver = EXCLUDED.puede_ver,
           puede_acceder = EXCLUDED.puede_acceder,
           actualizado_por = EXCLUDED.actualizado_por`,
        [idRol, p.idSeccion, p.ver, p.acceder, actor.id_usuario]
      );
    }

    // 5. Desactivar filas omitidas
    const ids = permisos.map((p) => p.idSeccion);
    await client.query(
      `UPDATE permisos_rol
          SET puede_ver = FALSE, puede_acceder = FALSE
        WHERE id_rol = $1
          AND NOT (id_seccion = ANY($2::int[]))`,
      [idRol, ids]
    );

    // 6. Incrementar versión y auditar
    await client.query(
      `UPDATE roles
          SET version_permisos = version_permisos + 1
        WHERE id_rol = $1`,
      [idRol]
    );

    await client.query(
      `INSERT INTO auditoria_permisos
         (id_actor, id_rol, accion, antes, despues, motivo, ip)
       VALUES ($1, $2, 'actualizar_permisos', $3::jsonb, $4::jsonb, $5, $6)`,
      [
        actor.id_usuario,
        idRol,
        JSON.stringify(antes),
        JSON.stringify(permisos),
        motivo || null,
        req.ip,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      idRol,
      version: rol.version_permisos + 1,
      actualizadoEn: new Date().toISOString(),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

### 8.6 Normalización jerárquica

Antes de guardar:

- Si una subsección tiene `acceder = true`, sus ancestros deben tener `ver = true` y `acceder = true`.
- Si un ancestro tiene `acceder = false`, todas sus descendientes deben quedar efectivamente bloqueadas.
- La UI hace esta normalización en caliente; el backend la valida y devuelve `422` si recibe un estado incoherente.
- No se deben borrar los flags de las hijas al apagar el padre: se conservan para restaurarlos al reactivarlo.

### 8.7 Frontend: guard de página y menú

```js
// assets/js/core/auth-guard.js
export async function guardPage(codigoSeccion) {
  const resp = await fetch("/api/me/permisos", { credentials: "include" });

  if (resp.status === 401) {
    const returnTo = encodeURIComponent(location.pathname + location.hash);
    location.replace(`/auth/login.html?returnTo=${returnTo}`);
    return false;
  }

  if (!resp.ok) {
    renderErrorPage("No se pudieron verificar tus permisos.");
    return false;
  }

  const data = await resp.json();
  const permiso = data.secciones.find((s) => s.codigo === codigoSeccion);

  if (!permiso?.puedeAcceder) {
    render403({ seccion: codigoSeccion, rol: data.rol });
    return false;
  }

  renderMenu(data.secciones.filter((s) => s.puedeVer));
  return true;
}
```

- El guard se ejecuta antes de mostrar el contenido: el shell principal lleva `hidden` o `visibility: hidden` hasta que termine la verificación.
- El menú se renderiza desde la respuesta del servidor, no desde una lista estática duplicada en cada HTML.
- Evitar el “flash” de contenido protegido en páginas estáticas.

### 8.8 Invalidación y sesiones activas

- Los permisos se consultan en cada petición (o con caché de muy corta duración).
- Al guardar, se incrementa `roles.version_permisos`.
- Si se usa caché, la clave incluye esa versión.
- Las sesiones activas no necesitan cerrarse: en su siguiente navegación o llamada API reciben el nuevo estado.
- Si el usuario está en una página que acaba de perder acceso, la siguiente llamada API devuelve `403`; la UI puede mostrar un aviso y redirigir a su inicio.
- Opcional: evento SSE `permisos.actualizados` con `{ idRol, version }` para refrescar el menú sin recargar.

---

## 9. Casos de uso y reglas de negocio

### 9.1 Casos de uso principales

#### CU-01 — Acceder al panel de permisos

**Actor:** Administrador o Jefe General.

**Flujo:**

1. Inicia sesión.
2. El backend devuelve sus permisos efectivos.
3. El menú muestra “Permisos y accesos” porque `configuracion.permisos.ver = true`.
4. Abre la ruta.
5. El guard de página y el middleware confirman `acceder = true`.
6. Se carga el selector de roles (excluyendo el rol propio) y la matriz.

**Excepción:** si no tiene el permiso, la ruta devuelve la vista 403.

#### CU-02 — Configurar permisos de otro rol

**Actor:** Administrador o Jefe General.

**Flujo:**

1. Selecciona un rol distinto al suyo.
2. El sistema muestra usuarios activos, estado y última modificación.
3. Activa/desactiva switches.
4. La UI aplica las reglas de visibilidad/acceso y herencia.
5. Pulsa “Guardar cambios”.
6. Se muestra el resumen de impacto.
7. Confirma.
8. El backend valida versión, permisos y secciones protegidas.
9. Guarda, audita e incrementa la versión.
10. La UI muestra éxito y actualiza la marca de tiempo.

**Excepción:** `409` si otro usuario guardó antes; se recarga la matriz.

#### CU-03 — Crear un nuevo rol

**Actor:** Administrador o Jefe General.

**Flujo:**

1. Pulsa “Nuevo rol”.
2. Introduce nombre visible, código y descripción.
3. Opcionalmente elige “Clonar permisos de…”.
4. El sistema crea el rol en estado `borrador`.
5. Todos los permisos quedan en `false`, salvo los de la plantilla si se clonó.
6. El rol aparece en el selector, marcado como “Borrador”.
7. El administrador configura al menos una sección accesible.
8. Al activarlo, el sistema valida que exista una sección de inicio accesible.
9. El rol puede asignarse a usuarios.

**Reglas:**

- No se puede asignar un rol en `borrador` a un usuario.
- No se puede activar un rol sin al menos una sección accesible.
- El código debe ser único y no puede coincidir con roles reservados.
- Los roles `administrador` y `jefe_general` son de sistema y no se pueden eliminar.

#### CU-04 — Usuario intenta entrar a una sección no autorizada

**Actor:** Cualquier usuario autenticado sin permiso.

**Flujo:**

1. Escribe la URL directamente o pulsa un enlace antiguo.
2. El guard consulta `GET /api/me/permisos`.
3. No encuentra `puedeAcceder = true`.
4. Se renderiza la vista 403 con el nombre de la sección y un enlace al inicio permitido.
5. Si la petición es a la API, el middleware responde `403 JSON`.

**Reglas:**

- No redirigir al dashboard sin explicación.
- No mostrar el contenido protegido ni siquiera un instante.
- No confiar en que el enlace esté oculto.
- Registrar el intento en logs de seguridad (sin datos sensibles).

#### CU-05 — Un rol no autorizado intenta modificar la configuración

**Actor:** Jefe de Tienda, Subjefe, Almacén, Vendedor, Cliente.

**Flujo:**

1. No ve el ítem del menú.
2. Si fuerza la URL, recibe 403.
3. Si intenta llamar a `PUT /api/roles/:id/permisos`, el middleware responde 403.
4. Si manipula el DOM para habilitar switches, el backend igualmente rechaza.
5. Si intenta editar su propio rol, recibe `403 SELF_EDIT_NOT_ALLOWED`.
6. Si intenta modificar la sección protegida, recibe `403 PROTECTED_SECTION`.

#### CU-06 — Edición concurrente

**Actor:** Dos administradores.

**Flujo:**

1. Ambos abren el mismo rol con versión 7.
2. El primero guarda: la versión pasa a 8.
3. El segundo intenta guardar con versión 7.
4. El backend responde `409 VERSION_CONFLICT`.
5. La UI muestra: “Otro usuario modificó estos permisos. Recarga para ver la versión actual”.
6. El segundo recarga, revisa el diff y vuelve a aplicar sus cambios.

**Regla:** nunca aplicar “el último gana” en silencio.

#### CU-07 — Desactivar o eliminar un rol

**Flujo:**

1. El administrador elige “Desactivar rol”.
2. El sistema cuenta usuarios activos asignados.
3. Si hay usuarios, exige reasignarlos a otro rol antes de desactivar.
4. La desactivación invalida las sesiones de esos usuarios.
5. Un rol de sistema no se puede eliminar.
6. La eliminación es lógica (`estado = 'inactivo'`) para conservar auditoría.

#### CU-08 — Consultar historial

**Flujo:**

1. El administrador pulsa “Historial”.
2. Filtra por rol, actor o fecha.
3. Ve el diff: sección, valor anterior, valor nuevo, motivo.
4. Puede exportar a CSV.

### 9.2 Reglas de negocio

| ID | Regla |
|---|---|
| BR-01 | Solo los roles con `configuracion.permisos.acceder` pueden abrir el panel. |
| BR-02 | `configuracion.permisos` es una sección protegida: no se otorga ni se revoca desde la UI. |
| BR-03 | Todo permiso ausente se considera denegado. |
| BR-04 | `puede_ver = true` implica `puede_acceder = true`. |
| BR-05 | Se permite `puede_acceder = true` con `puede_ver = false` (acceso por enlace directo). |
| BR-06 | Si un ancestro no tiene acceso, ningún descendiente tiene acceso efectivo. |
| BR-07 | Activar el acceso de una subsección activa automáticamente los ancestros necesarios. |
| BR-08 | El actor no puede modificar los permisos de su propio rol. |
| BR-09 | Un rol nuevo nace en `borrador`, con todo denegado salvo la plantilla opcional. |
| BR-10 | Un rol no se activa sin al menos una sección accesible. |
| BR-11 | Un rol en `borrador` no puede asignarse a usuarios. |
| BR-12 | Los roles de sistema no se eliminan. |
| BR-13 | Un rol con usuarios activos no se elimina; primero se reasignan. |
| BR-14 | El guardado es explícito, con confirmación y resumen de impacto. |
| BR-15 | Toda escritura usa control de versión; un conflicto devuelve `409`. |
| BR-16 | Todo cambio genera un registro de auditoría inmutable. |
| BR-17 | El backend valida todos los permisos; la UI es solo una ayuda. |
| BR-18 | `401` para falta de sesión; `403` para falta de permiso. |
| BR-19 | Las APIs devuelven `403` en JSON; las páginas muestran la vista 403. |
| BR-20 | Los cambios se aplican en la siguiente petición del usuario afectado. |
| BR-21 | No se redirige a URLs externas desde `returnTo`; validar que sea una ruta interna. |
| BR-22 | El panel no permite crear, editar ni borrar secciones; el catálogo se gestiona por migración. |
| BR-23 | Si un rol queda sin accesos, se advierte y se exige confirmación; sus usuarios verán 403. |
| BR-24 | Las contraseñas deben estar hasheadas y la sesión debe ser validada por el servidor. |
| BR-25 | Si una sección protegida conserva acceso, sus ancestros no pueden perderlo; el backend responde `403 PROTECTED_ANCESTOR`. |
| BR-26 | Un rol con usuarios activos no se desactiva hasta reasignarlos; el backend responde `409 ROL_CON_USUARIOS`. |

### 9.3 Criterios de aceptación

- [ ] Un usuario con rol Jefe de Tienda no ve “Permisos y accesos” y recibe 403 al entrar por URL.
- [ ] Un Administrador ve el panel y puede seleccionar cualquier rol distinto al suyo.
- [ ] Al desactivar “Visible”, se desactiva “Acceso” y la sección desaparece del menú.
- [ ] Al desactivar un módulo, sus subsecciones quedan bloqueadas efectivamente.
- [ ] Al reactivar el módulo, las subsecciones conservan su configuración previa.
- [ ] El botón Guardar permanece deshabilitado si no hay cambios.
- [ ] El modal muestra cuántos usuarios activos se verán afectados.
- [ ] Un guardado concurrente devuelve 409 y no sobreescribe datos.
- [ ] La sección protegida no se puede modificar ni siquiera con una petición manual.
- [ ] Un usuario no puede modificar su propio rol.
- [ ] Cada cambio queda en `auditoria_permisos` con actor, antes, después y fecha.
- [ ] Un usuario sin sesión recibe 401; uno sin permiso recibe 403.
- [ ] El menú se construye desde el backend y no desde una lista estática.
- [ ] Un rol nuevo sin accesos no puede activarse ni asignarse.
- [ ] La vista 403 ofrece un camino de salida a una sección permitida.

---

## 10. Plan de implementación sugerido

### Fase 0 — Seguridad base (bloqueante)

- Hash de contraseñas.
- Sesión de servidor con cookie `HttpOnly`.
- Middleware `requireAuth`.
- Eliminar la confianza en `localStorage` para roles y permisos.

### Fase 1 — Modelo y API

- Migración de `roles`, creación de `secciones`, `permisos_rol`, `auditoria_permisos`.
- Semilla del catálogo y de los permisos protegidos.
- Endpoints de lectura y guardado.
- Middleware `requirePermission`.
- Tests de autorización.

### Fase 2 — Interfaz

- Nueva página `pages/permisos.html` o sección dentro de `configuracion.html`.
- Selector de rol, tabla jerárquica, switches, búsqueda y filtros.
- Modal de confirmación, estados de error y vista 403.
- Menú dinámico en todas las páginas.
- Guard de página.

### Fase 3 — Robustez

- Control de versión y modal de conflicto.
- Auditoría visible e historial.
- Vista matriz comparativa.
- Evento SSE para refresco de menús.
- Tests E2E de acceso permitido/denegado.

### Fase 4 — Evolución

- Acciones CRUD por sección (`crear`, `editar`, `eliminar`, `exportar`).
- Solicitudes de acceso.
- Roles por sucursal/almacén.
- Permisos por campo o por registro (ABAC), solo si el negocio lo exige.

---

## 11. Riesgos y recomendaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| RBAC solo en el frontend | Crítico | Middleware en cada endpoint y guard de página |
| Sesión en `localStorage` | Crítico | Cookie `HttpOnly` y sesión de servidor |
| Contraseñas en texto plano | Crítico | bcrypt/argon2 + migración |
| Nombres de rol inconsistentes | Alto | `codigo` estable y mapa de etiquetas |
| Secciones duplicadas entre HTML y BD | Alto | Catálogo único + menú renderizado por JS |
| Auto-bloqueo del administrador | Alto | Prohibir editar el rol propio; permiso protegido |
| Sobreescritura concurrente | Medio | `version_permisos` + 409 |
| Cambios sin trazabilidad | Medio | Auditoría obligatoria |
| Enlaces rotos por “visible sin acceso” | Medio | Restricción `ver => acceder` |
| Rol nuevo sin accesos | Medio | Estado borrador + al menos una sección para activar |
| Caché de menú obsoleta | Bajo | Invalidar por versión o reconsultar al navegar |

---

## 12. Resumen de la decisión

La solución recomendada es un RBAC jerárquico y deny-by-default con:

- Catálogo de secciones en base de datos.
- Permisos por rol y sección con dos flags: `puede_ver` y `puede_acceder`.
- Herencia de ancestros.
- Panel accesible solo por permiso protegido, inicialmente para Administrador y Jefe General.
- Guardado explícito, confirmado, versionado y auditado.
- Validación tanto en la interfaz como en la API.

Con esto se cumple el requisito funcional y se evita que el módulo sea un simple ocultamiento visual sin seguridad real.
