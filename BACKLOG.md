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

- **Editar consultas y medicamentos** — hoy son inmutables (spec 004, FR-014); solo se marcan las tomas, y desde 2026-09-20
  "Primera toma" (antes "Desde") es obligatoria al crear. Si se quiere poder corregir una consulta ya guardada hay que decidir: qué se edita
  (solo nombre y dosis, o también frecuencia, duración y hora de inicio); qué pasa con las tomas ya marcadas si cambia el
  horario (regenerarlas y perder las marcas, o que el cambio solo aplique a las tomas futuras); si también se edita doctor,
  fecha y síntomas; si se permite borrar una consulta o un medicamento; y el diseño (los mocks no tienen esa pantalla).
  Requiere endpoint nuevo y su spec. Recomendación que se dio: editar solo nombre, frecuencia, duración y hora de cada
  medicamento, regenerando sus tomas con un aviso de que se pierden las marcas.

## Próximo a trabajar (decidido 2026-09-28)

El usuario va a empezar con estos. Propuesta de agrupación en specs: **A** (síntomas y notas, independiente — hecho) y **B**
(seguimiento del tratamiento: B1–B6, que comparten el estado de cada toma y la pantalla de la consulta). Ninguno tiene
mock todavía: cada pantalla necesita su diseño móvil y web antes de construirse (regla de `CLAUDE.md`). Todo respeta el
Principio I: la app registra lo que el padre hace y lo que el médico indicó; nunca sugiere, diagnostica ni decide dosis.

### A. Síntomas seleccionables y "Notas previas a la consulta" — hecho

Entregado en `specs/012-sintomas-notas-consulta/` (PR #10, mergeado a `develop` el 2026-09-29), con el catálogo de 23
síntomas, la relación usuario / hijo / síntoma y el cambio de "Desde" a "Primera toma". Pendiente de decidir, sin
cambio: si se agrega "Otro" con texto libre (hoy: para eso están las notas).

### B. Seguimiento del tratamiento (detalle de la consulta)

- **B1. Tomas por momento del día** — en cada medicamento, las tomas del día se agrupan en **Mañana**, **Tarde** y
  **Noche**; cada toma aparece solo en su grupo y los grupos vacíos no se muestran. Propuesta de rangos en la hora local
  del padre: Mañana 05:00–11:59, Tarde 12:00–18:59, Noche 19:00–04:59 (la madrugada cuenta como noche).
- **B2. Toma "sin registrar" automática** — hecho en `specs/013-tomas-sin-registrar/` (cambia a la siguiente toma de su
  medicamento; la última, a su hora + la frecuencia).
- **B3. Barra de progreso por medicamento** — hecho en `specs/014-progreso-tomas/`.
- **B4. Calendario del tratamiento** — **un solo calendario** por consulta (no uno por medicamento) con el rango de
  cada medicamento de inicio a fin, **un color por medicamento** con su leyenda. Colores nuevos en `design-tokens.md`:
  distinguibles entre sí, contraste ≥ 3:1 contra el fondo, sin rojo (no hay alerta médica) y sin el ámbar, que ya
  significa "pendiente de marcar". Al tocar un día se ven las tomas de ese día.
- **B5. Fecha de fin cuando hay tomas sin registrar** — el pedido es que la fecha de fin se recorra sola. **Choca con el
  Principio I**: recorrer el tratamiento es decidir reponer las tomas perdidas, y eso lo indica el médico (en algunos
  medicamentos se reponen y en otros no). Opciones a decidir: (a) la fecha de fin no se mueve y el calendario marca los
  días con tomas sin registrar; (b) un botón "Recorrer tratamiento" que el padre usa si su médico se lo indicó, que
  agrega las tomas al final y queda registrado quién lo decidió. Recomendación: (b), nunca automático.
- **B6. "Finalizar tratamiento"** — botón en cada medicamento para terminarlo antes. Pide confirmación, guarda cuándo
  se terminó y cuántas tomas se dieron (ej. "Terminado el 30 sep · 6 de 9 tomas"), las tomas que faltaban dejan de
  avisarse y se muestran como canceladas (no se borran). Es una excepción a la inmutabilidad de la consulta (spec 004,
  FR-014): endpoint nuevo, solo dueño, sin opción de "deshacer" salvo que se decida. Texto neutral, sin consejo
  médico.
- Depende de: B2 define el estado de las tomas que usan B3, B4, B5 y B6; B6 afecta a los recordatorios (spec 011: una
  toma cancelada no se avisa).

## La app instalada: actualizar datos y versión (anotado 2026-09-29, sin fecha)

- **Jalar hacia abajo para actualizar** — la PWA instalada en la pantalla de inicio se abre sin la barra del navegador y
  pierde su gesto de "jalar para actualizar" (en iPhone no hay forma de activarlo; Android Chrome también lo quita en apps
  instaladas). Hoy los datos se vuelven a pedir solos al regresar a la app (TanStack Query, al recuperar el foco), pero no
  hay forma de pedirlos a mano. Propuesta: gesto propio **solo en el diseño móvil**, una vez en `AppShell` para todas las
  pantallas con sesión (home, detalle del hijo, detalle de consulta): al jalar estando hasta arriba aparece un indicador y
  al soltar se vuelven a pedir los datos (invalidar las consultas de TanStack), **sin recargar la página** — así no se
  pierde lo capturado (p. ej. la foto ya elegida en "Nueva consulta"). Sin librería (unas 60 líneas con eventos táctiles);
  respetar `prefers-reduced-motion` y no interferir con el rebote de iOS.
- **Aviso de versión nueva** — al publicar una versión, quien tiene la app instalada sigue con la anterior hasta cerrarla
  y abrirla de nuevo, y "jalar para actualizar" no lo resolvería (trae datos, no código). Propuesta: detectar que hay una
  versión nueva (el service worker de la spec 011 se actualiza, o un archivo de versión que se compara al volver a la
  app) y mostrar un aviso discreto "Hay una versión nueva · Actualizar" que recarga; nunca recargar solo si hay un
  formulario con datos. Relacionado: la compatibilidad de la API entre versiones (spec 012 aceptó el campo viejo
  `symptoms` por esto).

## Prioridad alta

- **Homologar todas las pantallas a los mocks** — hecho en `specs/007-homologar-pantallas-a-mocks/`
  (rama `feature/007-homologar-pantallas-a-mocks`); las desviaciones que quedan están listadas en su spec.
  Pendiente de esa spec: las pantallas que aún no tienen mock (planes `/planes`, estados vacíos y de error).

## Backend

- **Consultas anteriores sin hora de inicio** — desde 2026-09-20 "Primera toma" (antes "Desde") es obligatoria, pero las consultas guardadas
  antes (p. ej. la del Dr. Erick Rojas) tienen medicamentos sin `start_time`, sin tomas y sin tratamiento activo, y como
  las consultas son inmutables no se pueden completar. Si hace falta, permitir agregar la hora solo cuando falte (excepción
  a la inmutabilidad, endpoint nuevo, spec propia y un diseño que los mocks no tienen).


- **Errores de procesos en segundo plano en `error_logs`** (anotado 2026-09-29) — hoy `error_logs` solo guarda las
  respuestas HTTP 4xx/5xx (spec 002, vía `httpx.Responder`). Lo que falla en el proceso de recordatorios (spec 011: el
  ticker de 30 s, una toma que no se pudo preparar, un aviso que no se pudo entregar) solo se imprime en la consola del
  servidor (`log.Printf` en `internal/reminder/scheduler.go` y `service.go`). Propuesta: registrarlo también en
  `error_logs` con su propio "endpoint" (p. ej. `job:reminders`), cuenta cuando se conozca y sin el `endpoint` del
  dispositivo, las claves ni el token (nunca en logs, spec 011). Decidir si un 404/410 del servicio de avisos (dispositivo
  dado de baja, algo normal) cuenta como error o no.
- **Revisión automática de Swagger en CI** (anotado 2026-09-29) — nada verifica que `backend/internal/docs/` esté al día
  con los handlers; depende de correr `swag init` a mano después de cada cambio. Propuesta: un paso en el job de backend
  de `.github/workflows/ci.yml` que regenere la documentación y falle si hay diferencias (`swag init … && git diff
  --exit-code backend/internal/docs`), con un mensaje que diga el comando para regenerarla.
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
- **Pantalla de planes de pago** — hoy `/planes` muestra un aviso "Estamos preparando los planes" (`MessagePage`) para que "Ver planes" no caiga en una pantalla en blanco. El modal de límite freemium (franja ámbar) es el punto de entrada
  visual ya establecido; la pantalla de planes debe continuarlo. Ver `specs/005-identidad-visual-front-end/spec.md`,
  "Adiciones Futuras Previstas".
- **Patrocinios contextuales (publicidad sin perfilar al usuario)** — decidido en conversación 2026-09-22, no construir aún.
  Matiza (no revoca) la regla "sin anuncios" de `peditrack-monetization.md`: se permite mostrar patrocinios genéricos,
  siempre que ningún dato médico o del niño se use para elegirlos ni se comparta con el anunciante.
  - **Mecanismo**: catálogo propio servido por el backend de PediTrack (tabla `sponsorships`: anunciante, imagen, texto,
    liga, categoría, vigencia), rotación simple por posición de pantalla — nada de SDKs de ad-tech de terceros (Google
    AdSense, Meta Audience Network, etc.), nada de cookies/IDs de publicidad de terceros, ninguna impresión vinculada
    al `accountId` (a lo mucho una métrica agregada por posición).
  - **Dónde**: una tarjeta en el home (tras el listado de hijos) y/o en `/planes`. Nunca dentro de la ficha de
    consulta/receta ni cerca de la foto de la receta. Siempre etiquetado "Contenido patrocinado", visualmente distinto
    del resto de la UI.
  - **Categorías permitidas**: seguros de gastos médicos para niños, guarderías, papelería/juguetes educativos, higiene
    infantil (pañales, etc.), servicios de vacunación/pediatría (se solapa con el Plan Consultorio B2B2C).
  - **Categorías prohibidas, no negociables**: medicamentos y suplementos, **fórmula/sustitutos de leche materna**
    (Código Internacional de la OMS + regulación mexicana), alcohol/tabaco, y cualquier anuncio que sugiera diagnóstico
    o tratamiento (choca con Principio I de la constitución).
  - **Proceso de negocio (venta directa, no programática)**: prospección uno-a-uno a marcas de esas categorías,
    tarifa fija pactada (por periodo o por volumen garantizado de impresiones, no puja), orden de inserción/contrato
    corto con las exclusiones por escrito, revisión manual de cada creatividad antes de publicarla, reporte agregado
    de impresiones (sin datos de usuario) al anunciante. A la escala actual esto es un canal secundario, no la fuente
    principal de ingreso (esa sigue siendo el Plan Familia anual y el Plan Consultorio B2B2C). Alternativa más
    escalable si hace falta bajar el esfuerzo de ventas: formulario de autoservicio con pago (Stripe) para negocios
    chicos/locales, con la misma revisión manual de creatividad.
  - **Mensaje a ajustar**: el pitch de privacidad ("tus datos jamás se comparten") sigue siendo cierto bajo este
    esquema, pero conviene matizarlo a algo como "no vendemos ni compartimos tu información; los patrocinios que veas
    no usan tus datos médicos" para que no choque con el banner de aviso al crear la cuenta.

## Despliegue

- **Dónde correr el backend y la base de datos** — **decidido 2026-09-28: Railway** (Go + Postgres juntos,
  ~5–20 USD/mes; conecta el repo de GitHub y despliega solo). Primero un entorno de pruebas con subdominios
  (`api.pedi-track.com` en Railway, `app.pedi-track.com` en Cloudflare Pages, CNAME en HostGator, llaves de desarrollo
  de Clerk): guía en `DEPLOY.md`. Lo que sigue pendiente para producción está al final de esa guía. **Por ahora (2026-09-28) las pruebas en el teléfono
  van por un túnel HTTPS temporal a la PC** (`DEPLOY.md`, "Prueba con túnel"); el entorno en Railway se monta cuando el
  ambiente esté listo para una instancia DEV desplegada. Se había comparado contra:
  Render (~13 USD/mes, cobra disco de Postgres por GB — relevante porque las fotos de receta se guardan como
  `bytea` directo en Postgres, ver más abajo), Fly.io (desde ~2 USD, sin región en México), un VPS propio
  (Hetzner/DigitalOcean, ~5–12 USD pero con mantenimiento manual), y AWS (App Runner/ECS + RDS — tendría sentido
  solo si se termina usando Cognito para el login, para quedar todo en una cuenta).
- **Recordatorios push (spec 011)**: el proceso del backend tiene que estar encendido siempre (el envío corre dentro del API cada 30 s), así que el hosting no puede ser de los que duermen sin tráfico; configurar ahí `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `REMINDER_ACTION_SECRET` (las de producción, distintas de las locales). El frontend debe servirse por HTTPS (los avisos no funcionan sin él) y el service worker desde la raíz del dominio.
- **Frontend (el PWA)**: **Cloudflare Pages** — gratis, sirve el PWA con su service worker, dominio
  `pedi-track.com` ya comprado (ver memoria `peditrack-dominio.md`) solo hay que apuntar el DNS. Alternativas
  equivalentes: Vercel, Netlify.
- **Cloudflare Containers para el backend** — evaluado y descartado por ahora: corre cualquier imagen Docker
  (serviría para el binario de Go), pero Cloudflare no tiene Postgres propio (Hyperdrive solo acelera la conexión
  a un Postgres externo, no lo hospeda) y el producto sigue siendo relativamente nuevo. Revisar de nuevo si más
  adelante conviene consolidar todo en Cloudflare.
- Relacionado: **fotos de recetas en `bytea` dentro de Postgres** (ver "Backend" arriba) — el proveedor de
  hosting elegido debe soportar que la base de datos crezca con cada foto hasta que se migre a un object storage.
- **Instancia de producción de Clerk** (`specs/008-autenticacion-cuenta/`) — el desarrollo usa la instancia de
  Desarrollo de Clerk (`pk_test_`/`sk_test_`, sin configuración extra). Al desplegar a producción hay que: crear
  la instancia de Producción de la misma app de Clerk (`pk_live_`/`sk_live_`), apuntarla al dominio real
  (`pedi-track.com`), y **volver a configurar el login con Google ahí** — Clerk no copia la configuración de
  SSO/Integrations de dev a prod, y en prod ya no se usan las credenciales de Google compartidas de Clerk, hay
  que dar de alta credenciales propias en Google Cloud Console.

## Producto / Legal

- Registro de marca ante el IMPI (clases 9+42) — ver memoria `peditrack-registro-marca-impi.md`.
- Verificación de exención de COFEPRIS antes de lanzamiento (Principio II de la constitución).
