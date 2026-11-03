# Investigación: Consultas del titular

Decisiones de la Fase 0 del plan de la spec 058. Cada una dice qué se eligió, por qué y qué más se evaluó. Se revisó el código de
`develop` al 2026-11-02 (`internal/access`, `internal/consultation`, `internal/reminder`, `internal/appointment`,
`internal/childdevice`, `internal/historyexport`, `internal/supplement/personal.go`, migraciones `0006`, `0012`, `0020`, `0021`,
`0026`) y del frontend (`features/childDetail`, `features/supplements/MyDayPage.tsx`, `App.tsx`).

## R1. El modelo: una consulta sin hijo, con su cuenta

**Decisión**: `consultations` gana `account_id UUID NOT NULL` (la cuenta dueña: la del hijo o la de la persona) y `child_id`
pasa a ser nulo: una consulta sin hijo es **de la persona de su `account_id`** (no hace falta otra columna ni un CHECK; la
cuenta siempre está). La migración rellena `account_id` desde `children.account_id` antes del `SET NOT NULL`. Se agrega
`UNIQUE (id, account_id)` y una llave compuesta `(child_id, account_id) → children (id, account_id)` (que solo se revisa cuando
hay hijo, `MATCH SIMPLE`): la base no deja que una consulta de un hijo apunte a otra cuenta. Índice
`idx_consultations_own (account_id, consult_date DESC) WHERE child_id IS NULL`.

Es el mismo camino de las rutinas personales (spec 033 parte 3: `supplement_routines.child_id` nulo) y de las citas sin consulta
(spec 044).

**Justificación**: toda consulta SQL de un hijo filtra por `child_id = $1` o une `children` con `JOIN`: una fila con `child_id`
nulo **nunca** entra en ellas (`NULL = x` no es verdadero y un `JOIN` interno la descarta). Eso da FR-008 (nada propio en las
pantallas de un hijo ni en el teléfono del hijo) sin tocar esas consultas, y lo fijan pruebas. Lo único que se reescribe es lo
que resuelve **la cuenta dueña** a partir de la consulta: hoy lo hace por `children.account_id`; con la columna lo lee directo.

**Alternativas**:
- *Un «hijo» oculto que representa al titular* (`children.kind = 'self'`): reutiliza todo sin cambiar el esquema, pero cada
  consulta de hijos del sistema (lista del inicio, límite de hijos del plan, cartilla, acceso del hijo, familia, PDF) lo vería
  y habría que excluirlo en cada una; un olvido muestra la salud de un adulto como si fuera un hijo. Rechazada por riesgo.
- *Tablas paralelas* (`own_consultations`, `own_medications`, `own_doses`): aislamiento total, pero duplica tomas, estados,
  recordatorios, recorrido, edición, calendario y PDF. Rechazada (Principio V).

## R2. Las tablas que cuelgan de la consulta

- **`medications`, `doses`, `medication_extensions`, `dose_reminders`**: se ligan a la consulta o al medicamento, no al hijo; no
  cambian.
- **`consultation_symptoms`**: hoy `child_id NOT NULL` con llaves `(consultation_id, child_id) → consultations` y
  `(child_id, account_id) → children`. Pasa a `child_id` nulo y gana `(consultation_id, account_id) → consultations (id,
  account_id)`, que sí se revisa siempre. El `INSERT … SELECT` de `Create` y de `Update` (spec 051) toma la cuenta de la
  consulta, no de `children`.
- **`consultation_appointments`**: ya tiene `account_id`. `child_id` pasa a nulo con la misma regla («sin hijo = cita de la
  persona de `account_id`») y gana `(consultation_id, account_id) → consultations (id, account_id)`, así una cita propia no
  puede colgar de la consulta de otra cuenta. Una cita propia sin consulta (spec 044) es posible:
  `child_id` y `consultation_id` nulos.
- **Fotos**: viven en `consultations.photo`. El tope de 100 fotos por cuenta (spec 043) cuenta hoy por los hijos de la cuenta;
  pasa a contar por `consultations.account_id`, así que **las fotos propias cuentan en el mismo tope** (es la misma cuenta y el
  mismo almacenamiento).

## R3. El acceso a una consulta propia

**Decisión**: `access.onConsultationQuery` se reescribe con `LEFT JOIN children` y la cuenta dueña desde `k.account_id`. Para una
consulta con hijo el nivel es el de hoy (`levelCase`). Para una **consulta propia** (`k.child_id IS NULL`):

- `a.id = k.account_id` → **Full** (2).
- Si no, **Mark** (1) cuando se cumple todo: el dueño tiene encendido el interruptor de compartir (R5), los dos están en **la
  misma familia** (`familyOf(x)` = `x` si es dueña de una familia con integrantes activos, o el `family_account_id` de su
  membresía activa) y el que pregunta es **la dueña de esa familia o un integrante activo con rol `tutor`**.
- Si no, **None** (0) → la misma respuesta que una consulta que no existe (FR-016).

El nivel de una persona invitada nunca sube a Full sobre la consulta de otra persona, aunque la familia pague: editar,
finalizar, recorrer y la cita (`fullConsultation`, `access.OnAppointment` Full) quedan solo para el dueño (FR-010).

`access.OnAppointment` hace lo mismo para una cita sin hijo (`ap.account_id` dueño). Un nuevo `access.OnPerson(session,
accountID)` da el nivel sobre **el perfil** de una persona con la misma regla (Full = ella misma; Mark = Tutor con el interruptor
encendido) para las rutas que nombran `{accountId}` (R6). `OfAccountOnConsultation(account, consultation)` sirve a «Tomada» desde
el aviso (R7).

**Justificación**: se deriva en cada petición, nada se guarda en caché (FR-012), igual que la spec 032. Una sola consulta SQL por
petición, como hoy.

**Alternativas**: un `RequireOwner` aparte para lo propio (sin niveles): rompe el reparto de las rutas `/consultations/{id}`, que
ya usan `seesConsultation`/`fullConsultation`, y obligaría a duplicarlas. Rechazada.

## R4. El plan

**Decisión**: crear una consulta propia (`Repository.Create` sin hijo) bloquea la fila de la cuenta (`FOR UPDATE`) y lee el plan
con el mismo `personalPlanSQL` de las rutinas personales (su cuenta `paid` o integrante activo de una familia `paid`); si no,
`*PlanLimitError` con `Reason` nuevo `own_consultations` → 422 `freemium_consultation_limit_exceeded`. **Recorrer** un
tratamiento propio pide el mismo plan (`ExtendTreatment`, solo si la consulta no tiene hijo; el de un hijo sigue sin pedirlo).
Ver, marcar, editar (spec 051), finalizar, la cita ya creada y los avisos nunca lo piden (FR-018). La búsqueda y el PDF propios
usan la misma regla con sus motivos de hoy (`history_search`, `pdf_export`), con el plan **de la persona dueña del historial**.

**Las reglas del plan gratuito de la spec 030** (un tratamiento activo a la vez en la cuenta, sin «solo registro») **no cuentan
las consultas propias**: la consulta SQL de `checkPlan` une `children`, así que las propias quedan fuera sin cambio. Razón: lo
propio es del plan completo; contarlo haría que, con el plan vencido, el antibiótico de la mamá impidiera registrar la consulta
de su hijo. Lo mismo en `Update` (spec 051): la regla `active_treatment` solo mira consultas de hijos y solo aplica a consultas de
hijos.

**Alternativas**: un plan aparte para lo propio — no existe y el dueño decidió «solo plan completo».

## R5. La preferencia de compartir

**Decisión**: tabla `own_consultation_sharing (account_id PK → accounts, shared BOOLEAN NOT NULL, changed_at TIMESTAMPTZ NOT
NULL)`. Sin fila = apagado (FR-009). `PUT /accounts/{accountId}/consultation-sharing {shared}` (`ownsAccount`): encender bloquea
la fila de la cuenta y pide que la persona **pertenezca a una familia con plan de pago** (dueña de una familia `paid` con al
menos otro integrante activo, o integrante activo de una familia `paid`); si no, 422 `sharing_unavailable` (`reason: "no_family"`
o `"plan"`). Apagar siempre se puede (FR-013). Si después la familia deja de pagar, la regla de R3 no mira el plan: el acceso
sigue.

**Justificación**: una fila por persona, con cuándo cambió para auditoría (Supuestos); una tabla y no una columna en `accounts`
para no tocar las respuestas y el `SELECT` de la cuenta en todos lados.

## R6. Las rutas nuevas

Todas en `internal/server/router.go`, detrás de `RequireSession`, ninguna bajo `/child-device` (la lista cerrada de
`childdevice_router_test.go` no cambia):

| Ruta | Guarda | Qué |
|---|---|---|
| `GET /accounts/{accountId}/consultations` | `seesPerson` (Mark) | La lista de consultas propias (misma forma que la de un hijo) |
| `POST /accounts/{accountId}/consultations` | `fullPerson` (Full = ella) | Crear una consulta propia (mismo cuerpo que la de un hijo) |
| `GET /accounts/{accountId}/overview?from=&to=` | `seesPerson` | Tomas de hoy de sus medicamentos y su tratamiento activo (la forma de `GET /children/{id}/overview`, sin suplementos: los personales siguen en su ruta) |
| `POST /accounts/{accountId}/consultations/search` | `seesPerson` | Historial (spec 031), plan de la persona |
| `GET /accounts/{accountId}/history-options` | `seesPerson` | Doctores y medicamentos ya registrados |
| `POST /accounts/{accountId}/export` | `fullPerson` | Datos del PDF (spec 050) sin cartilla |
| `GET /accounts/{accountId}/appointments` / `POST` | `seesPerson` / `fullPerson` | Citas propias (spec 044 sin consulta) |
| `PUT /accounts/{accountId}/consultation-sharing` | `ownsAccount` | El interruptor (R5) |
| `PUT /consultations/{consultationId}/my-reminders` | `seesConsultation` | Los avisos de un Tutor sobre una consulta compartida (R7); 400 `not_shared` en una consulta de hijo o del propio dueño |

Las rutas que ya existen con `{consultationId}` (detalle, foto, marcar, editar, finalizar, recorrer, cita) **sirven igual** para
una consulta propia: el nivel ya lo decide `OnConsultation` (R3). `GET /accounts/{accountId}` sigue con `RequireOwner` (la
cuenta de otra persona no se lee entera): el perfil compartido se arma con las rutas de la tabla y con `GET /accounts/me`, que
gana `consultationSharing {shared, changedAt}` (lo propio) y `sharedProfiles [{accountId, firstName}]` (quienes me comparten).
`router_test.go` gana una fila por ruta para dueño, Tutor con y sin interruptor, Cuidador, integrante Hijo, quitado, extraño.

**Alternativa**: rutas `/me/consultations` sin `{accountId}`: no sirven al Tutor que mira el perfil de otra persona. Rechazada.

## R7. Recordatorios

**Decisión**: `medicationCandidates` (`reminder/candidates.go`) pasa a `LEFT JOIN children` con `owner_id = k.account_id`,
`child_id` nulo y el nombre a mostrar (`first_name`): el del hijo o, para una consulta propia, el de la cuenta dueña.
`ClaimDueDoses` reparte los pares (toma, persona) así:

- Consulta de hijo: igual que hoy.
- Consulta propia: el dueño siempre (si tiene dispositivo); y cada Tutor/dueña de familia con acceso **Mark según R3 y con una
  fila en `own_consultation_reminder_optins (consultation_id, account_id)`** (opt-in: sin fila no hay aviso, FR-015). Apagar el
  interruptor o salir de la familia quita el acceso y con él los avisos desde el siguiente ciclo, sin borrar las filas de
  opt-in (si se vuelve a encender, sus avisos vuelven como la persona los dejó).

El texto: para el dueño no se repite su nombre (`ChildFirstName` vacío, como una rutina personal); para un Tutor, el nombre de
pila del dueño. `ClaimDueChildDevices` une `child_device_links` por `child_id`: lo propio nunca entra. «Tomada» desde el aviso
(`MarkTakenByAction`): si la toma es de una consulta propia, se resuelve con `access.OfAccountOnConsultation` (Mark) y marca
como la cuenta del dispositivo.

**Alternativa**: reutilizar un «silenciado» como `supplement_muted` (opt-out). Rechazada: el dueño aprobó avisos del Tutor
apagados por omisión.

## R8. Frontend: el perfil

**Decisión**: ruta `/yo` → `ProfilePage`; para el perfil compartido de otra persona, `/personas/:accountId` (el mismo
componente con otro sujeto). `/mi-dia`, `/mis-suplementos`, `/mis-actividades` redirigen a `/yo` (con su ancla). La página sigue
el diseño del detalle del hijo (spec 056: `PageHeader`, «Hoy» primero, tratamiento y cita, `SectionIndex` Consultas ·
Suplementos · Actividades, «Lo demás», «Nueva consulta» único botón sólido) reutilizando `features/childDetail` con un
**sujeto** `{kind: 'child', childId} | {kind: 'person', accountId}` que decide las rutas del API y las direcciones de la app.
Lo que el perfil no tiene (cartilla, acceso del hijo) sale porque el sujeto lo dice. En el perfil compartido (Mark) solo se ven
consultas (sin suplementos ni actividades, FR-014), sin «Nueva consulta», sin editar, finalizar, recorrer ni PDF, con «Tus
avisos».

Las pantallas de consulta (`NewConsultationPage`, `ConsultationDetailPage`, `EditConsultationPage`), el historial y el panel del
PDF reciben el sujeto: las direcciones nuevas son `/yo/consultas/nueva`, `/yo/historial`; el detalle y la edición siguen en
`/consultations/:id` (el detalle trae `childId` nulo y `accountId`, y su «←» vuelve al perfil). «Tu día» (spec 055) suma las
tomas del día de `GET /accounts/{id}/overview`. Los textos nuevos en un solo archivo con prueba de redacción (Principio I).
Sube `CurrentDisclaimerVersion` y el texto del aviso «Antes de empezar».

**Alternativa**: dejar «Mi día» y agregarle consultas. El dueño eligió un perfil propio.

## R9. Pruebas

- **Backend contra la base real**, con y sin `pool_max_conns=4` (todo lo de una transacción en `tx`): acceso por rol con el
  interruptor apagado → encendido → apagado (dueño, Tutor, dueña de familia cuando el dueño es invitado, Cuidador, integrante
  Hijo, quitado, extraño, Tutor de otra familia); ninguna consulta propia en las rutas de hijos ni de `/child-device`; plan al
  crear, recorrer, buscar y exportar, y lo que no lo pide; avisos (dueño sí, Tutor solo con opt-in, ninguno sin acceso, ninguno
  al teléfono del hijo); la regla de la spec 030 ignora lo propio; fotos en el tope de la cuenta; `error_logs` sin textos.
- **Migración**: prueba de que una base con datos de la `0031` queda con `account_id` lleno y las llaves válidas.
- **Frontend** > 90 %: sujeto, perfil (dos diseños), perfil compartido, redirecciones, interruptor, «Tus avisos», «Tu día».
- **E2E** `consultas-del-titular.spec.ts` a 390 y 1280 px: crear y marcar lo propio, compartir con un Tutor, Cuidador sin
  acceso, apagar, plan gratuito.

**Aplicar la migración `0032` en DEV antes del merge** (lección del digest).
