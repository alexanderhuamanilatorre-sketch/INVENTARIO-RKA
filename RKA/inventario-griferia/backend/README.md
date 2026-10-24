# RKA - Backend (Node.js + Express + PostgreSQL)

Backend API y servidor para el Sistema de Gestión de Inventario de Grifería RKA.

## Requisitos

- Node.js 18+
- PostgreSQL 14+

## Estructura

```
backend/
├── .env                # Variables locales (no se suben a Git)
├── package.json
└── src/
    ├── server.js
    ├── app.js
    ├── config/
    │   └── db.js
    ├── controllers/      # HTTP controllers by resource
    ├── lib/              # Password, session, and credential utilities
    ├── middleware/       # Authentication, authorization, and request guards
    ├── models/           # PostgreSQL access
    ├── routes/           # URL-to-controller mapping
    ├── scripts/          # Idempotent database migrations
    ├── services/         # RBAC use cases
    └── views/            # JSON response formatting
```

## Arquitectura

El backend separa responsabilidades para que HTTP, autorización y acceso a datos no queden mezclados:

- **Rutas** mapean URL y método HTTP a un controlador; no contienen consultas SQL.
- **Middleware** valida origen, sesión, autorización y acceso a páginas protegidas.
- **Controladores** adaptan solicitudes HTTP a operaciones y forman respuestas mediante la vista JSON.
- **Servicios** alojan casos de uso compartidos o reglas de negocio. Por ejemplo, `rbac.service.js` resuelve permisos y estructura de secciones.
- **Modelos** encapsulan el acceso a PostgreSQL mediante el pool de `config/db.js`.
- **Vistas** centralizan el formato de respuesta JSON y el código HTTP.
- **`lib/`** contiene utilidades de dominio reutilizables, como sesiones, hashing y cifrado; **`scripts/`** contiene migraciones ejecutables.

El flujo de una solicitud es: **ruta → middleware → controlador → servicio/modelo → vista JSON**. `app.js` compone middleware y rutas; `server.js` inicia el servidor. Al agregar una funcionalidad, coloca SQL en el modelo, reglas reutilizables en un servicio y conserva el controlador como adaptador HTTP.

## Base de datos

Los scripts SQL están en `../database/`:
- `schema.sql` — crea las tablas.
- `seed.sql` — inserta datos de ejemplo.
- `queries.sql` — consultas útiles.

Configura `DB_PASSWORD` en `backend/.env` antes de iniciar el backend. El archivo `.env` y las dependencias instaladas se excluyen de Git.

Los scripts de semillas usan cuentas genéricas. Define `SEED_ADMIN_PASSWORD` antes de ejecutar `seed.sql`; define `SEED_DEMO_PASSWORD` antes de ejecutar `seed_extra.sql`, `seed_usuarios_auth.sql` o `restore_usuarios.sql`.
No hay credenciales predeterminadas: crea una cuenta mediante la semilla y autentícate con la contraseña que configuraste.

Para crear la base y cargar datos:
```bash
psql -U postgres -h localhost -c "CREATE DATABASE rkal_inventario;"
psql -U postgres -h localhost -d rkal_inventario -f database/schema.sql
psql -U postgres -h localhost -d rkal_inventario -f database/seed.sql
```

## Cómo ejecutar el backend

En Windows, inicia `INICIAR-BACKEND.bat` desde la carpeta del proyecto. El activador verifica Node.js y npm, instala las dependencias desde `package-lock.json` y las guarda fuera del proyecto en `%LOCALAPPDATA%\RKA\backend-dependencies`. También establece `NODE_PATH` para que el backend las encuentre; no hace falta tener `backend/node_modules`. Solo vuelve a instalar cuando cambian `package.json` o `package-lock.json`. La primera instalación requiere conexión a Internet.

Antes de iniciarlo, configura `backend/.env` con la contraseña de PostgreSQL:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rkal_inventario
DB_USER=postgres
DB_PASSWORD=tu_contraseña_local
PORT=3000
```

La alternativa manual es `npm install` y `npm start` desde `backend/`; npm creará `backend/node_modules`. Para mantener las dependencias fuera del proyecto, usa el activador de Windows.

```bash
cd backend
npm install
npm start        # o: node src/server.js
```

Luego:
- API: `http://localhost:3000/api/health`
- Frontend: `http://localhost:3000/index.html`

## Endpoints principales

| Recurso | GET | POST | PUT | DELETE |
|---|---|---|---|---|
| `/api/categorias` | ✓ | ✓ | PATCH `/api/categorias/:id` | DELETE `/api/categorias/:id` |
| `/api/productos` | ✓ | ✓ | PUT `/api/productos/:id` | DELETE `/api/productos/:id` |
| `/api/proveedores` | ✓ | ✓ | PUT `/api/proveedores/:id` | DELETE `/api/proveedores/:id` |
| `/api/clientes` | ✓ | ✓ | PUT `/api/clientes/:id` | DELETE `/api/clientes/:id` |
| `/api/movimientos` | ✓ | ✓ | — | DELETE `/api/movimientos/:id` |
| `/api/usuarios` | ✓ | ✓ | — | — |
| `/api/usuarios/login` | — | POST | — | — |

## Nota sobre el frontend

El frontend actual (`pages/`, `assets/`) funciona de forma autónoma con `localStorage`, por lo que sigue operativo sin backend. Para conectarlo a la API solo hay que cambiar las llamadas de `assets/js/core/storage-service.js`/`app-core.js` por peticiones `fetch` a `/api/*`.
