# Tareas: Rediseño del inicio — tu día y el de cada hijo

**Entrada**: `specs/055-rediseno-inicio/` (spec.md, plan.md, research.md R1–R9, data-model.md, contracts/ui.md,
quickstart.md) y el diseño `referencia/Inicio PediTrack.dc.html` (**manda** en estructura, textos, colores y medidas).

**Rama**: `feature/055-rediseno-inicio`. **Un commit por fase.** Solo frontend: sin migración ni API nueva.

**Reglas del repo**: archivos CRLF (editar con scripts de Python que preserven los finales de línea; los heredocs de bash se
rompen con apóstrofes: escribir con la herramienta de escritura); nunca correr Prettier; `npm run build` compila también las
pruebas; vitest con `--testTimeout=30000 --maxWorkers=4`; colores solo como tokens de `@theme` (`noColorLiterals.test.ts`);
dos diseños con `useIsDesktop`, nunca clases `lg:` que mezclen; overlays con `createPortal` + `useBodyScrollLock`.

**Pruebas**: obligatorias (Principio VI, > 90 %; E2E a 390 y 1280 px, Chromium).

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [x] T001 Medir el diseño: abrir `specs/055-rediseno-inicio/referencia/Inicio PediTrack.dc.html` en el navegador a 390 y
  1280 px y anotar en `specs/055-rediseno-inicio/referencia/medidas.md` por sección (saludo, «Tu día», tarjeta de hijo,
  filas, pie, «Lo demás», barra lateral, pantalla del hijo) tamaños de letra, pesos, márgenes, radios, bordes, alturas y
  colores (con `getComputedStyle` desde la consola o el navegador del panel)
- [x] T002 [P] Crear `specs/055-rediseno-inicio/referencia/desviaciones.md` con la tabla vacía (# · Qué · Diseño · App ·
  Motivo · Estado), para llenarla al construir
- [x] T003 [P] Comparar los colores del diseño con `@theme` de `frontend/src/index.css`: el diseño trae `--color-muted`
  `#475569` y `--color-skel` `#e2eef0`; si no existen como tokens, agregarlos a `index.css` y a
  `specs/005-identidad-visual-front-end/design-tokens.md` (nunca como `text-[#…]`)

**Commit**: «docs(055): medidas del diseño del inicio y tokens»

---

## Fase 2: Fundamental (bloquea todas las historias)

- [x] T004 [P] Agregar `formatWeekdayLong(date: Date)` → «jueves 1 de noviembre» (día de la semana y mes en minúsculas,
  nombres fijos, sin `Intl`, en hora local) en `frontend/src/shared/date.ts` y sus casos en `frontend/src/shared/date.test.ts`
  (los siete días, cambio de mes, 1 y 31)
- [x] T005 [P] Crear `frontend/src/features/home/homeText.ts` con **todas** las frases del inicio del diseño: saludo
  («Hola, {nombre}»), «Tu día», «Ver todo», «Mis tomas», «Mis actividades», «Próxima: {nombre} · {HH:MM}», «✓ Todo marcado
  hasta ahora», «Agrega tus propios suplementos o actividades», «Tu día · tus suplementos y actividades», «Plan completo»,
  «Tus hijos», «Hijos compartidos contigo», «{Familia} · puedes ver y marcar», las filas («Medicamentos», «Suplementos»,
  «Actividades») y sus valores («N tomas hoy · M por marcar», «· K sin registrar», «· M marcadas», «N de M», «N de M hechas»),
  los chips («N por marcar», «sin registrar»), «{nombre} · {HH:MM} · sin registrar», «Hoy no hay tomas ni actividades»,
  «Próxima», «Marcar», «Aún no registras a tus hijos», «Agrega a un hijo para registrar sus consultas, medicamentos y
  actividades.», «Agregar hijo», «+ Agregar hijo», «Tu plan incluye un hijo», «Familia», «Planes», «Recordatorios»,
  «Cerrar sesión», «Solo lectura. La familia no tiene un plan activo. Puedes seguir marcando tomas y actividades.», «No pudimos
  cargar el día de {nombre}», «Reintentar» (singular/plural con funciones, como `vaccineText.ts`)
- [x] T006 [P] Crear `frontend/src/features/home/homeText.test.ts` que recorra todas las frases de `homeText.ts` (con valores
  de ejemplo) y falle con `debes`, `atras`, `falta`, `toca`, `%`, `felicid`, `bien hecho`, `excelente`, `cuidado`, `alerta`,
  `no tomada` (Principio I, como `vaccineText.test.ts`)
- [x] T007 Crear `frontend/src/features/home/daySummary.ts` (funciones puras, `data-model.md`): `childDay(overview,
  activities)` → `ChildDay` { `medications: {total, toMark, unregistered, marked} | null` (tomas con `kind !== 'supplement'`
  y `status !== 'canceled'`), `supplements: {marked, total} | null` (`kind === 'supplement'`, sin canceladas), `activities:
  {done, total} | null` (tomas de hoy de rutinas `kind=activity` con `status === 'active'`), `next` (la toma de medicamento o
  suplemento más temprana con `status` `pending` o `due`), `state` (`sinreg` si `unregistered > 0`; si no `pend` si
  `toMark > 0`; si no `ok` si hay algo hoy; si no `vacio`), `unregisteredText` }; y `personalDay(supplements, activities,
  paidPlan)` → `PersonalDay` { `doses`, `activities` (con `next.routineId`), `allMarked`, `mode` `'card' | 'todo' | 'vacio' |
  'plan'` }. **Nunca** usa el reloj del teléfono para el estado de una toma (lo dice `status`)
- [x] T008 Crear `frontend/src/features/home/daySummary.test.ts`: cada estado, canceladas y «solo registro» fuera, sin
  registrar gana a por marcar, actividades pausadas o terminadas fuera, `next` elige la más temprana entre medicamento y
  suplemento, filas `null` cuando no hay nada, `personalDay` en sus cuatro modos
- [x] T009 [P] Crear `frontend/src/shared/ui/DayRow.tsx` (icono de medicamento / suplemento / actividad dibujado en SVG con
  `aria-hidden`, título y valor, medidas de `medidas.md`) y su prueba `DayRow.test.tsx`; vive en `shared/ui` porque la usan el
  inicio y la pantalla del hijo (`childDevice/isolation.test.ts` prohíbe que `phone/` importe de `features/home`)

**Punto de control**: `npx vitest run src/shared src/features/home` verde.
**Commit**: «feat(055): resumen del día, textos y fila compartida»

---

## Fase 3: Historia de Usuario 1 — El día de cada hijo y «Marcar» desde el inicio (P1) 🎯 MVP

**Objetivo**: cada tarjeta de hijo con sus filas del día y la próxima toma marcable en su pie.
**Prueba independiente**: un hijo con medicamento, suplemento y actividad hoy muestra las tres filas; «Marcar» la marca
(«por …» en el detalle) y el conteo cambia sin recargar.

- [x] T010 [US1] Crear `frontend/src/features/home/useChildDay.ts`: junta `['overview', childId, day.from.toISOString()]`
  (la misma llave y la misma función que el detalle del hijo) y `useRoutines(childId, 'activity', day)` con `useLocalDay()`,
  refresco cada 60 s (`DOSE_REFETCH_MS`), y devuelve `{ day: ChildDay | undefined, isPending, isError, refetch }`
- [x] T011 [US1] Crear `frontend/src/features/home/ChildDayCard.tsx` (contrato `contracts/ui.md`, medidas de `medidas.md`):
  un enlace a `/children/{id}` con inicial, nombre, «· edad» (`formatAgeLong`), el chip o «✓ Todo marcado hasta ahora» y «›»,
  las filas `DayRow` que no son `null`, el estado `vacio` («Hoy no hay tomas ni actividades», sin pie), el borde punteado y
  la línea de `sinreg`; y **fuera del enlace** el pie «Próxima» + «{nombre} · {HH:MM}» + «Marcar» (44 px, contorno,
  `aria-label` «Marcar {nombre} {HH:MM} de {hijo}») que llama `useOverviewDoseToggle` (`consultations/useDoseToggle.ts`, marca
  por consulta o por rutina según `kind`); ya marcada muestra «✓ HH:MM» con `aria-pressed="true"` y se desmarca solo si
  `canUnmarkDose`; dos variantes (`phone` / `desktop`) con las medidas de cada diseño
- [x] T012 [US1] Mientras `isPending`, `ChildDayCard` dibuja su esqueleto con la altura final (`bg-skel`); si `isError`, la
  línea «No pudimos cargar el día de {nombre}» + «Reintentar» dentro de la tarjeta (las demás siguen)
- [x] T013 [US1] Crear `frontend/src/features/home/ChildDayCard.test.tsx` (con `stubMatchMedia` para la web): los cuatro
  estados, filas que no aparecen, «Marcar» de un medicamento llama `PATCH /consultations/{cid}/doses/{id}` y de un suplemento
  `PATCH /routines/{rid}/doses/{id}`, el resto de la tarjeta navega, «✓ HH:MM» tras marcar, una marca ajena no se desmarca,
  esqueleto y falla con «Reintentar»
- [x] T014 [US1] Rehacer la sección de hijos de `frontend/src/features/home/HomePage.tsx` con el orden del diseño: título
  («Tus hijos», o «Hijos compartidos contigo» + «{Familia} · puedes ver y marcar» cuando todos los hijos son compartidos como
  Cuidador), una `ChildDayCard` por hijo (teléfono en columna; web en rejilla de 2 columnas), «+ Agregar hijo» punteado solo
  si `addChildTarget(account).allowed`, «Tu plan incluye un hijo» en el plan gratuito, la cuenta sin hijos («Aún no registras
  a tus hijos» + «Agregar hijo» sólido, el único sólido de la pantalla) y la nota «Solo lectura» arriba cuando algún hijo
  tiene `readOnly` (`useChildAccess`); conservar `AddChildDialogs`, el regreso a una invitación pendiente y los estados de
  error de la cuenta
- [x] T015 [US1] Borrar `frontend/src/features/home/ChildCard.tsx` (y su prueba) si ya nadie lo importa, junto con
  `ChildStatusChips`
- [x] T016 [US1] Actualizar `frontend/src/features/home/HomePage.test.tsx`: orden de las secciones, roles (dueña, Tutor,
  Cuidador, Tutor en solo lectura), plan gratuito, cuenta sin hijos, ambos diseños
- [x] T017 [US1] Crear `frontend/e2e/inicio.spec.ts` (Chromium, `designs` de `e2e/helpers.ts`, 390 y 1280 px): dueña con un
  hijo con medicamento + suplemento (`routineViaApi`) + actividad (`activityViaApi`) hoy → las tres filas; «Marcar» →
  «✓ HH:MM» y el detalle del hijo dice «por …»; un hijo con una toma sin registrar → borde punteado y «sin registrar»;
  plan gratuito con un hijo → «Tu plan incluye un hijo»; Cuidador con dos sesiones (`secondPerson`) → «Hijos compartidos
  contigo», sin «+ Agregar hijo», «Marcar» funciona
- [ ] T018 [US1] Ajustar los E2E que buscan «N consultas», «N tomas hoy» o «Sin tomas pendientes» en el inicio
  (`e2e/home-listado-hijos.spec.ts`, `e2e/tomas-sin-registrar.spec.ts`, `e2e/detalle-hijo-movil.spec.ts` y los que salgan de
  `grep -rn "tomas hoy\|Sin tomas pendientes\|consultas'" e2e`)

**Punto de control**: el inicio ya muestra el día de cada hijo y se marca desde él.
**Commit**: «feat(055): la tarjeta de cada hijo con su día y Marcar (US1)»

---

## Fase 4: Historia de Usuario 2 — «Tu día» primero (P2)

**Objetivo**: saludo con nombre y fecha y el resumen personal antes de los hijos.
**Prueba independiente**: con suplementos y actividades personales, «Tu día» va arriba con conteos y próxima, y
«✓ Realizado» marca sin salir.

- [x] T019 [P] [US2] Crear `frontend/src/features/home/Greeting.tsx`: «Hola, {nombre}», `formatWeekdayLong` de
  `useLocalDay().from` (cambia a medianoche) y el círculo de iniciales; en el teléfono sobre el fondo de la página (el diseño no tiene
  banda oscura: reemplaza el `AppHeader` «Tus hijos»), en la web como encabezado sin iniciales (la cuenta está en la barra)
- [x] T020 [US2] Crear `frontend/src/features/home/TuDia.tsx`: lee `usePersonalRoutines(account.id, 'supplement' |
  'activity', day)` y `personalDay(...)`; modo `card` (título «Tu día» + «Ver todo» a `/mis-suplementos`; «Mis tomas» con
  valor, `DayProgress` y próxima; «Mis actividades» con valor, próxima y `RealizadoButton` con contorno que llama
  `useMarkDone` de la actividad de la próxima toma → «✓ {nombre} · HH:MM»), `todo` («✓ Todo marcado hasta ahora»), `vacio`
  (enlace «Agrega tus propios suplementos o actividades» a `/mis-suplementos`, sin botón sólido), `plan` (línea «Tu día · tus
  suplementos y actividades» + marca «Plan completo» que abre `FreemiumLimitModal reason="supplements"`); en la web dos
  columnas; esqueleto de altura fija y falla con «Reintentar»; no dibuja nada si la cuenta no ha cargado
- [x] T021 [US2] Crear `frontend/src/features/home/TuDia.test.tsx`: los cuatro modos, «✓ Realizado» llama `POST
  /routines/{id}/done`, «Ver todo», el aviso del plan, ambos diseños
- [x] T022 [US2] Montar `Greeting` y `TuDia` en `frontend/src/features/home/HomePage.tsx` antes de la sección de hijos (después
  del aviso «Antes de empezar» y de la nota «Solo lectura»), y quitar `PersonalHomeBlock` del inicio; borrar
  `frontend/src/features/supplements/PersonalHomeBlock.tsx` (y su prueba) si ya nadie lo importa
- [x] T023 [US2] Agregar a `frontend/e2e/inicio.spec.ts`: dueña con un suplemento y una actividad personales
  (`personalRoutineViaApi`, `personalActivityViaApi`) → «Hola, …» y «Tu día» antes de los hijos, «✓ Realizado» marca; plan
  gratuito → la línea con «Plan completo» abre el aviso; ajustar `e2e/suplementos-personales.spec.ts` y `e2e/actividades.spec.ts`
  donde buscaban «Personal · Mis suplementos» en el inicio

**Commit**: «feat(055): Tu día con el resumen personal (US2)»

---

## Fase 5: Historia de Usuario 3 — «Lo demás» y la cuenta fuera del camino (P3)

**Objetivo**: Familia, Planes, Recordatorios y Cerrar sesión al final; «Cerrar sesión» fuera del encabezado.
**Prueba independiente**: el encabezado no tiene «Cerrar sesión»; la lista del final lleva a cada lugar y cierra sesión.

- [ ] T024 [US3] Crear `frontend/src/features/home/MoreLinks.tsx`: teléfono = filas de 52 px con valor a la derecha
  (Familia «N personas» / «Solo tú» / «{Familia} · cuidadora», Planes con `planStanding(account)`, Recordatorios
  «Activados» / «Desactivados» según `useReminders`, Cerrar sesión en `action`); web = franja de 4 accesos; un Cuidador sin
  Planes; Recordatorios lleva a la tarjeta de recordatorios (`RemindersCard`, que se conserva donde lo diga el diseño)
- [ ] T025 [US3] Agregar a `frontend/src/features/home/Greeting.tsx` el menú de la cuenta: el botón de las iniciales
  (`aria-haspopup="menu"`, `aria-expanded`) abre un panel con nombre, plan y «Cerrar sesión» (`useLogout`); Escape y clic fuera
  lo cierran y el foco vuelve al botón; con `createPortal` y `useBodyScrollLock` si se dibuja como overlay
- [ ] T026 [US3] En `frontend/src/features/home/HomePage.tsx`: quitar «Cerrar sesión» del encabezado (teléfono y web),
  reemplazar `FamilyEntry`, `PlanEntry` y la posición de `RemindersCard` por `MoreLinks` al final; borrar lo que quede sin uso
- [ ] T027 [P] [US3] Ajustar `frontend/src/features/home/ChildrenSidebar.tsx` a la barra lateral del diseño («Inicio», los
  hijos o el nombre de la familia para un Cuidador, «+ Agregar hijo», «Personal» con Mis suplementos y Mis actividades, la
  cuenta con su plan) y su prueba
- [ ] T028 [US3] Pruebas: `MoreLinks.test.tsx`, el menú en `Greeting.test.tsx` (abre, Escape, clic fuera, foco, cierra
  sesión) y `HomePage.test.tsx` (sin «Cerrar sesión» en el encabezado)
- [ ] T029 [US3] Ajustar los E2E que cierran sesión desde el encabezado o buscan «Tus hijos» como título
  (`e2e/autenticacion.spec.ts`, `e2e/account-signup.spec.ts`, `e2e/helpers.ts` y los de `grep -rn "Cerrar sesión\|Tus
  hijos" e2e`); agregar a `inicio.spec.ts` el menú y «Lo demás»

**Commit**: «feat(055): Lo demás y el menú de la cuenta (US3)»

---

## Fase 6: Historia de Usuario 4 — La pantalla «Hoy» del hijo (P3)

**Objetivo**: `/hijo/hoy` con el estado 7 del diseño, mismos datos.
**Prueba independiente**: las tres variantes (por marcar, todo marcado, sin nada) y marcar como hoy.

- [ ] T030 [P] [US4] Agregar a `frontend/src/features/childDevice/childText.ts` (`PHONE`) las frases nuevas del estado 7
  («Tus tomas», «{N} hoy · {M} por marcar», «Tus actividades», «{N} de {M} hechas», «✓ Todo marcado hasta ahora», «Hoy no
  tienes tomas ni actividades», «Avisos», «Te llega un aviso a la hora de cada toma.», «Activar», «✓ Activados») sin palabras
  que evalúan (su prueba de redacción las cubre)
- [ ] T031 [US4] Rehacer la presentación de `frontend/src/features/childDevice/phone/ChildTodayPage.tsx` con el estado 7:
  encabezado «Hola, {nombre}» + `formatWeekdayLong` + chip; «Tus tomas» agrupadas con `groupByPeriod`
  (`consultations/dayPeriods.ts`, si `isolation.test.ts` lo permite; si no, moverlo a `shared/`) con `DayRow` y «Marcar»;
  lo marcado por otra persona como texto «✓ por Ana, 08:05» (menta, sin botón); «Tus actividades» con «✓ Realizado»;
  «Avisos» al final (`RemindersCard` de `phone/`); vacío. **Mismas llamadas de `phone/api.ts`, sin datos nuevos**
- [ ] T032 [US4] Actualizar `frontend/src/features/childDevice/phone/ChildTodayPage.test.tsx` con las tres variantes y
  confirmar que `frontend/src/features/childDevice/isolation.test.ts` sigue verde
- [ ] T033 [US4] Ajustar `frontend/e2e/hijo.spec.ts` (390 y 1280 px) a los textos nuevos de `/hijo/hoy`

**Commit**: «feat(055): la pantalla Hoy del teléfono del hijo (US4)»

---

## Fase 7: Pulido y aspectos transversales

- [ ] T034 Esqueleto de toda la pantalla mientras carga la cuenta (`frontend/src/features/home/HomeSkeleton.tsx`, estado 6:
  la altura de «Tu día» y de dos tarjetas) en vez de «Cargando…»; prueba de que el esqueleto y la pantalla con datos ponen
  «Tu día» y la primera tarjeta en la misma posición (SC-004, ±4 px, medido en E2E con `boundingBox`)
- [ ] T035 SC-003: en `frontend/e2e/inicio.spec.ts`, una cuenta con 10 hijos (plan de pago) mide el tiempo hasta ver las 10
  tarjetas con datos; correr la misma medida en `develop` y anotar ambas en `research.md` R1 (si es más lento, abrir la
  entrada del BACKLOG «Resumen del día de todos los hijos en una sola respuesta»)
- [ ] T036 Comparar lado a lado el diseño y la app a 390 y 1280 px, sección por sección y estado por estado (1–7 y solo
  lectura), con el navegador del panel; corregir lo que se pueda y anotar el resto en
  `specs/055-rediseno-inicio/referencia/desviaciones.md` con su motivo
- [ ] T037 [P] Documentar: entrada de la spec 055 en `CLAUDE.md` (raíz) como implementada; `frontend/CLAUDE.md` (sección de
  `features/home/`: `HomePage`, `Greeting`, `TuDia`, `ChildDayCard`, `useChildDay`, `daySummary`, `homeText`, `MoreLinks`,
  `HomeSkeleton`; quitar `ChildCard`/`PersonalHomeBlock`/`FamilyEntry`/`PlanEntry` si se borraron; `shared/ui/DayRow`;
  `formatWeekdayLong`; la pantalla del hijo); estado de `spec.md` → «Implementada»
- [ ] T038 Verificación completa: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run --coverage --testTimeout=30000
  --maxWorkers=4` (> 90 %), `npm run build`, `npx playwright test --list` (y `npx playwright test e2e/inicio.spec.ts
  e2e/hijo.spec.ts --project=chromium` si `VITE_CLERK_PUBLISHABLE_KEY` está en el equipo; si no, las corre el CI)
- [ ] T039 `/code-review` del diff de la rama y aplicar lo que salga
- [ ] T040 Push y PR a `develop` **solo cuando el dueño lo pida**

**Commit**: «feat(055): esqueletos, medidas, desviaciones y docs»

---

## Dependencias

- **Fase 1 → Fase 2 → historias.** La Fase 2 (resumen, textos, `DayRow`, fecha) bloquea a todas.
- **US1 (Fase 3)** es el MVP y no depende de otras historias.
- **US2 (Fase 4)** depende de la Fase 2; toca `HomePage.tsx` después de US1 (mismo archivo: en serie).
- **US3 (Fase 5)** usa `Greeting` de US2 (el menú vive ahí): después de US2.
- **US4 (Fase 6)** solo depende de la Fase 2 (`DayRow`, `formatWeekdayLong`): puede ir en paralelo con US1–US3.
- **Fase 7** al final.

## Ejecución en paralelo

- Fase 1: T002 y T003 junto con T001.
- Fase 2: T004, T005, T006 y T009 a la vez; T007 → T008.
- US2: T019 en paralelo con T020/T021 (archivos distintos).
- US3: T027 en paralelo con T024–T026.
- US4 entera en paralelo con US1–US3 (otros archivos: `childDevice/`).

## Estrategia

1. **MVP = Fases 1–3**: el día de cada hijo y «Marcar» desde el inicio ya cambia el uso diario; se puede mostrar al dueño.
2. Luego US2 («Tu día» primero, lo que pidió el dueño), US3 (orden y «Cerrar sesión») y US4 (la pantalla del hijo).
3. Cerrar con la comparación contra el diseño, `desviaciones.md` y la verificación completa antes de pedir el PR.
