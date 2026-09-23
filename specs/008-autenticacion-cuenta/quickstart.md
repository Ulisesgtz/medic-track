# Quickstart: Autenticación real de cuenta (login)

Validación manual de extremo a extremo una vez implementada la feature. Requiere el backend y el frontend
corriendo localmente (`backend/CLAUDE.md`, `frontend/CLAUDE.md`) y una aplicación de Clerk ya creada (ver
"Antes de empezar").

## Antes de empezar

1. Crear una aplicación en [clerk.com](https://clerk.com) (instancia de desarrollo). Habilitar **Correo +
   contraseña** y **Google** como métodos de acceso.
2. Copiar la Publishable Key a `frontend/.env.local` como `VITE_CLERK_PUBLISHABLE_KEY=...`.
3. Copiar la Secret Key como variable de entorno del backend: `CLERK_SECRET_KEY=...` (junto a `DATABASE_URL`,
   nunca en el repo).
4. Aplicar la migración `0009_add_clerk_user_id_to_accounts.sql` contra la base local.

## Historia 1 — Registrarse con contraseña

1. Abrir `/signup` (o el registro correspondiente al mock 01/11 de spec 007), llenar correo, contraseña (8+
   caracteres) y los datos del tutor/primer hijo.
2. Enviar. **Resultado esperado**: la cuenta queda creada en PediTrack y también aparece como un usuario nuevo
   en el dashboard de Clerk, con ese mismo correo.
3. Revisar la tabla `accounts` en Postgres: la fila nueva tiene `clerk_user_id` distinto de `NULL`.

## Historia 1 (Google) — Registrarse con Google

1. En el mismo formulario, tocar "Registrarme con Google" y completar el consentimiento de Google con una
   cuenta que **no** se haya usado antes en esta app.
2. **Resultado esperado**: vuelve a la app ya con sesión de Clerk activa, pasa a completar los datos del
   tutor/primer hijo (Google no los tiene) y termina en `/home` sin haber escrito ninguna contraseña.

## Historia 2 — Iniciar sesión desde otro navegador

1. Con la cuenta creada en la Historia 1, abrir la app en un navegador **distinto** (o una ventana de
   incógnito, sin nada guardado).
2. Ir a `/login`, escribir el mismo correo y contraseña. **Resultado esperado**: entra a `/home` y ve a los
   mismos hijos que registró antes.
3. Repetir con "Continuar con Google" usando la misma cuenta de Google de la Historia 1. **Resultado
   esperado**: mismo resultado, sin pedir contraseña.
4. Probar una contraseña incorrecta. **Resultado esperado**: mensaje de error genérico, sigue en `/login`.

## Historia 3 — Una cuenta no puede ver los datos de otra

1. Crear dos cuentas distintas (A y B), cada una con al menos un hijo.
2. Con la sesión de A activa, copiar de la barra de direcciones la URL de un hijo de B (`/children/{childId de
   B}`) y abrirla. **Resultado esperado**: no se ve ningún dato de B (redirección o mensaje de error, según lo
   que decida `tasks.md`, pero nunca el nombre/edad/consultas del hijo de B).
3. Con `curl`/Postman, usando el token de A, hacer `GET /accounts/{id de B}` directo contra el backend.
   **Resultado esperado**: `403`.
4. Igual con `POST /accounts/{id de B}/children` usando el token de A. **Resultado esperado**: `403`, y B
   sigue con la misma cantidad de hijos que antes.

## Historia 4 — Cerrar sesión

1. Con una sesión activa, usar el botón "Cerrar sesión" del home.
2. **Resultado esperado**: vuelve a `/login`. Recargar cualquier URL con sesión (`/home`, `/children/...`)
   también redirige a `/login` sin mostrar ningún dato.

## Historia 5 — Primer acceso de una cuenta creada antes de esta feature

1. En Postgres, tomar (o crear a mano, simulando datos previos a esta feature) una fila de `accounts` con
   `clerk_user_id IS NULL` y al menos un hijo.
2. Ir a `/login` (o al flujo de alta, según lo que decida `tasks.md` para este caso) usando exactamente ese
   mismo correo, y completar el paso de establecer contraseña (o vincular Google).
3. **Resultado esperado**: esa misma fila de `accounts` termina con `clerk_user_id` distinto de `NULL` (no se
   crea una cuenta duplicada), y el tutor ve a los mismos hijos que ya tenía.
4. Cerrar sesión y volver a entrar con esa contraseña/Google. **Resultado esperado**: funciona como cualquier
   otra cuenta (Historia 2).

## Verificación de Principio II (privacidad)

- Revisar los logs del backend y la tabla `error_logs` (specs/002) durante toda esta validación: en ningún
  punto debe aparecer una contraseña, ni en texto plano ni de otra forma.
- Revisar la tabla `accounts`: la columna `email` sigue existiendo, pero no hay ninguna columna de contraseña
  en ningún lado del esquema de PediTrack.
