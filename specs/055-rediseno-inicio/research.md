# Investigación: Rediseño del inicio (spec 055)

## R1 — ¿Un resumen del servidor para todos los hijos, o las consultas que ya existen?

**Decisión**: usar **las consultas que ya existen**, sin endpoint ni migración nuevos. Por hijo:
`GET /children/{childId}/overview?from=&to=` (tomas de medicamento **y** de suplemento del día local, `kind`, `status`,
`takenBy`) y `GET /children/{childId}/routines?kind=activity&from=&to=` (las actividades con sus tomas del día). Para «Tu día»:
`GET /accounts/{id}/routines?kind=supplement` y `?kind=activity` (las que ya usa `PersonalHomeBlock`).

**Justificación**:
- Hoy el inicio ya hace **2 peticiones por hijo** (`['consultations', id]` y `['overview', id, day]`, en `ChildStatusChips`).
  El rediseño quita «N consultas» (FR-004), así que cambia la de consultas por la de actividades: **el mismo número de
  peticiones**, en paralelo. SC-003 («no tarda más que hoy») se cumple sin servidor nuevo.
- Las mismas llaves de consulta que usa el detalle del hijo (`['overview', …]`, `['routines', childId, kind, day]`): el inicio
  y el detalle comparten caché, un «Marcar» en uno se ve en el otro.
- Los estados (`pending`/`due`/`taken`/`unregistered`/`canceled`) los decide ya el servidor (specs 013, 016, 024): el inicio
  solo cuenta (FR-007). El overview ya excluye «solo registro» y lo cancelado sale como `canceled`.
- Principio V (simplicidad): ninguna pieza nueva de backend que mantener.

**Alternativas consideradas**:
- `GET /accounts/me/today` que arme todo en una respuesta: menos peticiones con 10 hijos, pero duplica las reglas de acceso
  por hijo (`seesChild`, familias, Cuidador) en una consulta agregada, y una tabla nueva de pruebas de acceso. Se deja en el
  BACKLOG por si el E2E con 10 hijos muestra que hace falta.
- `useQueries` con una sola llave por hijo que junte overview + actividades: no se comparte caché con el detalle.

## R2 — ¿Cómo «Marcar» marca la próxima toma?

**Decisión**: la **próxima por marcar** es la toma más temprana de hoy con `status` `pending` o `due` entre las tomas de
medicamento y de suplemento del overview (las actividades tienen su propio «✓ Realizado» en el detalle, no en el pie; el
diseño solo pone tomas en el pie). «Marcar» reutiliza `useOverviewDoseToggle` (`consultations/useDoseToggle.ts`), que ya
marca una toma de medicamento (`PATCH /consultations/{cid}/doses/{id}`) o de suplemento (`PATCH /routines/{rid}/doses/{id}`)
según `kind`, con el mismo autor «por Ana» (spec 032) y las mismas invalidaciones.

**Justificación**: es exactamente lo que hace «Tomas de hoy» del detalle del hijo; una sola implementación de marcar.
Si dos personas marcan a la vez, el servidor deja la primera marca (spec 032) y el refetch muestra «por Ana».

**Después de marcar**: el pie muestra «✓ HH:MM» (la hora de la marca) hasta el siguiente refresco; luego pasa a la siguiente
por marcar o al estado «Todo marcado hasta ahora». Se puede desmarcar desde ahí (el mock lo alterna) solo si la marca es suya
o quien marca puede todo (`canUnmarkDose`).

**Alternativas**: marcar la próxima con un endpoint «marca la siguiente» como `POST /routines/{id}/done`: no existe para
medicamentos y no hace falta: el cliente ya sabe cuál es por su id.

## R3 — ¿Qué cuenta cada fila?

**Decisión** (funciones puras en `home/daySummary.ts`):
- **Medicamentos**: tomas `kind !== 'supplement'` del overview sin `canceled`: «N tomas hoy · M por marcar» (`pending`/`due`),
  «· K sin registrar» si hay (`unregistered`), «· M marcadas» en el estado todo marcado (como el mock).
- **Suplementos**: tomas `kind === 'supplement'`: «marcadas de total» («1 de 2»).
- **Actividades**: tomas de hoy de las rutinas `kind=activity` **activas** (`taken`): «hechas de total hechas» («2 de 5
  hechas»).
- **Estado de la tarjeta**: `sinreg` si hay alguna `unregistered`; si no, `pend` si hay `pending`/`due`; si no, `ok` si hay
  algo hoy; si no, `vacio`. Igual para el chip: «N por marcar» / «sin registrar».
- **Tu día**: «Mis tomas» = tomas de hoy de los suplementos personales («2 de 4 hoy», barra = marcadas/total, próxima = la
  primera sin marcar que no ha pasado); «Mis actividades» = las mismas reglas que `ActividadTarjeta` (`scheduleText.ts`:
  próxima, última).

**Justificación**: nada evalúa; son conteos de lo que ya se ve en el detalle (FR-007, Principio I).

## R4 — Textos y prueba de redacción

**Decisión**: `home/homeText.ts` con **todas** las frases nuevas (saludo, fecha, filas, chips, estados, «Lo demás», menú de
cuenta, «Solo lectura»), y `homeText.test.ts` que las recorre y falla con `debes`, `atras`, `falta`, `toca`, `%`, `felicid`,
`bien hecho`, `excelente`, `cuidado`, `alerta` (igual que `vaccineText.test.ts` y `editText.test.ts`). La pantalla del hijo
toma sus frases nuevas de `childDevice/childText.ts` (`PHONE`), que ya tiene su propia prueba.

## R5 — La fecha del saludo

**Decisión**: agregar `formatWeekdayLong(date)` en `shared/date.ts` («jueves 1 de noviembre»), con nombres fijos como el
resto (sin `Intl`, sin cambio de zona), y la fecha de `useLocalDay` (cambia a medianoche).

## R6 — Menú de las iniciales

**Decisión**: un botón con las iniciales (`aria-haspopup="menu"`, `aria-expanded`) que abre un panel pequeño con nombre, plan y
«Cerrar sesión»; Escape y clic fuera lo cierran y el foco vuelve al botón. En el teléfono va en `AppHeader`; en la web la
cuenta ya está en la barra lateral (el mock no dibuja menú en la web: «Cerrar sesión» queda en la franja de «Lo demás»).

## R7 — La pantalla «Hoy» del hijo (estado 7)

**Decisión**: rehacer la presentación de `childDevice/phone/ChildTodayPage.tsx` con el estado 7 (encabezado «Hola, Mateo» +
fecha, chip del día, «Tus tomas» con Mañana / Tarde / Noche usando `dayPeriods.groupByPeriod`, «Tus actividades» con
«✓ Realizado», «Avisos» al final). Mismos datos y mismas llamadas de `phone/api.ts` (overview y rutinas del hijo por
`/child-device/*`); **sin datos nuevos** (FR-013). La prueba de aislamiento (`isolation.test.ts`) prohíbe importar de
`features/home`: las piezas compartidas de la fila (icono + título + valor) van a `shared/ui/DayRow.tsx`.

## R8 — Esqueletos y fallas

**Decisión**: cada tarjeta (Tu día, cada hijo) maneja su propia carga: esqueleto de la altura final mientras su consulta está
`pending`, y si falla, una línea «No pudimos cargar el día de Mateo» con «Reintentar» dentro de la tarjeta (las demás
siguen). El inicio entero solo muestra esqueletos mientras se lee la cuenta (`/accounts/me`), que ya existe.

## R9 — Pruebas

- Unitarias: `daySummary.test.ts` (conteos y estados, canceladas fuera, sin registrar, actividades pausadas fuera),
  `homeText.test.ts`, `ChildDayCard.test.tsx` (cuatro estados, «Marcar» llama a la mutación correcta por `kind`, el resto
  navega), `TuDia.test.tsx` (con datos, todo marcado, vacío, plan gratuito), `HomePage.test.tsx` (orden, roles, solo
  lectura, menú, «Lo demás», ambos diseños con `stubMatchMedia`), `ChildTodayPage.test.tsx` (tres variantes). Cobertura >
  90 %.
- E2E `e2e/inicio.spec.ts` (Chromium, 390 y 1280 px): estado 1 con un hijo con medicamento + suplemento + actividad, marcar
  desde la tarjeta y verlo «por …» en el detalle; estado 3 (cuenta nueva); estado 4 (plan gratuito); estado 5 (Cuidador con
  dos sesiones); la pantalla del hijo (estado 7) en `hijo.spec.ts`. Los specs existentes que buscan «Tus hijos», «Cerrar
  sesión» en el encabezado o «N consultas» se ajustan.
- SC-003: un E2E con 10 hijos mide el tiempo hasta ver todas las tarjetas, antes y después.
