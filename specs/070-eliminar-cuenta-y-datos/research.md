# Investigación: Eliminar la cuenta y descargar todos mis datos (spec 070)

Decisiones técnicas para la spec. Cada una con su justificación y lo que se descartó. Se revisó el código de `develop` del 2026-11-12 (migraciones `0001`–`0035`; la `0036` es de la spec 069, en su propio PR).

## R1 — Lo que se borra: no hay cascadas, se borra en orden y en una transacción

**Hallazgo**: ninguna llave foránea del esquema tiene `ON DELETE CASCADE` (decisión antigua: nada se borra por accidente). Del grafo de llaves sale esto:

- **Datos de la cuenta y de sus hijos** (se borran): `children`, `consultations` (de un hijo o propias, `consultations.account_id`), `consultation_symptoms`, `medications`, `medication_extensions`, `doses`, `dose_reminders`, `child_dose_reminders`, `consultation_appointments`, `appointment_notices`, `appointment_notice_reminders`, `appointment_muted`, `supplement_routines`, `supplement_doses`, `supplement_dose_reminders`, `child_supplement_dose_reminders`, `supplement_muted`, `personal_routine_notices`, `vaccine_records`, `vaccine_card_photos`, `growth_measurements`, `medicine_cabinet_items`, `child_device_links`, `reminder_devices` (de la cuenta y de los teléfonos de sus hijos), `own_consultation_sharing`, `own_consultation_reminder_optins` (las de sus consultas y las suyas en consultas ajenas), `family_members` y `family_invitations` (su familia y su membresía en otra), `disclaimer_acceptances`, `subscriptions`, `payment_events` y, al final, `accounts`.
- **Referencias de autoría en datos de otras cuentas** (no se borran: se quita el autor). Una persona invitada pudo marcar tomas o crear registros en los hijos de la familia: `doses.taken_by_account_id`, `supplement_doses.taken_by_account_id`, `created_by_account_id` (rutinas, citas, vacunas, fotos de la cartilla, medidas, botiquín, ligas de teléfono), `corrected_by_account_id`, `updated_by_account_id`, `edited_by_account_id`, `status_by_account_id`, `revoked_by_account_id`, `ended_by_account_id`, `consent_by_account_id` e `invited_by_account_id`.
- **`error_logs.account_id`**: es nulo por diseño (spec 002); se pone en `NULL`.

**Decisión**:

1. El borrado de una cuenta es **una sola transacción** en `internal/accountdeletion`, con un orden fijo de las hojas hacia la raíz. Una prueba recorre `information_schema` y **falla si aparece una tabla nueva con una llave hacia `accounts` o `children` que el borrado no conoce**: así una spec futura no deja datos huérfanos ni rompe la eliminación.
2. Las marcas de una persona eliminada en tomas ajenas **siguen marcadas**: `taken_by_account_id = NULL` y se conserva `taken_at`. El CHECK `doses_author_only_when_taken` ya lo permite (es como una marca anterior a la spec 032). La pantalla no muestra nombre (FR-015).
3. La migración `0037` quita el `NOT NULL` de los `created_by_account_id` / `invited_by_account_id` que hoy lo tienen, para poder borrar al autor sin borrar el registro ajeno. «Creada por» se oculta cuando no hay autor.

**Alternativas**: `ON DELETE CASCADE` en todas las llaves (descartado: cambia 60 llaves, y un `DELETE` por error en cualquier otra parte se llevaría todo); «anonimizar» la cuenta en lugar de borrarla (descartado: el derecho de cancelación y FR-013 piden borrar de verdad).

## R2 — La solicitud y el plazo: tabla `account_deletions` (migración `0037`)

**Decisión**: una fila por solicitud, **sin llave foránea a `accounts`** (sobrevive al borrado como constancia, FR-018): `account_id`, `clerk_user_id` (se vacía al completar), `requested_at`, `scheduled_for` (= `requested_at` + 30 días, FR-010), `canceled_at`, `completed_at`, `attempts`, `last_attempt_at`. Un índice único parcial deja **una sola solicitud abierta por cuenta** (ni cancelada ni completada).

Al completarse queda solo `account_id` (un UUID aleatorio, sin datos de la persona), las fechas y los intentos.

**Alternativas**: una columna `deletion_scheduled_for` en `accounts` (descartado: se borra con la cuenta y no queda constancia).

## R3 — Durante el plazo: la cuenta queda en «solo descargar y cancelar»

**Decisión** (Q1 = A):

- Un middleware nuevo, `accountdeletion.RequireNotPending`, va **después** de `RequireSession` en todas las rutas con sesión de Clerk. Si la cuenta de la sesión tiene una solicitud abierta, responde **409 `account_deletion_pending`** (con `scheduledFor`) **salvo** en una lista cerrada: `GET /accounts/me`, `GET /accounts/{id}/deletion`, `POST /accounts/{id}/deletion/cancel` y `POST /accounts/{id}/data-export`. Una consulta `EXISTS` por petición, sin caché, como el teléfono del hijo (spec 047). Una prueba de `router_test.go` recorre todas las rutas con `chi.Walk`, igual que `childdevice_router_test.go`.
- **Los avisos de la propia persona se detienen** (FR-012): `ClaimDueDoses`, `ClaimDueSupplementDoses`, `ClaimDueAppointmentNotices` y las rutinas personales excluyen como destinatario a una cuenta con solicitud abierta.
- **Si es dueña de una familia** (Q2 = A): sus invitados bajan a **`Mark`** (ven y marcan, no crean ni editan), con el mismo mecanismo con el que hoy bajan cuando la dueña deja de pagar (`levelCase` en `internal/access`). Siguen sus avisos y los de los teléfonos de los hijos. Invitar y aceptar una invitación de esa familia responden 409 `family_deletion_pending`.
- Si cancela, todo vuelve solo: nada se borró ni se cambió, porque todo eso se **deriva** de que exista la solicitud abierta.

**Alternativas**: desactivar el usuario en Clerk durante el plazo (descartado: entonces no podría entrar a cancelar ni a descargar).

## R4 — Confirmar: identidad reciente (Clerk) y una palabra

**Decisión**:

- El frontend usa **`useReverification`** de `@clerk/react` 6.16: si la sesión no se verificó hace poco, Clerk pide la contraseña o el código y repite la petición.
- El backend comprueba en `POST /accounts/{id}/deletion` que **`claims.NeedsReverification({AfterMinutes: 10, Level: first_factor})`** es falso (`clerk-sdk-go/v2` v2.7.0 trae `FactorVerificationAge` y `NeedsReverification`). Si no, responde **403** con la forma de error que `useReverification` reconoce (`clerk_error: {type: "forbidden", reason: "reverification-error"}`). `authmw` deja los *claims* en el contexto para esto.
- El cuerpo trae `confirm: "ELIMINAR"`, y el servidor la revisa también. Un toque accidental nunca basta (FR-009).

**Alternativas**: pedir la contraseña en un campo propio (descartado: la contraseña es de Clerk y nunca la ve el backend, decisión de la spec 008; y no serviría para quien entra con Google).

## R5 — La suscripción se cancela al pedir la eliminación, no al final

**Decisión**: `POST /accounts/{id}/deletion` llama a `payments.Service.Cancel` **antes** de guardar la solicitud. Si Mercado Pago falla, la solicitud **no se guarda** y la app dice «No pudimos cancelar tu suscripción. Intenta en unos minutos; no se hizo ningún cambio». Así nunca hay una cuenta en camino de borrarse que siga pagando (FR-016, SC-006). `Cancel` ya es idempotente y deja `canceled`. Al final del plazo se borran `subscriptions` y `payment_events`.

**Registros de pago**: la constancia fiscal de cada cobro la conserva Mercado Pago, que es quien cobra. PediTrack no emite CFDI todavía (BACKLOG). **Pendiente del dueño**: confirmarlo con su contador antes del primer cobro real. Si hiciera falta conservar algo, sería una tabla aparte sin nombres ni datos de salud.

## R6 — El borrado real: un proceso en el API cada 10 minutos

**Decisión**: `accountdeletion.RunEvery` arranca en `cmd/api` (como `retention`) y cada 10 minutos toma las solicitudes vencidas con `FOR UPDATE SKIP LOCKED` (varias copias del API no borran dos veces). Por cada cuenta:

1. Lee el correo de la cuenta (para el último aviso) y su `clerk_user_id`.
2. **Borra el usuario en Clerk** (`user.Delete`; un 404 cuenta como hecho). Va primero: si el borrado de la base fallara después, la persona igual ya no puede entrar y crear una cuenta vacía con su sesión vieja.
3. Borra los datos en **una transacción** (R1).
4. Marca la solicitud `completed_at` y vacía `clerk_user_id`.
5. Manda el correo final (FR-017). Si falla, no se reintenta más de lo que reintenta `mailer` y no detiene nada.

Si algo falla, se suma `attempts`, se deja una fila en `error_logs` (`job:account-deletion`, mensaje fijo: `clerk`, `purge`, `notify`; FR-019) y se reintenta en la siguiente vuelta. Nunca queda una cuenta medio borrada **visible**: la persona ya no puede entrar desde el paso 2.

**Alternativas**: un servicio cron aparte como el de respaldos (descartado: necesita las mismas llaves y la misma base que el API, y el API ya corre siempre).

## R7 — Los respaldos y una restauración

**Hallazgo**: la tabla `account_deletions` vive en la misma base que se respalda. Si se restaura una copia anterior a un borrado, esa constancia **no está en la copia**.

**Decisión**: la constancia que sobrevive a cualquier restauración es **Clerk**, que vive fuera de la base: una cuenta cuyo `clerk_user_id` ya no existe en Clerk fue eliminada. Se agrega `go run ./cmd/accounts reconcile-deleted` (con `DATABASE_URL` y `CLERK_SECRET_KEY`): recorre las cuentas, pregunta a Clerk por cada usuario y, si Clerk responde 404, **borra esa cuenta de nuevo** con el mismo código de R6. `RESPALDOS.md` (spec 069) lo agrega como paso obligatorio **después de restaurar y antes de cambiar `DATABASE_URL` del API**. Las copias cifradas no se editan; caducan solas por la retención (máximo 6 meses), y el aviso de privacidad lo dirá.

**Alternativas**: guardar las constancias también en R2 (descartado: los respaldos no están activos y agregaría otra dependencia); editar las copias cifradas (imposible sin la llave del dueño y contra la spec 069).

## R8 — «Llévate todo»: un ZIP armado en el servidor y mandado en flujo

**Decisión**: `POST /accounts/{id}/data-export` (cualquier plan; `ownsAccount`; límite estricto de peticiones porque es pesado) responde `application/zip` **en flujo**, con `archive/zip` de la biblioteca estándar (ZIP64 automático, sin dependencias). Contenido:

- `LEEME.txt` en español: qué es cada archivo y que las horas están en la hora de Ciudad de México y en UTC.
- `datos.json`: todo, completo, con identificadores estables entre tablas.
- Un CSV por tipo (`hijos.csv`, `consultas.csv`, `medicamentos.csv`, `tomas.csv`, `citas.csv`, `vacunas.csv`, `crecimiento.csv`, `suplementos_y_actividades.csv`, `tomas_de_rutinas.csv`, `botiquin.csv`), en UTF-8 con BOM para que Excel muestre bien los acentos, con columna `foto` cuando aplica.
- `fotos/recetas/`, `fotos/cartilla/` y `fotos/botiquin/`, con la extensión según los primeros bytes (`internal/imagecheck`).

Las fotos se leen **una por una** desde la base y se escriben al ZIP, sin juntar todo en memoria. Las marcas ajenas llevan **solo el nombre de pila** de quien marcó, como en la pantalla.

**No se guarda ninguna copia en el servidor**: si la persona sale a mitad, la vuelve a pedir y la recibe completa. Se ajustó el escenario 4 de la Historia 1. Guardar un ZIP con todos los datos de salud sería otra copia que proteger y borrar.

**La regla de `httpx.Responder`**: los errores **antes** de empezar a mandar el archivo van por `Responder.WriteJSONError` como siempre. Se agrega `Responder.Stream(ctx, w, contentType, filename, accountID, func(io.Writer) error)`, que escribe las cabeceras y, si la función falla a la mitad (ya no se puede cambiar el estado HTTP), registra una fila fija en `error_logs` y corta la conexión. Así el cliente ve una descarga fallida y no un ZIP incompleto que parezca bueno. Los errores siguen pasando todos por `Responder`.

**Tutores durante el plazo de la dueña** (FR-004): `POST /family/children-export`, solo para un integrante activo de una familia cuya dueña tiene la eliminación programada. Usa el mismo armado, limitado a los hijos de esa familia.

**Frontend**: `fetch` → `Blob` → «Compartir» o «Descargar», el mismo camino del PDF (spec 050, `features/pdfExport/`). Necesita conexión (`RequireConnection`, spec 067).

**Alternativas**: armar el ZIP en el teléfono como el PDF (descartado: serían cientos de peticiones de fotos y de datos, frágil en un iPhone); el PDF como única descarga (descartado: no es legible por otra aplicación y es del plan completo).

## R9 — Correos

**Decisión**: tres mensajes con `internal/mailer` (cuota diaria compartida, spec 040), con una clase nueva `ClassAccount` que usa el mismo tope que las invitaciones:

1. **Al pedir** (a la persona): la fecha del borrado y que puede cancelarlo entrando a la app.
2. **A cada persona invitada**, si quien pide es dueña de una familia: la fecha, que hasta entonces puede ver, marcar y descargar, y el nombre de pila de la dueña. **Nunca nombres de hijos ni datos de salud** (FR-017).
3. **Al completarse** (a la persona): que su cuenta y sus datos se borraron.

Sin `RESEND_API_KEY` o con la cuota llena, **la eliminación sigue igual**: la app muestra la misma información. El correo nunca detiene nada.

## R10 — Lo que se probará

- **Unitarias y contra la base**:
  - el borrado completo de una cuenta con dos hijos y datos en **todas** las tablas, y la búsqueda posterior de su `account_id` y de cada `child_id` en **todo** el esquema (SC-004);
  - la prueba de «tabla nueva sin borrar» de R1;
  - la persona invitada que se va: la familia sigue y sus marcas quedan sin autor;
  - cancelar devuelve todo;
  - el middleware, con su lista cerrada;
  - la suscripción que falla al cancelar;
  - `reconcile-deleted` con un Clerk falso;
  - el ZIP: todos los registros, todas las fotos y nada de otra cuenta (SC-002);
  - la prueba de privacidad: ni correos ni contenido en `error_logs`.
- **E2E** (390 y 1280 px): descargar los datos, pedir la eliminación, ver la pantalla de «solo descargar y cancelar», cancelar. El borrado final no se espera 30 días: se prueba en Go con el reloj del repositorio (`SetNow`).
