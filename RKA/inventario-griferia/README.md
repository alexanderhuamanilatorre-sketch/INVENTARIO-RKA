# RKA - Sistema de Gestión de Inventario de Grifería

Sistema web de gestión de inventario para grifería, desarrollado con HTML/CSS/JavaScript vanilla, organizado por módulos.

## Características

- **Autenticación**: Login con usuario y contraseña y recuperación mediante pregunta de seguridad.
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

Los campos se validan antes del envío y el botón se desactiva mientras se procesa la solicitud para evitar envíos duplicados. Tras autenticar, el sistema vuelve a la página solicitada originalmente solo si el destino pertenece al mismo sitio; de lo contrario, usa la página inicial permitida para el usuario. No hay credenciales predeterminadas. La recuperación se completa mediante los endpoints del backend, no con una contraseña local del navegador.

## Cómo usar

1. Configura PostgreSQL y las variables de entorno descritas en [backend/README.md](./backend/README.md).
2. Ejecuta el esquema, las semillas y las migraciones RBAC, de contraseñas y de numeración de ventas (`npm run migrate:all` desde `backend/`).
3. Inicia el backend con [INICIAR-BACKEND.bat](./INICIAR-BACKEND.bat) y abre `http://localhost:3000` en tu navegador.

No hay usuarios ni contraseñas predeterminados. La cuenta inicial se crea al ejecutar las semillas con una contraseña definida localmente.

La autenticación, las sesiones y los permisos se validan en PostgreSQL. El navegador solo conserva un espejo de la sesión para la interfaz; la sesión real vive en una cookie `HttpOnly`. La recuperación de contraseña usa una pregunta de seguridad configurada al crear el usuario. En Configuración > Usuarios la contraseña se muestra al administrador y se guarda cifrada en reposo; las ediciones conservan la contraseña existente. Los detalles del módulo “Permisos y accesos” están en [docs/rbac-diseno.md](./docs/rbac-diseno.md).
