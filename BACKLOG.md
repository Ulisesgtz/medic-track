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

- **B1. Tomas por momento del día** — hecho en `specs/015-tomas-por-momento-del-dia/`.
- **B2. Toma "sin registrar" automática** — hecho en `specs/013-tomas-sin-registrar/` (cambia a la siguiente toma de su
  medicamento; la última, a su hora + la frecuencia).
- **B3. Barra de progreso por medicamento** — hecho en `specs/014-progreso-tomas/`.
- **B4. Calendario del tratamiento** — hecho en `specs/019-calendario-tratamiento/` (texto original: **un solo calendario** por consulta (no uno por medicamento) con el rango de
  cada medicamento de inicio a fin, **un color por medicamento** con su leyenda. Colores nuevos en `design-tokens.md`:
  distinguibles entre sí, contraste ≥ 3:1 contra el fondo, sin rojo (no hay alerta médica) y sin el ámbar, que ya
  significa "pendiente de marcar". Al tocar un día se ven las tomas de ese día.
- **B5. Fecha de fin cuando hay tomas sin registrar** — hecho en `specs/020-recorrer-tratamiento/` con la opción (b): botón «Recorrer tratamiento», el número de tomas se propone y el padre puede cambiarlo (queda registrado como manual). Texto original: el pedido es que la fecha de fin se recorra sola. **Choca con el
  Principio I**: recorrer el tratamiento es decidir reponer las tomas perdidas, y eso lo indica el médico (en algunos
  medicamentos se reponen y en otros no). Opciones a decidir: (a) la fecha de fin no se mueve y el calendario marca los
  días con tomas sin registrar; (b) un botón "Recorrer tratamiento" que el padre usa si su médico se lo indicó, que
  agrega las tomas al final y queda registrado quién lo decidió. Recomendación: (b), nunca automático.
- **Calendario: inicio y fin visibles** (anotado 2026-09-30, a pedido del usuario: la fecha de inicio y la de fin marcadas con el color de cada medicamento) — la spec 022 (rebranding con el diseño de Claude Design) los quitó de la vista porque el «Turno 1» del diseño no los trae; siguen en el nombre accesible del día. Falta un segundo turno del diseño que los dibuje (p. ej. pastilla del día con el color del medicamento y la etiqueta «Inicio»/«Fin»).
- **Quitar «Tomas de hoy» del detalle de la consulta** — hecho en `specs/023-calendario-selector-de-dia/` (opción b: el calendario elige el día y cada tarjeta de medicamento muestra sus tomas).
- **Convertir una consulta «solo registro» en una con tomas** (anotado 2026-10-01) — la spec 024 la deja fija al crearla (consultas inmutables, spec 004); si hace falta, sería una acción explícita del padre que pida la hora de inicio y genere las tomas desde ahí.
- **Subir literales a `@theme`** — hecho en `feature/028-colores-a-theme` (refactor sin cambio visual; ver `design-tokens.md`, «Colores de apoyo»). Queda aparte, si se quiere: unificar los **radios** de campo (16/12/14 px según el mock), que sí es una decisión visual.
- **Decisiones de diseño del calendario** — decididas el 2026-10-02 y hechas en `feature/027-marca-de-hoy`: (1) hoy lleva un aro fino de tinta mientras se elige otro día; (2) `med-1` = `action` se deja igual; (3) desviación 12: «sin registrar» se queda punteado. Si los probadores piden otra cosa (p. ej. números dentro de los puntos por el daltonismo, ΔE ≈ 8 entre los tres primeros), se abre una revisión del diseño.
- **B6. "Finalizar tratamiento"** — hecho en `specs/016-finalizar-tratamiento/`.
- Depende de: B2 define el estado de las tomas que usan B3, B4, B5 y B6; B6 afecta a los recordatorios (spec 011: una
  toma cancelada no se avisa).

## La app instalada: actualizar datos y versión — hecho en `specs/017-actualizar-datos-y-version/` (anotado 2026-09-29)

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


- **Errores de procesos en segundo plano en `error_logs`** — hecho en `specs/018-errores-procesos-segundo-plano/` (anotado 2026-09-29) — hoy `error_logs` solo guarda las
  respuestas HTTP 4xx/5xx (spec 002, vía `httpx.Responder`). Lo que falla en el proceso de recordatorios (spec 011: el
  ticker de 30 s, una toma que no se pudo preparar, un aviso que no se pudo entregar) solo se imprime en la consola del
  servidor (`log.Printf` en `internal/reminder/scheduler.go` y `service.go`). Propuesta: registrarlo también en
  `error_logs` con su propio "endpoint" (p. ej. `job:reminders`), cuenta cuando se conozca y sin el `endpoint` del
  dispositivo, las claves ni el token (nunca en logs, spec 011). Decidir si un 404/410 del servicio de avisos (dispositivo
  dado de baja, algo normal) cuenta como error o no.
- **Revisión automática de Swagger en CI** — **ya estaba hecho** (verificado 2026-09-30): el paso «Verify Swagger docs are up to date» del job de backend de `.github/workflows/ci.yml` (desde la spec 011) regenera la documentación y falla si hay diferencias, con el comando para regenerarla. Lo que sigue describe la propuesta original (anotado 2026-09-29) — nada verifica que `backend/internal/docs/` esté al día
  con los handlers; depende de correr `swag init` a mano después de cada cambio. Propuesta: un paso en el job de backend
  de `.github/workflows/ci.yml` que regenere la documentación y falle si hay diferencias (`swag init … && git diff
  --exit-code backend/internal/docs`), con un mensaje que diga el comando para regenerarla.
- **Consulta/listado del log de errores** — hecho en `specs/021-consulta-y-retencion-error-logs/` (`GET /ops/error-logs` y `/summary` con una clave de operación). Texto original: endpoint o interfaz para leer las entradas de
  `error_logs` (creado por `specs/002-registro-log-errores/`). Esa funcionalidad excluyó
  explícitamente la lectura (FR-007) — solo implementa el registro (escritura).
- **Digest semanal de errores por correo** — **sigue pendiente**: la consulta y el resumen de la spec 021 son su base; falta elegir proveedor de correo y quién lo recibe. Job programado que junte las entradas de `error_logs`
  de los últimos 7 días y las envíe por email. Depende de: la consulta/listado de arriba, elegir un
  proveedor de envío de correo (aún no decidido/configurado en el proyecto), y decidir quién lo
  recibe. Ver `specs/002-registro-log-errores/` (FR-008) y memoria de sesión
  `peditrack-error-logging-plan.md`.
- **Política de retención/purga de `error_logs`** — hecho en `specs/021-consulta-y-retencion-error-logs/` (depuración diaria, 90 días por omisión, mínimo 7). Texto original: hoy la tabla crece indefinidamente
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
- **Qué incluye el plan de pago (premium)** — idea del 2026-10-05, **pulida pero con decisiones abiertas (abajo): no construir
  hasta cerrarlas.** Junto con «Pantalla de planes de pago» define qué se cobra. Hoy `paid` solo sube el tope de hijos de 1 a 10
  (spec 029) y se da a mano con SQL; no hay cobro.
  - **1. Compartir con la pareja y con quien cuida** — con plan de pago, quien paga **invita** a su esposo/esposa y los dos
    tienen **el mismo acceso**: ven los mismos hijos y consultas, y los dos pueden agregar hijos, consultas y marcar tomas.
    Mejoras sobre la idea original:
    - **Roles, no solo «pareja»:** *Tutor* (igual que quien invita: agrega y marca), *Cuidador* (abuela, niñera: ve y marca
      tomas, no agrega ni invita; ya estaba en la memoria como palanca de «cuidador compartido») y *Hijo/hija* (solo ve su
      tratamiento y recibe sus avisos). Un tutor decide el rol al invitar y puede quitar el acceso cuando quiera.
    - **Lo que más vale de compartir es no dar dos veces la misma dosis:** que la toma que marcó uno aparezca ya marcada en el
      teléfono del otro (la pantalla ya se actualiza cada 60 s) y **quién la marcó** («Marcada por Ana, 08:05»; solo registra,
      Principio I). Un recordatorio no debe llegar a quien ya la vio marcada.
    - **Invitación:** por correo o por liga de un solo uso que vence (7 días). La persona crea su cuenta (Clerk) o entra a la
      suya y acepta; el tutor ve «Pendiente / Aceptada». Máximo de personas por familia (p. ej. 4).
    - **El hijo como usuario:** solo desde cierta edad (p. ej. 13+, por las condiciones de Clerk y el aviso de privacidad de
      menores) y con la aprobación del tutor; solo lectura + avisos. Más sensible que los demás roles: revisar el aviso
      legal antes (LFPDPPP, datos de salud de menores).
    - **Consentimiento y aviso:** compartir significa que **otra persona ve datos médicos del menor**: texto nuevo en el aviso
      «Antes de empezar» (subir `CurrentDisclaimerVersion`) y que quien acepta una invitación vea y confirme qué va a ver.
    - **Qué pasa si se cancela el plan (decidir):** lo razonable es que **nadie pierda lo ya registrado**: los invitados
      conservan lectura, y se pierde agregar y compartir de nuevo. No quitarles el acceso de golpe.
    - **Impacto técnico (grande):** hoy todo cuelga de una cuenta (`children.account_id`, `ownership` = «mi `clerk_user_id`
      es el de la cuenta dueña»). Compartir pide una tabla de membresías (`child_members`: hijo, cuenta, rol, quién
      invitó, estado) y que `internal/ownership` y los `RequireOwner` de `internal/server` pregunten «¿tengo acceso a este
      hijo?» en vez de «¿es mi cuenta?». Los recordatorios también cambian: `ClaimDueDoses` y `doses.reminder_sent_at` son
      **por toma**, y con varias personas debe ser **por toma y por persona** (cada una con su dispositivo y su
      `reminderDetail`). Hay que agregar `taken_by` a las tomas. Va en su propia spec, antes que el resto.
  - **2. Qué ve y qué puede hacer cada plan** — la idea original era: gratis = solo la consulta actual, sin ver las pasadas ni
    agregar previas; pago = ilimitado + historial. **Choca con lo decidido el 2026-07-18** (`peditrack-monetization.md`: «los
    datos nunca se secuestran, premium es lo que la app *hace* con los datos, no el acceso», el error de Medisafe) y con el
    uso real, que es por episodios: la segunda vez que el niño se enferma la familia ya tendría que pagar *por ver o
    seguir usando lo que ella misma escribió*. Alternativa recomendada, que conserva la idea del muro sin ocultar datos:
    - **Gratis:** **una consulta con tratamiento activo a la vez** (se deriva de las tomas, sin juicio médico). Cuando termina,
      puede registrar la siguiente enfermedad: nunca se topa con el muro por uso normal. Lo que ya registró **siempre lo ve**
      (lista simple por fecha). Recordatorios del tratamiento activo, 1 hijo.
    - **Pago:** varias consultas a la vez, **consultas previas «solo registro»** (spec 024: pasar a la app el historial de
      antes), **búsqueda y filtros**, compartir (punto 1), más hijos, y lo del punto 3.
    - Si aun así se prefiere la versión original (gratis solo ve la actual), decidirlo sabiendo ese costo, y al menos **no
      borrar** nada: lo anterior queda guardado y se muestra bloqueado, nunca perdido.
  - **3. Búsqueda y filtros del historial (pago)** — una pantalla «Historial» por hijo (o de todos) con búsqueda de texto
    (doctor, medicamento, notas) y filtros por **rango de fechas**, **doctor**, **síntoma** (usa el catálogo de la spec
    012), **medicamento** y «con tratamiento / solo registro». Es solo lectura sobre datos que ya existen: un endpoint de
    consulta con filtros (con índices por `child_id, consult_date`) y una pantalla; no cambia el modelo. Resultado = la
    lista de consultas que ya existe. **Nunca** sugiere ni compara («esto parece…»): solo encuentra (Principio I).
  - **4. Otras ideas del plan de pago (de la memoria y nuevas)**
    - **Exportar el historial a PDF** para llevarlo al pediatra (el momento de más valor de la app); con filtros del punto 3.
    - **Liga de solo lectura para el pediatra**, temporal y revocable, sin cuenta (se solapa con el Plan Consultorio).
    - **Curvas de crecimiento OMS** con la talla y el peso que ya se guardan (informativo, sin interpretar).
    - **Cartilla de vacunas** y **recordatorios de citas** (la fecha de la próxima consulta).
    - **Varios dispositivos por persona** y un **resumen semanal** de tomas por correo (cuando exista proveedor de correo).
  - **Decisiones abiertas (responder antes de la spec):**
    1. ¿Gratis = «una consulta activa a la vez, con historial visible» (recomendado) o «solo la consulta actual» (original)?
    2. ¿Quién paga? ¿El plan es de **la cuenta que paga** y cubre a los invitados, o cada tutor paga el suyo? (Recomendado: una
       suscripción por familia, el invitado no paga.)
    3. Si el que paga cancela: ¿los invitados conservan lectura? ¿cuánto tiempo?
    4. Separación o disputa de custodia: ¿puede un tutor quitarle el acceso al otro? (Recomendado: solo quien creó al hijo,
       y queda registro.) Conviene preguntarlo a alguien legal antes de lanzarlo.
    5. Edad mínima y consentimiento para el rol *Hijo*.
    6. ¿Se cobra por familia, por hijos o por funciones? El corte de la memoria es por funciones y 2+ hijos (MX$399–499 al año).
  - **Antes de cobrar algo hay que tener:** (a) un **proveedor de pagos** (Stripe con tarjeta y OXXO/SPEI, o Mercado Pago;
    en una PWA no aplica la tienda de Apple/Google); (b) que el plan deje de ser un simple `free`/`paid` y guarde **estado,
    vigencia y proveedor** (`plan_status`, `plan_renews_at`, `provider_customer_id`, con periodo de gracia al fallar un
    cobro); (c) la pantalla de planes (`/planes`) y el aviso de privacidad y términos actualizados; (d) un correo del
    dominio para recibos y soporte (`@pedi-track.com`, pendiente de proveedor).
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

- **Entorno DEV fijo para que otras personas prueben** — **hecho el 2026-10-05**: `https://dev.pedi-track.com` (Cloudflare Pages) + `https://api-dev.pedi-track.com` (Railway + Postgres), rama `develop`, DNS en HostGator; guía en `DEPLOY.md` y para quien prueba en `PROBAR.md`. Pendiente de cerrarlo bien: rotar las llaves que se mostraron en un chat (Postgres, `CLERK_SECRET_KEY`, `VAPID_*`, `REMINDER_ACTION_SECRET`, `OPS_API_KEY`) antes de invitar a más gente, y decidir el correo `@pedi-track.com` (proveedor y registros MX).
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
