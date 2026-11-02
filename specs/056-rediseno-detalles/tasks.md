# Tareas: Rediseño de las pantallas de detalle

**Entrada**: `specs/056-rediseno-detalles/` (spec.md, plan.md, research.md R1–R9, data-model.md, contracts/ui.md,
quickstart.md), los diseños de `referencia/` y el del encabezado en Claude Design (`referencia/encabezado-medidas.md`).
Los diseños **mandan** en estructura, textos, colores y medidas.

**Rama**: `feature/056-rediseno-detalles` (sale de la 055). **Un commit por fase.** Solo frontend: sin migración ni API.

**Reglas del repo**: archivos CRLF (editar con scripts de Python que preserven los finales de línea; los heredocs de bash se
rompen con apóstrofes: escribir los scripts con la herramienta de escritura); nunca Prettier; colores solo como tokens
(`noColorLiterals.test.ts`); dos diseños con `useIsDesktop`; overlays con `createPortal` + `useBodyScrollLock`; alto de línea
`leading-[normal]` y tamaños exactos (`text-[14px]`…) como los diseños (lección de la 055); vitest con
`--testTimeout=30000 --maxWorkers=4`.

**Pruebas**: obligatorias (Principio VI, > 90 %; E2E a 390 y 1280 px, Chromium).

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [x] T001 Medir los diseños: servir `referencia/Detalle y Mi día PediTrack.dc.html` y `referencia/Detalle de la consulta
  PediTrack.dc.html` con su `support.js` (arnés temporal en `frontend/h`, como en la 055) y leer `Encabezado PediTrack.dc.html`
  con DesignSync; anotar en `specs/056-rediseno-detalles/referencia/medidas.md` por pantalla y estado las posiciones, tamaños,
  radios y colores de cada sección (teléfono 390 y web 1280)
- [x] T002 [P] Crear `specs/056-rediseno-detalles/referencia/desviaciones.md` con la tabla vacía y la fila de FR-018 («programada»
  se puede marcar, decisión del dueño)
- [x] T003 [P] Comparar los colores de los diseños con `@theme` (`frontend/src/index.css`): si aparece uno nuevo, agregarlo como
  token y en `specs/005-identidad-visual-front-end/design-tokens.md`

**Commit**: «docs(056): medidas de los diseños y desviaciones»

---

## Fase 2: Fundamental (bloquea todas las historias)

- [x] T004 [P] Crear `frontend/src/shared/ui/pageHeaderText.ts` (+ `pageHeaderText.test.ts` con las palabras prohibidas de
  `homeText.test.ts`): «Cargando», «No pudimos cargar {qué}», «Revisa tu conexión. Lo que ya registraste está guardado.»,
  «Reintentar», «Solo lectura.» y su resto, «Solo tú ves esto»
- [x] T005 Crear `frontend/src/shared/ui/PageHeader.tsx` (research R2, medidas de `encabezado-medidas.md`): props `variant`
  (`phone`/`desktop`), `back: { label, to }`, `eyebrow?`, `title`, `subtitle?`, `chip?: { label, tone: 'hint' | 'line' }`,
  `actions?`, `readOnly?`, `search?`, `state?: 'ready' | 'loading' | 'error'`, `errorWhat?`, `onRetry?`; teléfono sin banda,
  `padding-top: env(safe-area-inset-top)`, `px-5 pb-4`, título 28/900 `leading-[1.15]` `[text-wrap:balance]`
  `[overflow-wrap:break-word]`, acciones bajo el título (`mt-2.5 gap-2`); web título 34/900 y acciones a la derecha; «← …»
  enlace de 44 px que funciona también al cargar y con error; `search` con `sticky top-0` en el teléfono; exportar
  `pageHeaderButton(kind: 'primary' | 'secondary' | 'edit', variant)` con las clases del diseño (primaria `confirmed` 48/52 px
  radio 16, secundaria contorno 48 px radio 16, «Editar» contorno 44 px radio 14)
- [x] T006 Crear `frontend/src/shared/ui/PageHeader.test.tsx`: H1–H10 en ambos diseños (un solo `h1`, sin `bg-ink`, acciones
  bajo/derecha, chip `hint`/`line`, «Solo lectura», búsqueda, esqueleto `role=status` con «← …» funcionando, error
  `role=alert` con «Reintentar» que llama `onRetry`, título largo)
- [x] T007 [P] Crear `frontend/src/shared/ui/StickyActionBar.tsx` (+ test): en el teléfono una barra `sticky bottom-0` dentro del
  formulario con fondo `canvas`, borde superior `hint-edge`, `padding-bottom: calc(1.625rem + env(safe-area-inset-bottom))` y el
  botón a todo lo ancho (52 px); en la web solo el contenido, al final, sin barra (research R3)
- [x] T008 [P] Crear `frontend/src/shared/ui/SectionIndex.tsx` (+ test): `nav aria-label="Secciones"` con pastillas de enlaces a
  `#id`, `sticky top-0` en el teléfono, `scrollIntoView` (suave salvo `prefers-reduced-motion`), `aria-current` en la sección
  visible con `IntersectionObserver` (sin él, la primera), solo las secciones que se le pasan (research R4)
- [x] T009 Cambiar por dentro `RoutinePageFrame` (`frontend/src/features/supplements/RoutineFormPage.tsx`) para que use
  `PageHeader`, sumando props opcionales `subtitle`, `chip`, `actions`, `readOnly`, `state`; las 7 pantallas que lo usan siguen
  compilando sin cambios; ajustar sus pruebas que buscaban la banda
- [x] T010 Borrar `frontend/src/shared/ui/AppHeader.tsx` (y su prueba si existe): no lo usa nadie desde la spec 055

**Punto de control**: `npx vitest run src/shared src/features/supplements` verde.
**Commit**: «feat(056): encabezado común, barra de guardar e índice de secciones»

---

## Fase 3: Historia de Usuario 2 — El encabezado común en las pantallas secundarias (P1)

**Objetivo**: ninguna pantalla de FR-010 conserva la banda oscura en el teléfono.
**Prueba independiente**: las pantallas de FR-010 usan `PageHeader` en sus variantes a 390 y 1280 px.

- [x] T011 [US2] En el detalle de suplemento/actividad (`frontend/src/features/supplements/RoutineDetailPage.tsx`) pasar a
  `RoutinePageFrame` la variante H2: línea superior «Suplemento de Mateo» / «Actividad de Mateo», subtítulo de frecuencia, chip
  de estado (`hint` para «Activo», `line` para «Pausado»/«Terminado») y «Editar» con contorno en el encabezado
- [x] T012 [P] [US2] Cartilla (`frontend/src/features/vaccinations/VaccinationCardPage.tsx`): H3 con línea superior «Cartilla de
  Mateo», subtítulo «N dosis registradas · N fotos», «+ Agregar vacuna» sólido y «Exportar a PDF» con contorno en el encabezado
  (el `ExportEntry` actual se mueve ahí); H6 con «Solo lectura»
- [x] T013 [P] [US2] Familia (`frontend/src/features/family/FamilyPage.tsx`): H1 con `PageHeader` («← Inicio», «Familia»,
  subtítulo «Familia de Ana · N personas») en lugar de su banda y su contador en tinta
- [x] T014 [P] [US2] Historial (`frontend/src/features/consultations/HistoryPage.tsx`): H7 («← Mateo», «Historial de Mateo»,
  subtítulo con el número de consultas, el campo de búsqueda como `search` pegado arriba)
- [x] T015 [US2] Formularios: `RoutineForm` (`frontend/src/features/supplements/RoutineForm.tsx`), el de citas
  (`frontend/src/features/appointments/AppointmentFormPage.tsx`) y el de consulta (`frontend/src/features/consultations/
  ConsultationForm.tsx`, con `NewConsultationPage.tsx` y `EditConsultationPage.tsx`): H4 («← Cancelar», título, «Para Mateo»)
  y el botón de guardar dentro de `StickyActionBar`; el de consulta pierde su banda propia
- [x] T016 [P] [US2] Planes y regreso del pago (`frontend/src/features/plans/PlansPage.tsx`, `PaymentReturnPage.tsx`) y el
  historial de citas (`frontend/src/features/appointments/AppointmentHistoryPage.tsx`): revisar que con `RoutinePageFrame` nuevo
  quedan como H1/H2 del diseño
- [x] T017 [US2] Ajustar las pruebas unitarias y los E2E que buscaban la banda o los títulos viejos de esas pantallas
  (`grep -rn "bg-ink\|level: 1" e2e src --include=*.ts*` en lo que toque) y agregar a cada pantalla una prueba del encabezado

**Commit**: «feat(056): el encabezado común en las pantallas secundarias (US2)»

---

## Fase 4: Historia de Usuario 1 — El detalle del hijo abre con su día (P1) 🎯 MVP visible

**Objetivo**: «Hoy» primero, índice de secciones, «Nueva consulta» como único sólido, «Lo demás» al final.
**Prueba independiente**: se marca desde «Hoy» sin bajar la pantalla; el índice salta a cada sección; las tomas no se repiten.

- [x] T018 [P] [US1] Crear `frontend/src/features/childDetail/childDetailText.ts` (+ prueba de redacción) con las frases del
  diseño («Hoy», «Hoy no hay tomas ni actividades», «Tratamiento activo», «termina el …», «Consultas», «Suplementos»,
  «Actividades», «Cartilla», «Lo demás», «Acceso del hijo», «Familia que lo ve», «Nueva consulta», «nació el …»)
- [x] T019 [US1] Crear `frontend/src/features/childDetail/ChildTodayCard.tsx` (research R5): con `useChildDay` y `childDay` de la
  055, el chip del día, las tomas de medicamento y suplemento por `groupByPeriod` con el chip de toma (`DoseChipView`) y las
  actividades activas con «N de M hechas», la próxima y `RealizadoButton`; esqueleto y falla con «Reintentar»; ambos diseños
- [x] T020 [US1] Rehacer `frontend/src/features/consultations/ChildDetailPage.tsx` con el orden del diseño: `PageHeader`
  («← Inicio», avatar, nombre, «edad · nació el …») → `ChildTodayCard` → tratamiento activo (compacto) → próxima cita →
  `SectionIndex` (Consultas · Suplementos · Actividades · Cartilla: solo las que existen) → secciones con `id` (Consultas con
  «Buscar en el historial» y «Exportar a PDF»; Suplementos y Actividades como filas compactas sin tomas; Cartilla) → «Lo demás»
  (Acceso del hijo, Familia que lo ve) ; «Nueva consulta» en `StickyActionBar` en el teléfono y arriba a la derecha en la web;
  web en dos columnas con tratamiento, cita y resumen del día fijos a la derecha; sin «Consultas: N desde»
- [x] T021 [US1] Filas compactas de Suplementos y Actividades para el detalle del hijo (nombre, frecuencia, estado neutro, «›»
  al detalle; «+ Agregar …» o el aviso compacto del plan) en `frontend/src/features/supplements/RegistroSeccion.tsx` (variante
  `compact`)
- [x] T022 [US1] Pruebas de `ChildTodayCard`, `ChildDetailPage` (orden, roles: dueña, Tutor, Cuidador, solo lectura, plan
  gratuito; ambos diseños; hijo recién agregado sin secciones vacías)
- [x] T023 [US1] E2E `frontend/e2e/detalle-hijo.spec.ts` (Chromium, 390 y 1280 px): «Hoy» primero y marcar sin scroll, índice
  salta a Cartilla, Cuidador sin «Nueva consulta»; ajustar `detalle-hijo-movil.spec.ts` y los que buscaban «Tomas de hoy» del
  bloque viejo o «Consultas: N desde»

**Commit**: «feat(056): el detalle del hijo abre con su día (US1)»

---

## Fase 5: Historia de Usuario 3 — El detalle de la consulta: tratamiento primero (P2)

**Objetivo**: calendario y medicamentos primero; semana en el teléfono; candado y «programada»; datos plegables.
**Prueba independiente**: en el teléfono la primera tarjeta bajo el encabezado es el tratamiento.

- [x] T024 [P] [US3] `frontend/src/features/consultations/treatmentDays.ts`: `weekOf(day)` (lunes a domingo) y el paso de semana
  dentro del rango del tratamiento (+ pruebas)
- [x] T025 [US3] `frontend/src/features/consultations/TreatmentCalendar.tsx`: `mode: 'week' | 'month'` con «Ver mes» / «Ver
  semana» (`aria-expanded`), el teléfono empieza en semana y la web siempre en mes; mismas celdas, puntos y aro de hoy (+ pruebas)
- [x] T026 [US3] `frontend/src/features/consultations/DoseChip.tsx` (research R7): candado (SVG `aria-hidden`) y «✓ HH:MM · por
  Nombre» en una marca ajena (botón deshabilitado, nombre fijo, `aria-pressed`); «programada» para una toma `pending` de un día
  posterior a hoy, **marcable** (FR-018) (+ pruebas)
- [x] T027 [P] [US3] Crear `frontend/src/features/consultations/consultationDetailText.ts` (+ prueba de redacción): «Tratamiento»,
  «En curso · termina el …», «Terminado el …», «Datos de la consulta», el resumen «Foto · N síntomas · notas», «programada»,
  «Ver mes», «Ver semana»
- [x] T028 [US3] Rehacer `frontend/src/features/consultations/ConsultationDetailPage.tsx`: `PageHeader` (fecha, doctor, «Solo
  registro», «Editada el … por …», «Editar consulta» con contorno) → tratamiento (resumen, calendario, tarjetas de medicamento) →
  próxima cita → «Datos de la consulta» en `<details>` (cerrado en el teléfono con su resumen; abierto en la web y en solo
  registro); web en dos columnas con «Nueva consulta» como único sólido; el teléfono sin sólido
- [x] T029 [US3] Pruebas de la página (orden, solo registro, Cuidador, otro día con cancelada, terminado y recorrido, cargando,
  error) y E2E: ampliar `frontend/e2e/detalle-consulta-movil.spec.ts` y `detalle-consulta-web.spec.ts` (tratamiento primero,
  semana/mes, «programada» se marca, datos plegados); ajustar los que dependían del orden viejo

**Commit**: «feat(056): el detalle de la consulta con el tratamiento primero (US3)»

---

## Fase 6: Historia de Usuario 4 — «Mi día» (P3)

**Objetivo**: una sola página personal en `/mi-dia`.
**Prueba independiente**: «Ver todo» lleva a «Mi día»; se marca y se crea desde ahí; las direcciones viejas redirigen.

- [x] T030 [P] [US4] Crear `frontend/src/features/supplements/myDayText.ts` (+ prueba de redacción): «Mi día», «Solo tú ves
  esto», «Agregar mi primer suplemento», «Agregar una actividad», «Cómo funcionan»
- [x] T031 [US4] Crear `frontend/src/features/supplements/MyDayPage.tsx` (research R8): `PageHeader` H5 → «Hoy» (tomas por
  Mañana / Tarde / Noche y actividades, con los datos de `usePersonalRoutines`) → `SectionIndex` (Suplementos · Actividades) →
  `MisRegistroSeccion` de cada tipo; sin nada creado, «Agregar mi primer suplemento» sólido dentro de «Hoy» y la actividad con
  contorno; «Cómo funcionan» como enlace después de la primera vez; ambos diseños (+ pruebas)
- [x] T032 [US4] `frontend/src/App.tsx`: ruta `/mi-dia`; `/mis-suplementos` y `/mis-actividades` → `<Navigate to="/mi-dia#…"
  replace />`; el «← …» de una rutina personal dice «← Mi día» (`RoutineDetailPage`, `RoutineFormPage`); «Ver todo» de
  `frontend/src/features/home/TuDia.tsx` y la entrada única «Mi día» de `ChildrenSidebar.tsx`; retirar `PersonalRoutinesPage.tsx`
  si queda sin uso
- [x] T033 [US4] E2E `frontend/e2e/mi-dia.spec.ts` (Chromium, 390 y 1280 px) y ajustar `suplementos-personales.spec.ts`,
  `actividades.spec.ts` e `inicio.spec.ts` a «Mi día»

**Commit**: «feat(056): Mi día (US4)»

---

## Fase 7: Pulido

- [x] T034 Medir lado a lado cada pantalla y estado contra su diseño a 390 y 1280 px con el arnés; corregir lo que se pueda y
  anotar el resto en `specs/056-rediseno-detalles/referencia/desviaciones.md`; comprobar SC-001 (marcar sin scroll a 390 × 844)
- [x] T035 [P] Documentar: entrada de la spec 056 en `CLAUDE.md`; `frontend/CLAUDE.md` (`PageHeader`, `StickyActionBar`,
  `SectionIndex`, `childDetail/`, «Mi día», el detalle de la consulta, las rutas; quitar `AppHeader` y `PersonalRoutinesPage`);
  estado de `spec.md` → «Implementada»
- [ ] T036 Verificación completa: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run --coverage --testTimeout=30000
  --maxWorkers=4` (> 90 %), `npm run build`, `npx playwright test --list`
- [ ] T037 `/code-review` del diff de la rama (de verdad, con la skill) y aplicar lo que salga
- [ ] T038 Push y PR a `develop` **solo cuando el dueño lo pida** (después de fusionar la 055, rebasar sobre `develop`)

**Commit**: «feat(056): medidas, desviaciones y docs»

---

## Dependencias

- **Fase 1 → Fase 2 → historias.** La Fase 2 (`PageHeader`, `StickyActionBar`, `SectionIndex`, `RoutinePageFrame`) bloquea a
  todas.
- **US2 (Fase 3)** va primero: cambia de golpe ~12 pantallas y deja probada la pieza que usan las demás.
- **US1 (Fase 4)** y **US3 (Fase 5)** tocan archivos distintos y pueden ir en paralelo después de la Fase 2.
- **US4 (Fase 6)** solo depende de la Fase 2 (y de `TuDia`/`ChildrenSidebar` de la 055).
- **Fase 7** al final.

## Ejecución en paralelo

- Fase 2: T004, T007 y T008 a la vez; T005 → T006 → T009.
- US2: T012, T013, T014 y T016 a la vez (archivos distintos); T011 y T015 en serie.
- US1 y US3 en paralelo entre sí; dentro de US3, T024 y T027 a la vez.
- US4 en paralelo con US1/US3.

## Estrategia

1. **Fases 1–3**: el encabezado común ya cambia la cara de casi toda la app; se puede mostrar al dueño.
2. **Fase 4** (detalle del hijo) es lo más usado después del inicio; luego la consulta (Fase 5) y «Mi día» (Fase 6).
3. Cerrar midiendo contra los diseños, con `desviaciones.md`, la verificación completa y `/code-review` antes de pedir el PR.
