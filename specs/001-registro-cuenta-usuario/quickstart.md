# Quickstart: Validar Registro de Cuenta de Usuario y Perfiles de Hijos

## Prerrequisitos

- Backend Go corriendo localmente contra una instancia de PostgreSQL con las migraciones aplicadas (incluye el seed del catálogo `countries`/`states`).
- Frontend React corriendo en modo desarrollo, apuntando al backend local.
- Ver [contracts/post-accounts.md](./contracts/post-accounts.md) y [contracts/get-catalog.md](./contracts/get-catalog.md) para el detalle exacto de request/response.

## Escenario 1 — Crear cuenta sin hijos (Historia de Usuario 1)

1. Abrir el formulario de creación de cuenta.
2. Llenar nombre, apellido y correo válidos. Dejar país/estado vacíos.
3. Guardar.
4. **Resultado esperado**: `201 Created`; la cuenta existe con `plan: "free"` y `children: []`.

## Escenario 2 — Crear cuenta con un hijo (Historia de Usuario 2)

1. Repetir pasos 1-2 del Escenario 1.
2. Presionar "Agregar hijo". Llenar nombre, apellido y fecha de nacimiento (talla/peso vacíos).
3. Guardar.
4. **Resultado esperado**: `201 Created`; la cuenta incluye el hijo con `height: null`, `weight: null`.

## Escenario 3 — Validación de fecha de nacimiento futura

1. Repetir pasos 1-2 del Escenario 2, pero ingresar una fecha de nacimiento futura.
2. Intentar guardar.
3. **Resultado esperado**: el formulario bloquea el envío con un error de validación en el campo (ver FR-005); si se fuerza la llamada directa al backend, responde `400 Bad Request`.

## Escenario 4 — Límite freemium al agregar un segundo hijo (Historia de Usuario 3)

1. Repetir pasos 1-2 del Escenario 2.
2. Presionar "Agregar hijo" por segunda vez.
3. **Resultado esperado inmediato**: aparece el banner freemium; los campos del segundo hijo son visibles y editables; ningún dato ya escrito se pierde.
4. Llenar los datos del segundo hijo e intentar guardar la cuenta.
5. **Resultado esperado**: el backend responde `422 freemium_child_limit_exceeded`; el frontend conserva todos los datos en el formulario (tutor + ambos hijos) y sigue mostrando el banner.

## Escenario 5 — Correo duplicado

1. Crear una cuenta con un correo (Escenario 1).
2. Intentar crear otra cuenta con el mismo correo.
3. **Resultado esperado**: `409 Conflict` (`email_already_exists`).

## Escenario 6 — Inmutabilidad de hijos persistidos

1. Completar el Escenario 2 (cuenta con un hijo persistido).
2. Verificar que no existe en la UI ni en la API ningún endpoint/acción para eliminar o editar nombre/apellido/fecha de nacimiento de ese hijo (FR-006a — no aplica en este alcance).

## Cobertura de pruebas esperada (Principio VI de la constitución)

- Pruebas unitarias Go (`internal/account`, `internal/catalog`) con `go test -cover`, meta >90%.
- Pruebas unitarias React (Vitest + Testing Library) para `AccountSignupForm`, `ChildFieldset`, `FreemiumBanner`, meta >90%.
- Un test E2E Playwright (`e2e/account-signup.spec.ts`) que cubra al menos los Escenarios 1, 2 y 4 de este documento, como gate de CI separado del gate de coverage unitario.
