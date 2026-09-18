# PediTrack — Backlog

Ideas y tareas futuras ya decididas conceptualmente pero explícitamente fuera de alcance de la
funcionalidad donde se originaron. No es un roadmap priorizado — es una lista de "no olvidar esto"
para no perder decisiones que ya se tomaron en conversación pero que aún no tienen su propia
`specs/NNN-.../spec.md`.

Cuando se decida trabajar en un ítem, se le corre `/speckit-specify` como a cualquier feature nueva
y se elimina (o se marca) aquí.

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
- **Detalle del hijo al nivel del mock de escritorio** — el mock de `specs/005-identidad-visual-front-end/`
  (pantalla "Escritorio · Home con detalle") muestra datos que hoy ninguna API entrega. Para construirlos
  hace falta backend (cada punto es su propia feature con `/speckit-specify`):
  - **Tarjetas "Tomas de hoy" y "Tratamiento activo" + panel derecho "Tomas de hoy"** (T010, T019 de la 005):
    endpoint agregado de dosis por hijo (dosis del día con su hora, medicamento y estado tomada/sin marcar; y
    el tratamiento vigente con su fecha de término). El panel permite marcar la toma desde ahí (reusa
    `PATCH /consultations/{id}/doses/{doseId}`). Nota: la spec 004 no tiene concepto de "tratamiento activo"
    (FR-016), habría que definirlo (p. ej. medicamento con dosis futuras) sin que implique interpretación
    médica (Principio I).
  - **Subtítulo de cada consulta** ("Fiebre y tos · 2 medicamentos"): `GET /children/{childId}/consultations`
    solo devuelve doctor y fecha; habría que agregar síntomas y cantidad de medicamentos a la respuesta.
  - **"Sin receta"** (consulta sin foto): hoy la foto es obligatoria (FR-004 de la 004), así que ese estado
    solo existe si el producto decide hacerla opcional.
  Mientras tanto el resumen del detalle muestra Consultas, Última consulta y Doctores, que sí salen de
  los datos actuales. La parte del mock que solo era diseño (titular con nombre y edad, edades en la barra
  lateral, avatar del tutor, fechas "15 sep 2026") ya está hecha (`feature/005b-alinear-mock-escritorio`).
- **Pop-up freemium al tocar "Agregar hijo" en el home** — hoy, con plan gratuito y un hijo ya
  registrado, el botón abre el formulario y el límite solo lo detecta el servidor al guardar
  (comportamiento de `specs/003-home-listado-hijos/`). En el registro el pop-up sale al tocar el botón.
  Mejora acordada pero no construida: si `plan === 'free'` y ya hay 1 hijo, abrir directo
  `FreemiumLimitModal` (home y barra lateral), dejando la validación del servidor como respaldo.
- **Pantalla de planes de pago** — el modal de límite freemium (franja ámbar) es el punto de entrada
  visual ya establecido; la pantalla de planes debe continuarlo. Ver `specs/005-identidad-visual-front-end/spec.md`,
  "Adiciones Futuras Previstas".

## Producto / Legal

- Registro de marca ante el IMPI (clases 9+42) — ver memoria `peditrack-registro-marca-impi.md`.
- Verificación de exención de COFEPRIS antes de lanzamiento (Principio II de la constitución).
