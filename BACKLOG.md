# PediTrack — Backlog

Ideas y tareas futuras ya decididas conceptualmente pero explícitamente fuera de alcance de la
funcionalidad donde se originaron. No es un roadmap priorizado — es una lista de "no olvidar esto"
para no perder decisiones que ya se tomaron en conversación pero que aún no tienen su propia
`specs/NNN-.../spec.md`.

Cuando se decida trabajar en un ítem, se le corre `/speckit-specify` como a cualquier feature nueva
y se elimina (o se marca) aquí.

## Prioridad alta

- **Autenticación real con Clerk o AWS Cognito** — siguiente feature (proveedor por decidir entre esos dos).
  Hoy la "sesión" es solo el `account_id` en `localStorage`. El registro web ya tiene el campo "Contraseña"
  del mock 11 (mínimo 8 caracteres) pero **no se envía ni se guarda**, y el botón "Registrarme con Google" solo
  avisa que estará disponible pronto. Al construirla: conectar ambos al proveedor (el registro con Google y la
  contraseña pasan a ser del proveedor, no de nuestro backend), agregar el campo al registro móvil (mock 01),
  la pantalla de inicio de sesión, y revisar `GET /accounts/{accountId}` y `POST /accounts/{accountId}/children`
  (hoy sin autenticación) y `useAccountSession`.
- **Homologar todas las pantallas a los mocks** — hecho en `specs/007-homologar-pantallas-a-mocks/`
  (rama `feature/007-homologar-pantallas-a-mocks`); las desviaciones que quedan están listadas en su spec.
  Pendiente de esa spec: las pantallas que aún no tienen mock (planes `/planes`, estados vacíos y de error).

## Backend

- **Consulta/listado del log de errores** — endpoint o interfaz para leer las entradas de
  `error_logs` (creado por `specs/002-registro-log-errores/`). Esa funcionalidad excluyó
  explícitamente la lectura (FR-007) — solo implementa el registro (escritura).
- **Digest semanal de errores por correo** — job programado que junte las entradas de `error_logs`
  de los últimos 7 días y las envíe por email. Depende de: la consulta/listado de arriba, elegir un
  proveedor de envío de correo (aún no decidido/configurado en el proyecto), y decidir quién lo
  recibe. Ver `specs/002-registro-log-errores/` (FR-008) y memoria de sesión
  `peditrack-error-logging-plan.md`.
- **Política de retención/purga de `error_logs`** — hoy la tabla crece indefinidamente
  (`specs/002-registro-log-errores/spec.md`, Aclaraciones sesión 2026-09-16). Revisar cuando haya
  visibilidad real de volumen.
- **Excepción de `cmd/api` en el gate de cobertura de CI** — actualmente `cmd/api` (wiring de Go) no
  cuenta para el >90% exigido por el Principio VI. Pregunta abierta sin resolver con el usuario: si
  se acepta la excepción permanentemente o se agrega alguna prueba de wiring.
- **Autenticación real (login/contraseña)** — `specs/003-home-listado-hijos/` introduce un
  `account_id` guardado en `localStorage` como "sesión" de facto, sin ningún mecanismo real de
  login, explícitamente aceptado como solución interina (ver plan.md, nota de Privacidad del
  Principio II). Cuando se diseñe la autenticación real, revisar `GET /accounts/{accountId}` y
  `POST /accounts/{accountId}/children` (hoy sin autenticación) y `useAccountSession` en el
  frontend. Consecuencia visible hoy: si se abre la URL de un hijo en un navegador donde nunca se creó la
  cuenta (sin `account_id` guardado), la pantalla carga pero sin la barra lateral de escritorio.
- **Almacenamiento de fotos de recetas en object storage** — `specs/004-detalle-consulta-hijo/`
  guarda la foto de la receta como `bytea` directamente en Postgres (ver research.md), por
  simplicidad y porque no hay infraestructura de archivos decidida todavía. Revisar migrar a un
  object storage (S3/GCS) si el volumen de fotos crece lo suficiente para justificarlo.
- **Helper compartido para "UUID malformado en la ruta → 404"** — el patrón de parsear un UUID de
  la ruta y tratar un error de parseo igual que un recurso no encontrado se repite ya 6 veces entre
  `internal/account` y `internal/consultation` sin ningún helper común. No se centralizó
  deliberadamente en `specs/004-detalle-consulta-hijo` porque un helper que llame a
  `*httpx.Responder` internamente colapsaría la atribución por línea de `error_logs` que
  `backend/CLAUDE.md` exige mantener distinta por sitio de llamada (ver el patrón ya documentado en
  `writeCreateAccountError`). Si el patrón se repite una vez más, vale la pena diseñar un mecanismo
  (p. ej. middleware de chi) que preserve esa atribución.

## Producto / Feature futura

- La pantalla de detalle de hijo (consultas médicas, recetas, medicamentos, horarios de toma y
  síntomas) fue implementada en `specs/004-detalle-consulta-hijo/` — este ítem ya no está pendiente.
- **Modo oscuro de la app** — el sistema visual de `specs/005-identidad-visual-front-end/` ya define la
  superficie oscura base (`#04252b`), pero no sus equivalentes de superficie, borde y tinta secundaria.
  Definirlos antes de implementarlo.
- **"Sin receta" en el listado de consultas** — el mock muestra una consulta "Control de peso · sin receta". La
  interfaz ya lo dice cuando una consulta tiene 0 medicamentos (`specs/006-resumen-detalle-hijo/`), pero la spec
  004 exige al menos un medicamento (FR-015) y la foto de la receta (FR-004), así que hoy ese estado no se
  alcanza. Si el producto decide permitir consultas sin receta (control de peso, revisión), hay que relajar esas
  dos reglas en el backend y en el formulario.
- **Pop-up freemium al tocar "Agregar hijo" en el home** — hoy, con plan gratuito y un hijo ya
  registrado, el botón abre el formulario y el límite solo lo detecta el servidor al guardar
  (comportamiento de `specs/003-home-listado-hijos/`). En el registro el pop-up sale al tocar el botón.
  Mejora acordada pero no construida: si `plan === 'free'` y ya hay 1 hijo, abrir directo
  `FreemiumLimitModal` (home y barra lateral), dejando la validación del servidor como respaldo.
- **Pantalla de planes de pago** — hoy `/planes` muestra un aviso "Estamos preparando los planes" (`MessagePage`) para que "Ver planes" no caiga en una pantalla en blanco. El modal de límite freemium (franja ámbar) es el punto de entrada
  visual ya establecido; la pantalla de planes debe continuarlo. Ver `specs/005-identidad-visual-front-end/spec.md`,
  "Adiciones Futuras Previstas".

## Producto / Legal

- Registro de marca ante el IMPI (clases 9+42) — ver memoria `peditrack-registro-marca-impi.md`.
- Verificación de exención de COFEPRIS antes de lanzamiento (Principio II de la constitución).
