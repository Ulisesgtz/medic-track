# Guía de Validación: Home Page — Listado de Hijos

Prerrequisito: backend corriendo (`cd backend && go run ./cmd/api`) con `DATABASE_URL` apuntando a Postgres con las migraciones de feature 001 ya aplicadas; frontend corriendo (`cd frontend && npm run dev`).

## Escenario 1 — Sin cuenta guardada (FR-002)

1. Abre el navegador en una pestaña/perfil sin `localStorage` previo (o límpialo manualmente).
2. Navega a `/home`.
3. **Esperado**: la home muestra un estado que invita a crear cuenta, con enlace al formulario de registro existente (`/signup`). No se hace ninguna petición a `GET /accounts/{accountId}`.

## Escenario 2 — Crear cuenta y llegar a la home con un hijo (FR-001, FR-003)

1. Completa el formulario de registro (`/signup`) con 1 hijo, envía.
2. **Esperado**: tras el `201` de `POST /accounts` (contracts/post-accounts.md de feature 001), el frontend guarda el `accountId` devuelto (`useAccountSession`) y navega automáticamente a `/home`.
3. **Esperado**: la home hace `GET /accounts/{accountId}` (contracts/get-account.md) y muestra una tarjeta con el nombre del hijo y su edad calculada (Aclaraciones de spec.md: meses si <2 años, años si no).

## Escenario 3 — Volver sin re-login (FR-003)

1. Con el `accountId` ya guardado del Escenario 2, cierra la pestaña y ábrela de nuevo en `/home` (o recarga).
2. **Esperado**: la home vuelve a cargar el mismo listado sin pedir ningún dato de sesión — mismo comportamiento que un usuario ya "logueado", sin que exista login real.

## Escenario 4 — Agregar un segundo hijo desde la home (FR-004)

1. Desde `/home` (cuenta con 1 hijo, plan gratuito), haz clic en "Agregar hijo".
2. **Esperado**: se abre un modal sobre la home page (Aclaraciones de spec.md, opción A) que reutiliza el mismo `ChildFieldset` del registro.
3. Completa los campos y envía.
4. **Esperado**: `POST /accounts/{accountId}/children` (contracts/post-account-children.md) devuelve `422 freemium_child_limit_exceeded` (límite de 1 hijo gratis ya alcanzado); el modal muestra el mismo pop-up de upgrade ya construido en feature 001. El listado de hijos no cambia.

## Escenario 5 — Cuenta con id inválido/borrado (Caso Límite de spec.md)

1. En `localStorage`, reemplaza manualmente `accountId` por un UUID que no exista en la base de datos.
2. Navega a `/home` (o recarga).
3. **Esperado**: `GET /accounts/{accountId}` responde `404 account_not_found`; el frontend limpia el `accountId` guardado y muestra el mismo estado "sin cuenta" del Escenario 1.

## Escenario 6 — Click en el nombre de un hijo (ruta placeholder)

1. Desde `/home` con al menos un hijo listado, haz clic en el nombre de un hijo.
2. **Esperado**: navega a una ruta placeholder para ese hijo (p. ej. `/children/{childId}`) — sin pantalla de detalle construida todavía; esa funcionalidad (reporte de consultas/recetas) es una feature futura separada, fuera de alcance aquí.

## Cobertura relacionada

- Playwright E2E: Escenarios 2 y 4 encadenados (crear cuenta → ver home → agregar segundo hijo → ver pop-up freemium), por caer dentro del alcance MVP de "perfiles de niños" (Principio VI).
- Unit/integration Go: `GetByID` (200/404), `AddChild` (201/400/404/422) en `internal/account`.
- Unit frontend: `useAccountSession` (con y sin `localStorage` disponible), `computeAge` (casos límite: justo 2 años, 0 meses, etc.), `HomePage` (3 estados: sin cuenta, vacío, listado).
