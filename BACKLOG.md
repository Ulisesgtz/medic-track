# PediTrack — Backlog

Ideas y tareas futuras ya decididas conceptualmente pero explícitamente fuera de alcance de la
funcionalidad donde se originaron. No es un roadmap priorizado — es una lista de "no olvidar esto"
para no perder decisiones que ya se tomaron en conversación pero que aún no tienen su propia
`specs/NNN-.../spec.md`.

Cuando se decida trabajar en un ítem, se le corre `/speckit-specify` como a cualquier feature nueva
y se elimina (o se marca) aquí.

## Pendientes de decisión (preguntas abiertas al usuario)

Preguntas que se hicieron durante la homologación a los mocks (`specs/007-homologar-pantallas-a-mocks/`) y que el usuario
dejó pendientes (2026-09-21). No se construye nada de esto hasta que se responda.

- **Mock 05 (pop-up del plan gratuito, móvil): ¿cómo debe ser el home de fondo?** El fondo del mock 05 es un home sin
  tarjeta de hijo y con un encabezado que solo dice "Tus hijos" (logo + título). El home móvil de la app sigue la pantalla 2
  del tablero: encabezado con "Hola, Ana" y avatar con iniciales, y en cada tarjeta de hijo los chips "N consultas" y
  "N tomas hoy" / "Sin tomas pendientes". Con el plan gratuito lleno siempre hay un hijo, así que el fondo real nunca puede
  ser exactamente el del mock. Decidir: (a) dejar el home como el tablero 2 (hoy), o (b) quitar saludo, avatar y chips
  para que sea el del mock 05. El pop-up en sí ya coincide con el mock (ver la spec 007).
- **Editar consultas y medicamentos** — hoy son inmutables (spec 004, FR-014); solo se marcan las tomas, y desde 2026-09-20
  "Desde" es obligatorio al crear. Si se quiere poder corregir una consulta ya guardada hay que decidir: qué se edita
  (solo nombre y dosis, o también frecuencia, duración y hora de inicio); qué pasa con las tomas ya marcadas si cambia el
  horario (regenerarlas y perder las marcas, o que el cambio solo aplique a las tomas futuras); si también se edita doctor,
  fecha y síntomas; si se permite borrar una consulta o un medicamento; y el diseño (los mocks no tienen esa pantalla).
  Requiere endpoint nuevo y su spec. Recomendación que se dio: editar solo nombre, frecuencia, duración y hora de cada
  medicamento, regenerando sus tomas con un aviso de que se pierden las marcas.

## Prioridad alta

- **Autenticación real con Clerk o AWS Cognito** — siguiente feature (proveedor por decidir entre esos dos).
  Hoy la "sesión" es solo el `account_id` en `localStorage`. Los registros (móvil y web) ya tienen el campo
  "Contraseña" del mock (mínimo 8 caracteres) pero **no se envía ni se guarda**, y el botón "Registrarme con Google" solo
  avisa que estará disponible pronto. Al construirla: conectar ambos al proveedor (el registro con Google y la
  contraseña pasan a ser del proveedor, no de nuestro backend), la pantalla de inicio de sesión, y revisar `GET /accounts/{accountId}` y `POST /accounts/{accountId}/children`
  (hoy sin autenticación) y `useAccountSession`.
- **Homologar todas las pantallas a los mocks** — hecho en `specs/007-homologar-pantallas-a-mocks/`
  (rama `feature/007-homologar-pantallas-a-mocks`); las desviaciones que quedan están listadas en su spec.
  Pendiente de esa spec: las pantallas que aún no tienen mock (planes `/planes`, estados vacíos y de error).

## Backend

- **Consultas anteriores sin hora de inicio** — desde 2026-09-20 "Desde" es obligatorio, pero las consultas guardadas
  antes (p. ej. la del Dr. Erick Rojas) tienen medicamentos sin `start_time`, sin tomas y sin tratamiento activo, y como
  las consultas son inmutables no se pueden completar. Si hace falta, permitir agregar la hora solo cuando falte (excepción
  a la inmutabilidad, endpoint nuevo, spec propia y un diseño que los mocks no tienen).


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

## Despliegue

- **Dónde correr el backend y la base de datos** — decisión inclinada hacia **Railway** (Go + Postgres juntos,
  ~5–20 USD/mes; conecta el repo de GitHub y despliega solo), conversado 2026-09-22 pero **no decidido en firme
  todavía** — queda en pausa hasta terminar la homologación de pantallas (spec 007). Comparado contra:
  Render (~13 USD/mes, cobra disco de Postgres por GB — relevante porque las fotos de receta se guardan como
  `bytea` directo en Postgres, ver más abajo), Fly.io (desde ~2 USD, sin región en México), un VPS propio
  (Hetzner/DigitalOcean, ~5–12 USD pero con mantenimiento manual), y AWS (App Runner/ECS + RDS — tendría sentido
  solo si se termina usando Cognito para el login, para quedar todo en una cuenta).
- **Frontend (el PWA)**: **Cloudflare Pages** — gratis, sirve el PWA con su service worker, dominio
  `pedi-track.com` ya comprado (ver memoria `peditrack-dominio.md`) solo hay que apuntar el DNS. Alternativas
  equivalentes: Vercel, Netlify.
- **Cloudflare Containers para el backend** — evaluado y descartado por ahora: corre cualquier imagen Docker
  (serviría para el binario de Go), pero Cloudflare no tiene Postgres propio (Hyperdrive solo acelera la conexión
  a un Postgres externo, no lo hospeda) y el producto sigue siendo relativamente nuevo. Revisar de nuevo si más
  adelante conviene consolidar todo en Cloudflare.
- Relacionado: **fotos de recetas en `bytea` dentro de Postgres** (ver "Backend" arriba) — el proveedor de
  hosting elegido debe soportar que la base de datos crezca con cada foto hasta que se migre a un object storage.

## Producto / Legal

- Registro de marca ante el IMPI (clases 9+42) — ver memoria `peditrack-registro-marca-impi.md`.
- Verificación de exención de COFEPRIS antes de lanzamiento (Principio II de la constitución).
