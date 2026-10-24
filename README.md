# RKA - Sistema de Gestión de Inventario de Grifería

Sistema web de gestión de inventario para grifería, desarrollado con HTML/CSS/JavaScript vanilla, organizado por módulos.

## Características

- **Autenticación**: Login con usuario y contraseña y recuperación mediante documento de identidad y correo registrado.
- **Dashboard**: Estadísticas en tiempo real (Total productos, Entradas, Salidas, Stock bajo).
- **Inventario**: Listado completo con filtros por categoría, estado y búsqueda.
- **Productos**: Gestión CRUD completa (código, categoría, proveedor, stock, precio).
- **Categorías**: Administración de categorías.
- **Proveedores**: Registro y gestión de proveedores.
- **Movimientos**: Historial de entradas y salidas con control de stock.
- **Clientes**: Módulo retirado de la navegación y del panel de permisos; sus datos se conservan en la base de datos.
- **Reportes**: Exportación a CSV (Inventario, Movimientos, Stock bajo).
- **Configuración**: Datos de la empresa.

## Arquitectura

```
inventario-griferia/
├── auth/                 # Login y recuperación de acceso
├── pages/                # Vistas HTML por página
├── assets/
│   ├── css/              # Estilos globales y por área
│   └── js/
│       ├── auth/         # Sesión y autenticación del cliente
│       ├── core/         # Inicio de páginas, estado, layout y utilidades
│       └── modules/      # Comportamiento de cada página/funcionalidad
├── backend/
│   └── src/
│       ├── config/       # Configuración de infraestructura
│       ├── controllers/  # Adaptadores HTTP y coordinación de solicitudes
│       ├── lib/          # Seguridad y utilidades de dominio
│       ├── middleware/   # Sesión, origen y autorización
│       ├── models/       # Acceso a PostgreSQL
│       ├── routes/       # Mapeo de URL a controladores
│       ├── services/     # Casos de uso y permisos RBAC
│       └── views/        # Respuestas de la API
├── database/             # Esquema, semillas y migraciones SQL
└── docs/                 # Diseño y documentación técnica
```

### Frontend

El frontend es vanilla JavaScript con módulos ES, sin framework ni proceso de compilación. Cada archivo de `assets/js/modules/` representa el comportamiento de una página y se importa desde su HTML. Las responsabilidades compartidas viven en `core/` y `auth/`; los módulos de página no inicializan por separado la seguridad ni el layout.

`core/page-bootstrap.js` es el punto de entrada común de las páginas protegidas. Espera a que el servidor confirme la sesión y los permisos antes de crear el layout o registrar la funcionalidad de la página. El estado de inventario se conserva en `localStorage` como espejo para la interfaz; `AppCore` lo carga y sincroniza con `/api/sync`.

### Backend

El backend Express separa transporte, autorización, casos de uso y persistencia: `routes/` → `middleware/` → `controllers/` → `services/` y `models/` → PostgreSQL. Las respuestas HTTP se centralizan en `views/`. Los detalles de la estructura, el flujo de solicitudes y el mantenimiento de cada capa están en [backend/README.md](./backend/README.md).

Para diseño y reglas de autorización por rol, consulta [docs/rbac-diseno.md](./docs/rbac-diseno.md).

### Inicio de sesión

La página de acceso espera la validación de la sesión existente antes de mostrar el formulario. El usuario puede iniciar sesión con su nombre de usuario o correo; las credenciales se verifican en el backend y la sesión se mantiene en una cookie `HttpOnly`. La opción «Mantener sesión iniciada» controla su duración.

Los campos se validan antes del envío y el botón se desactiva mientras se procesa la solicitud para evitar envíos duplicados. Tras autenticar, el sistema vuelve a la página solicitada originalmente solo si el destino pertenece al mismo sitio; de lo contrario, usa la página inicial permitida para el usuario. La recuperación se completa mediante los endpoints del backend, no con una contraseña local del navegador.

### Cuenta de administrador

La cuenta administradora se conserva y puede iniciar sesión con normalidad. Por seguridad, su rol no se ofrece al editar usuarios ni aparece en la matriz de Permisos y accesos.

- **Usuario:** `admin`
- **Correo:** `admin@rkal.com`
- **Contraseña:** `rkal.administrador_2026`

## Inicio rápido

### Opción 1: proyecto completo con backend

1. Configura PostgreSQL y crea el archivo `backend/.env` con las credenciales de la base de datos, siguiendo la referencia de [backend/README.md](./backend/README.md).
2. Ejecuta el esquema, las semillas y las migraciones de la base de datos desde `backend/` (`npm run migrate:all`).
3. Desde la raíz del proyecto, ejecuta [INICIAR-BACKEND.bat](./INICIAR-BACKEND.bat).
4. Abre `http://localhost:3000/index.html` en tu navegador.

El lanzador de Windows ejecuta `backend/start-backend.ps1`, verifica que `node` y `npm` estén disponibles, instala dependencias en `%LOCALAPPDATA%\RKA\backend-dependencies` si hace falta y levanta la API en `http://localhost:3000`.

### Opción 2: servidor estático del frontend

Si solo quieres levantar la parte visual del sistema sin activar la API, ejecuta [INICIAR-SERVIDOR.bat](./INICIAR-SERVIDOR.bat). Esto abre la aplicación en `http://localhost:8000/index.html` usando `python -m http.server`.

> Importante: el backend y el servidor estático son opciones diferentes. La aplicación completa debe usarse con `INICIAR-BACKEND.bat`; `INICIAR-SERVIDOR.bat` sirve solo para pruebas rápidas del frontend.

## Cómo usar

La cuenta inicial se crea al ejecutar las semillas con la contraseña definida en `SEED_ADMIN_PASSWORD`. Las credenciales de la instalación local están documentadas arriba.

La autenticación, las sesiones y los permisos se validan en PostgreSQL. El navegador solo conserva un espejo de la sesión para la interfaz; la sesión real vive en una cookie `HttpOnly`. La recuperación de contraseña verifica el documento de identidad y el correo registrado del usuario antes de permitir el cambio. En Configuración > Usuarios la contraseña se muestra al administrador y se guarda cifrada en reposo; las ediciones conservan la contraseña existente. Los detalles del módulo “Permisos y accesos” están en [docs/rbac-diseno.md](./docs/rbac-diseno.md).
