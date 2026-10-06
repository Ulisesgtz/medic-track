# Investigación (Fase 0): Compartir con la familia

Decisiones técnicas de la spec 032. Cada una: **Decisión**, **Justificación**, **Alternativas**. No quedó ningún
`NEEDS CLARIFICATION`. Lo que hay hoy (leído del código): todo permiso es «¿esta sesión es dueña de esta cuenta/hijo/consulta?»
(`internal/ownership`: tres `EXISTS` sobre `accounts.clerk_user_id` y `children.account_id`, usados por `RequireOwner` en
`internal/server/router.go`); los recordatorios se reclaman **por toma** (`doses.reminder_sent_at`, `ClaimDueDoses`) y se
mandan a los dispositivos de **la cuenta dueña del hijo**; una toma es solo `taken boolean`; `GET /accounts/me` devuelve la
cuenta con **sus** hijos.

## R1 — Entregas y orden

**Decisión**: la Entrega 1 (Tutores) se construye en este orden dentro de la misma rama/PR **por fases**: (1) modelo y
migraciones + el **resolvedor de acceso** (sin cambiar lo que ve nadie: el dueño sigue siendo el único con acceso); (2)
**quién marcó** (autor y hora de cada toma); (3) invitar/aceptar/«Familia» + `GET /accounts/me` con hijos compartidos; (4)
**recordatorios por persona**; (5) desvincular/quitar y plan cancelado. La Entrega 2 (Cuidador) agrega un rol sobre lo mismo; la
3 (Hijo) queda con su diseño pendiente de lo legal. Cada fase deja la app funcionando y con pruebas en verde.

**Justificación**: lo más riesgoso es tocar todos los permisos; hacerlo primero, sin cambiar el comportamiento, deja una base
probada (la matriz rol × ruta) antes de agregar personas.

## R2 — Modelo: la familia es la cuenta dueña; las personas son membresías

**Decisión**: **sin copiar datos**. Los hijos y consultas siguen colgando de `accounts` (la cuenta dueña). Dos tablas nuevas:
`family_members` (una fila por persona con acceso: cuenta, rol, hijo si el rol es Hijo, quién invitó, estado
`active|removed|left`, fechas, consentimiento) e `family_invitations` (a un correo, rol, estado, vencimiento, ficha de la liga
con su *hash*). Una **persona** es una cuenta (su `accounts.id`/Clerk): sus **dispositivos, su elección de detalle y su aviso
«Antes de empezar» siguen siendo suyos**, como hoy.

**Justificación**: encaja con «los datos son de la cuenta dueña» y «quien sale no se lleva nada» (no hay nada que mover ni
borrar); los recordatorios por persona ya tienen dónde vivir (`reminder_devices.account_id`, `accounts.reminder_detail`).

**Alternativas**: una tabla `families` aparte con los hijos colgando de ella — correcto en abstracto pero obliga a migrar
`children.account_id`, las llaves compuestas de `consultation_symptoms` y la propiedad de todo; rechazada (Principio V).

## R3 — Un solo resolvedor de acceso: `internal/access`

**Decisión**: un paquete `access` que responde **«¿qué puede esta sesión sobre este hijo?»** con un **nivel**: `none`,
`mark` (ver y marcar), `full` (todo). Reglas: la **cuenta dueña** → `full`; **Tutor** activo → `full`; **Cuidador** activo →
`mark`; **Hijo** activo → `mark` **solo para su hijo**. **Tope por plan**: para una persona **invitada** (no la dueña), si el
plan de la cuenta dueña **no** es `paid`, el nivel baja a `mark` (solo lectura que sigue marcando, FR-024); la dueña conserva
las reglas de su plan (specs 029/030). `access` reemplaza a `ownership` para hijos, consultas y tomas; `ownership.OwnsAccount`
queda para lo **propio de la cuenta de la persona** (aviso, recordatorios, dispositivos).

**Justificación**: una sola función decide y se prueba con una matriz; el servidor consulta la base en **cada** petición, así
que quitar a alguien o cambiar el plan tiene efecto inmediato (FR-028, SC-007) sin estado que invalidar.

## R4 — Qué nivel pide cada ruta

| Ruta | Nivel | Notas |
|---|---|---|
| `GET /children/{id}/consultations`, `/overview`, `/history-options`, `POST …/consultations/search` | `mark` (ver) | |
| `GET /consultations/{id}` | `mark` (ver) | resuelto por su hijo |
| `PATCH /consultations/{id}/doses/{doseId}` | `mark` | marcar siempre; **desmarcar** solo lo propio o `full` (R7) |
| `POST /children/{id}/consultations` | `full` | más las reglas de plan de la spec 030 sobre la cuenta **dueña** |
| `POST …/medications/{id}/end` y `/extend` | `full` | |
| `POST /accounts/{ownerId}/children` | `full` sobre esa cuenta | el tope de hijos es el del plan de la **dueña** |
| `GET /accounts/me` | la propia sesión | incluye hijos compartidos (R5) |
| Aviso, recordatorios, dispositivos (`/accounts/{id}/…`) | dueña **de su propia cuenta** | sin cambio |
| `POST /reminders/actions/taken` | token firmado | el actor es la cuenta del **dispositivo** (R8) |
| `/family/…` | ver contrato | invitar/quitar piden `full`; salir, el propio |

Para el rol **Hijo**: ver y marcar **solo** sobre su hijo; cualquier otro hijo responde 403 (igual que uno ajeno).

## R5 — `GET /accounts/me` mezcla los hijos compartidos, con su rol y su plan

**Decisión**: la respuesta conserva su forma y **agrega** a cada hijo `accountId` (la cuenta dueña), `role` (`owner`, `tutor`,
`caregiver`, `child`), `plan` (el de **su familia**) y `readOnly`; y una sección `family` (rol propio, cuenta dueña, nombre de
quien paga). Lo que la app hoy decide con `account.plan` (límite de hijos, nueva consulta, entrada del historial, pop-ups) pasa
a decidirse con **el `plan` del hijo en cuestión**.

**Justificación**: sin eso, un Tutor con cuenta gratuita que mira a un hijo de una familia de pago vería avisos de plan que no
le corresponden (el servidor ya decide con el plan de la cuenta **dueña del hijo**, `accountPlanOf`). Mantener la forma evita
tocar cada pantalla que lee `account.children`.

## R6 — Marcar tomas con autor

**Decisión**: `doses` gana `taken_by_account_id` y `taken_at` (nulos). **Marcar** es atómico y **gana la primera**: el `UPDATE`
solo actúa si la toma no estaba marcada; si ya lo estaba, se devuelve tal cual (con su autor) sin sobrescribir (FR-014).
**Desmarcar** (`taken = false`): permitido si la persona es `full` o si **ella** la marcó; borra autor y hora. Las marcas
**anteriores** quedan con autor nulo («tomada», sin «por …», FR-015); solo un `full` puede desmarcarlas. Las respuestas de tomas
(detalle, resumen, `PATCH`) agregan `takenBy` (`{ name, at }`, solo el **nombre de pila**, nunca el correo) o `null`.

**Justificación**: la regla «primera gana» y el permiso de desmarcar viven en **una** sentencia SQL, sin condiciones de carrera.

## R7 — Recordatorios por toma **y por persona**

**Decisión**: tabla `dose_reminders (dose_id, account_id, sent_at)` con llave primaria `(dose_id, account_id)`: es el
«ya se le avisó a esta persona de esta toma». `ClaimDueDoses` pasa a reclamar **pares** (toma, persona) con un
`INSERT … SELECT … ON CONFLICT DO NOTHING RETURNING`: atómico, una fila por par, sin dobles aunque corran dos *ticks*.
Las **personas destinatarias** de una toma son las cuentas con acceso a su hijo (dueña, Tutores, Cuidadores y el Hijo de ese
hijo) que tengan **un dispositivo activo activado antes de la toma**; **nadie** si la toma ya está marcada o es de las que ya no
se avisan (sin registrar, cancelada, spec 013/016). Cada persona recibe con **su** `reminder_detail` y en **sus** dispositivos
(`ActiveDevicesFor` ya es por cuenta). El botón «Tomada» marca a nombre de la **cuenta del dispositivo** y solo si esa cuenta
**aún tiene acceso** (`mark`) al hijo de la toma. `doses.reminder_sent_at` deja de decidir y queda escrito para compatibilidad;
una migración **rellena** `dose_reminders` para lo ya avisado, así nada se reenvía al desplegar.

**Justificación**: es el cambio de semántica central de la spec («a lo más un aviso por toma y por persona»); la llave primaria
lo garantiza en la base, no en el código.

## R8 — Invitaciones: correo como candado, liga en el fragmento, sin correo saliente todavía

**Decisión**: la invitación se dirige a un **correo** (en minúsculas); la **liga** lleva una ficha aleatoria de 32 bytes que se
guarda **solo como *hash* (SHA-256)** y viaja en el **fragmento** de la dirección (`/familia/invitacion#<ficha>`): el
fragmento no llega al servidor ni a sus registros ni a los de Cloudflare; la app lo lee y lo manda en el **cuerpo** de
`POST …/preview`, `…/accept` y `…/decline`. **Aceptar** exige que el correo **verificado** de la sesión (el mismo mecanismo
que `POST /accounts`: `clerkPrimaryEmail`) sea el de la invitación (FR-003). Vence a los **7 días**; **reenviar** emite una ficha
nueva e invalida la anterior; una invitación se usa una sola vez. Un correo **ya con acceso o con otra pendiente** no se duplica.
**No se manda correo** en esta entrega (no hay proveedor, `BACKLOG.md`): quien invita copia/comparte la liga; el envío por
correo queda como mejora cuando exista proveedor. (La spec lo anota como «y le manda el correo»: se cumple con la liga.)

**Justificación**: el correo vinculado evita que alguien entre como Tutor —que ya no se puede quitar— por una liga reenviada;
el fragmento mantiene la ficha fuera de todos los registros (mismo criterio que la búsqueda del historial, spec 031).

## R9 — Tope de 4 personas y condiciones de carrera

**Decisión**: al invitar y al aceptar, el servidor toma el candado de la **fila de la cuenta dueña** (`FOR UPDATE`, como
`checkPlan` de la spec 030) y cuenta **personas activas + invitaciones pendientes + la dueña** ≤ 4. Aceptar además exige que la
persona **no tenga ya una membresía activa** (índice único parcial sobre `family_members(account_id) WHERE status = 'active'`).

## R10 — Salir, quitar, y quién no puede ser quitado

**Decisión**: transiciones de `family_members.status`: `active → left` (la propia persona, `POST /family/leave`) y
`active → removed` (`POST /family/members/{id}/remove`, solo `full`, **solo** si la persona quitada es Cuidador o Hijo). El
servidor **rechaza** quitar a un Tutor y que la dueña salga; no hay otra puerta. Se **conservan** las filas con `ended_at` y
`ended_by` (auditoría y para poder volver a invitar). Lo que la persona registró (consultas, marcas) se queda: cuelga de la
cuenta dueña y la marca guarda el id de cuenta, así «por Ana» sigue mostrándose.

## R11 — Plan cancelado: sin estado nuevo

**Decisión**: «solo lectura» no se guarda: se **deriva en cada petición** del plan de la cuenta dueña (R3). Al volver `paid`,
las personas recuperan su nivel solas (US5.4). Unirse a una familia (aceptar) y invitar exigen que la cuenta **dueña** sea
`paid` (FR-025); el rechazo usa el mismo 422 de planes (motivo nuevo `family`).

## R12 — Aviso «Antes de empezar» y consentimiento

**Decisión**: se sube `account.CurrentDisclaimerVersion` con el texto nuevo de compartir (cada cuenta lo confirma de nuevo, el
mecanismo de las specs 009/010). El consentimiento del tutor para el rol Hijo (Entrega 3) se guarda **en la invitación y en la
membresía** (`consent_by_account_id`, `consent_at`).

## R13 — La app: «Familia», la invitación y «por …»

**Decisión**: rutas nuevas `/familia` (quién tiene acceso, invitaciones, invitar, quitar, salir; visible para el plan de pago y,
con el aviso, para el gratuito) y `/familia/invitacion` (pública para llegar, pide sesión: previsualiza, acepta o rechaza; si la
persona no tiene cuenta de PediTrack, un formulario mínimo de nombre y apellido crea una **cuenta sin hijos** antes de
aceptar). La interfaz se **adapta al rol**: un Cuidador no ve «Nueva consulta», «Agregar hijo», «Finalizar/Recorrer» ni «Familia»
para invitar; todo se decide con `child.role`/`child.readOnly` y **también** lo rechaza el servidor. «por Ana, 08:05» sale en el
chip y la tarjeta de cada toma. Dos diseños (móvil y web) sin mock, con el sistema visual existente.

## R14 — Pruebas

**Decisión**: **matriz rol × ruta** (dueña, Tutor, Cuidador, Hijo ajeno, sin acceso, quitado, plan cancelado) generalizando
`router_test.go`; carrera de dos marcas, de dos aceptaciones y del tope de 4; recordatorios: un aviso por persona y por toma, ninguno
si ya marcada, ninguno a quien perdió el acceso; privacidad (la ficha y el correo no aparecen en `error_logs`). E2E con **dos
sesiones** (contextos de Playwright) a 390 y 1280 px: invitar → aceptar → marcar → ver «por …» → salir.

## R15 — Despliegue

**Decisión**: migraciones **0017** (familias, invitaciones) y **0018** (autor de la marca y `dose_reminders` con relleno), aplicadas a
mano **antes** del backend (el orden de siempre, `DEPLOY.md`); el backend nuevo funciona con la app anterior (los campos nuevos
son aditivos). Sin variables nuevas.

## R16 — El rol Hijo (Entrega 3)

**Decisión**: el modelo ya lo admite (`role = 'child'`, `child_id`, consentimiento) y `access` lo restringe a su hijo; **lo que
falta** es cómo entra el hijo (cuenta propia o acceso dado por el tutor) y eso depende de la confirmación legal; se planea en su
propia entrega. No se construye en la Entrega 1.
