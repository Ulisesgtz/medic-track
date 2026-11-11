# Tareas: Marcado inmediato de tomas y confirmaciones propias

**Entrada**: `specs/066-marcado-inmediato-confirmaciones/` (spec.md, plan.md, research.md R1–R13, data-model.md, contracts/ui.md, quickstart.md). Sin mock.

**Pruebas**: obligatorias (constitución, Principio VI: Vitest > 90 % y E2E a 390 y 1280 px).

**Estado (2026-11-11)**: implementado. Las E2E (T022, T028, T040, T041) corrieron en local en verde: las 18 nuevas en Chromium y las 3 cambiadas en los tres navegadores (54). T043: capturas del aviso y del diálogo a 390 y 1280 px.

**Rama**: `feature/066-marcado-inmediato-confirmaciones`, con un commit por fase (solo cuando el dueño lo pida).

**Reglas que valen para todas las tareas**:
- Solo `frontend/`. Ningún archivo de `backend/` cambia.
- Archivos CRLF: se editan conservando los finales de línea.
- Vitest con `--testTimeout=30000 --maxWorkers=4`.
- Colores solo por tokens de `@theme` (`noColorLiterals.test.ts`).
- Dos diseños con `useIsDesktop` que nunca se mezclan.
- Los textos nuevos van en `shared/marks/markText.ts` y en el archivo de textos de cada funcionalidad, nunca sueltos en un componente.
- Ningún texto evalúa ni aconseja (Principio I); sin rojo ni la palabra «error» en el aviso de la marca.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Listar los lugares exactos por tocar y anotarlos como comentario al inicio de la rama de trabajo (no se guarda en el repositorio): `grep -rn "queryKey: \['\(consultation\|overview\|routines\|routine\)'" frontend/src` y `grep -rn "phoneKey(" frontend/src` (lecturas de tomas); `grep -rn "window.confirm" frontend/src` (deben salir 11); `grep -rln "ConfirmDialog" frontend/src` (12 importadores más el propio archivo); `grep -rln "page.on('dialog'\|page.once('dialog'" frontend/e2e` (4 archivos). Si un conteo no coincide con research R1, R9, R10 y R12, corregir primero esos documentos.

---

## Fase 2: Fundamental (bloquea las historias 1 y 2)

Todo en `frontend/src/shared/marks/`, sin conectar a ninguna pantalla todavía.

- [X] T002 [P] Crear `frontend/src/shared/marks/pendingMarks.ts` (data-model «Marca por confirmar»): un mapa en memoria `doseId → { taken: boolean, since: number, inFlight: boolean, sent: boolean | null }`, con `setDesired(doseId, taken, now)`, `get(doseId)`, `clear(doseId)`, `snapshot()` (misma referencia mientras nada cambie), `subscribe(listener)` y `resetPendingMarks()` para las pruebas. A lo más una entrada por toma. Nada se escribe en `localStorage`. Pruebas en `pendingMarks.test.ts`.
- [X] T003 [P] Crear `frontend/src/shared/marks/applyPendingMarks.ts`, puro (research R3 y R4, tabla «Toma mostrada» de data-model): `applyPendingMarks<T>(data: T, marks): T` recorre cualquier valor y, en todo objeto con `id`, `scheduledAt` y `taken` cuya `id` tenga marca por confirmar, devuelve una copia con: marcar → `taken: true`, `status: 'taken'`, `takenBy: null` y `pendingAt: since`; quitar → `taken: false`, `status: 'pending'`, `takenBy: null`. Con el registro vacío devuelve **el mismo objeto** (sin copiar). No lee el reloj. Pruebas en `applyPendingMarks.test.ts` con las cinco formas de dato: detalle de la consulta (`medications[].doses[]`), resumen (`doses[]`), lista de rutinas (`routines[].doses[]`), una rutina y los datos del teléfono del hijo.
- [X] T004 [P] Crear `frontend/src/shared/marks/writeDoseToCaches.ts` (research R6): `writeDoseToCaches(queryClient, dose)` reemplaza por `id` los campos `taken`, `status` y `takenBy` de esa toma en toda consulta en caché cuya primera llave sea `consultation`, `overview`, `routines`, `routine` o `child-device`, con `setQueriesData`; lo demás de cada toma se conserva. Pruebas en `writeDoseToCaches.test.ts`.
- [X] T005 [P] Crear `frontend/src/shared/marks/markText.ts` con los textos, palabra por palabra, de la tabla de research R7 (funciones `notSaved(name, time)`, `notUnmarked(name, time)`, `markedByOther(by, name, time)`, `notYours`, `gone`, `andMore(n)`), más `SAVING = 'guardando…'` y `CLOSE = 'Cerrar'`. Prueba de redacción en `markText.test.ts`: ningún texto contiene «error», «olvid», «atras», «debes», «dosis», «peligro» ni «urgente».
- [X] T006 [P] Crear `frontend/src/shared/marks/markNotices.ts` (data-model «Aviso de marca»): un registro en memoria de avisos `{ doseId, kind: 'not_saved' | 'not_unmarked' | 'marked_by_other' | 'not_yours' | 'gone', name, time, by? }`, uno por toma (el nuevo reemplaza al anterior), con `push`, `dismiss(doseId)`, `dismissAll()`, `snapshot()`, `subscribe` y `resetMarkNotices()`. Pruebas en `markNotices.test.ts`.
- [X] T007 Crear `frontend/src/shared/marks/requestMark.ts` (research R5; depende de T002, T004 y T006): `requestMark({ queryClient, dose: { id, name, time }, taken, send, invalidate })` donde `send(taken)` devuelve la toma del servidor. Pasos: (1) `setDesired`; (2) si ya hay petición en camino para esa toma, termina; (3) manda `send(desired)`; (4) si responde bien: `writeDoseToCaches`, `dismiss(doseId)` y, si el deseado cambió entretanto, vuelve a (3); si no, `clear(doseId)` y `invalidate()`; (5) si falla: `clear(doseId)`, `invalidate()` y devuelve el error a quien llamó (el aviso se conecta en la historia 2). Nunca hay dos peticiones en camino para la misma toma. Pruebas en `requestMark.test.ts`: un toque; marcar-quitar-marcar rápido termina en marcada con a lo más dos peticiones; dos tomas distintas van en paralelo; una falla limpia el registro.
- [X] T008 [P] Crear `frontend/src/shared/marks/usePendingMarks.ts` con dos hooks sobre `useSyncExternalStore`: `useShown<T>(data: T | undefined): T | undefined` (aplica `applyPendingMarks` con `useMemo`) y `usePendingMark(doseId): { pending: boolean, slow: boolean }`, donde `slow` pasa a `true` a los 2 000 ms de `since` (FR-007) con un temporizador que se limpia al desmontar. Pruebas en `usePendingMarks.test.tsx` con temporizadores falsos.

**Punto de control**: `npx vitest run src/shared/marks` en verde y con más del 90 %. Nada cambia en pantalla.

---

## Fase 3: Historia de Usuario 1 — La toma se ve marcada en cuanto la toco (P1) 🎯 MVP

**Objetivo**: marcar, quitar una marca y «Realizado» cambian la pantalla al instante en todas las pantallas, y al responder el servidor queda su autor y su hora.

**Prueba independiente**: con la respuesta retrasada 3 s, tocar «Marcar»: la toma cambia de inmediato, a los 2 s dice «guardando…» y al llegar la respuesta dice «✓ HH:MM · por <nombre>».

### Lecturas: que toda pantalla vea el registro

- [X] T009 [US1] Pasar por `useShown` los datos de cada `useQuery` con llave `consultation` y `overview` de `frontend/src/features/consultations/` (`ConsultationDetailPage.tsx`, `ChildDetailPage.tsx` y los que salgan en T001), `frontend/src/features/home/useChildDay.ts` y `frontend/src/features/profile/hooks.ts` (`usePersonOverview`) y las páginas de `features/profile/` que lean una consulta. El resto de cada componente no cambia.
- [X] T010 [P] [US1] Pasar por `useShown` los datos de `useRoutines`, `usePersonalRoutines` y `useRoutine` en `frontend/src/features/supplements/hooks.ts`.
- [X] T011 [P] [US1] Pasar por `useShown` los datos de `useOverview` y `useActivities` en `frontend/src/features/childDevice/phone/hooks.ts`.

### Mutaciones: que cada toque pase por `requestMark`

- [X] T012 [US1] Cambiar `useDoseToggle` y `useOverviewDoseToggle` en `frontend/src/features/consultations/useDoseToggle.ts`: `mutate(taken)` llama a `requestMark` con el `send` de hoy (`updateDoseStatus` o `updateRoutineDose`) y el `invalidate` de hoy (las mismas llaves). Conservan la forma que usan los componentes (`mutate`, y `onSuccess` por llamada para `ChildDayCard`). Reciben además `name` y `time` de la toma para el aviso. Actualizar `useDoseToggle.test.tsx`.
- [X] T013 [P] [US1] Cambiar `useRoutineDoseToggle` en `frontend/src/features/supplements/hooks.ts` igual que T012.
- [X] T014 [US1] Cambiar `useMarkDone` en `frontend/src/features/supplements/hooks.ts` (research R4, «Realizado»): recibe las tomas del día que ya tiene la pantalla, elige la más temprana sin marcar (por `scheduledAt`, sin leer el reloj) y la pasa a `requestMark` con `send = markRoutineDone(...)`; si no hay ninguna, manda la petición sin marca en pantalla. Actualizar a quienes lo llaman para que pasen las tomas: `frontend/src/features/supplements/RealizadoButton.tsx`, `frontend/src/features/childDetail/ChildTodayCard.tsx` y `frontend/src/features/home/TuDia.tsx`.
- [X] T015 [P] [US1] Cambiar `useMarkDose` y `useDone` en `frontend/src/features/childDevice/phone/hooks.ts` igual que T012 y T014, con `deviceRequest` como `send` e invalidando `phoneKey()`.

### Componentes: sin esperar al servidor y con «guardando…»

- [X] T016 [US1] En `frontend/src/features/consultations/DoseRow.tsx`: quitar `mutation.isPending` de `disabled` (queda `locked`); cuando la toma trae `pendingAt` mostrar «✓ HH:MM» con esa hora y sin autor; con `usePendingMark(dose.id).slow` agregar «guardando…» (`SAVING`) al texto secundario y a la descripción accesible (`aria-describedby`). El nombre accesible no cambia (contracts/ui.md §1). Actualizar `DoseRow.test.tsx`.
- [X] T017 [P] [US1] Lo mismo que T016 en `frontend/src/features/supplements/RoutineDoseChip.tsx` (y su `DoseChipView`: la propiedad `pending` deja de deshabilitar), `frontend/src/features/supplements/RealizadoButton.tsx` y «Quitar la última marca» de `frontend/src/features/supplements/RoutineDetailPage.tsx`. Actualizar sus pruebas.
- [X] T018 [P] [US1] Lo mismo que T016 en `frontend/src/features/childDetail/ChildTodayCard.tsx` (fila de toma y fila de actividad) y sus pruebas.
- [X] T019 [P] [US1] Lo mismo que T016 en `frontend/src/features/home/ChildDayCard.tsx` y `frontend/src/features/home/TuDia.tsx`. En `ChildDayCard`, «✓ HH:MM» (`held`) se deriva de la toma mostrada y del registro, no de un estado local que espere a `onSuccess`. Actualizar sus pruebas y `homeText.test.ts` si cambia algún texto.
- [X] T020 [P] [US1] Lo mismo que T016 en `frontend/src/features/childDevice/phone/ChildTodayPage.tsx` (fila de toma y `ActivityRow`: `busy` deja de deshabilitar) y sus pruebas.

### Pruebas de la historia

- [X] T021 [US1] Pruebas de integración en `frontend/src/shared/marks/immediateMark.test.tsx`: con un `QueryClient` real y una respuesta retrasada, una toma en el detalle y la misma en el resumen cambian a la vez al tocar una; los conteos («N de M») avanzan; un refresco que llega con la toma sin marcar mientras la marca espera **no** la deshace (FR-008); al responder, el autor es el del servidor (FR-004).
- [X] T022 [US1] Crear `frontend/e2e/marcado-inmediato.spec.ts` (390 y 1280 px), parte 1: con `page.route` retrasar 3 s el `PATCH …/doses/…` y el `POST …/done`; en el detalle de la consulta, en «Hoy» del hijo, en la tarjeta del inicio y en una actividad, tocar y comprobar que el botón cambia en menos de 500 ms, que «guardando…» aparece y que al final dice «por <nombre>»; marcar cinco tomas seguidas sin esperar y, tras recargar, las cinco siguen marcadas (SC-006).

**Punto de control**: historia 1 completa y demostrable. Commit.

---

## Fase 4: Historia de Usuario 2 — Si no se guardó, la pantalla lo dice y no miente (P1)

**Objetivo**: toda falla devuelve la toma a su estado anterior y lo dice con un aviso neutral; la marca previa de otra persona se muestra sin tono de error.

**Prueba independiente**: con la red cortada, tocar «Marcar»: la toma vuelve atrás, aparece el aviso y ningún conteo queda cambiado; con conexión, el siguiente toque guarda y el aviso se va.

- [X] T023 [US2] Completar `frontend/src/shared/marks/requestMark.ts` (research R2 y R7): al fallar, publicar el aviso según el caso — falla de red o 5xx → `not_saved` (o `not_unmarked` si se quitaba la marca); 403 → `not_yours`; 404 → `gone`. Al responder bien un «marcar» con `takenBy.mine === false` → `marked_by_other` con `takenBy.name`. Un `send` que rechaza con «nada por marcar» (409 `nothing_to_mark` de «Realizado») no publica aviso. Cada `send` de T012–T015 traduce su error a `{ status }` para que `requestMark` no dependa de las clases de error de cada funcionalidad. Ampliar `requestMark.test.ts` con los seis casos.
- [X] T024 [US2] Crear `frontend/src/shared/marks/MarkNotice.tsx` (contracts/ui.md §2): lee `markNotices`; una región `role="status"` fija abajo, encima de `UpdateNotice`; barra a lo ancho en el teléfono y tarjeta en la esquina inferior derecha en la web (`useIsDesktop`, sin clases responsivas); un renglón por aviso, máximo tres y «y N más»; tono `info` para `marked_by_other` y neutro (tinta sobre superficie) para los demás; botón «Cerrar» de 44 px que llama a `dismissAll()`; se limpia al cambiar de ruta (`useLocation`). No toma el foco. Pruebas en `MarkNotice.test.tsx` en los dos diseños.
- [X] T025 [US2] Montar `<MarkNotice />` una vez en `frontend/src/features/home/AppShell.tsx` (junto a `UpdateNotice`, sin taparse entre sí) y una vez en `frontend/src/features/childDevice/phone/ChildTodayPage.tsx`. Actualizar sus pruebas.
- [X] T026 [P] [US2] Quitar los avisos sueltos de «no se guardó» de `frontend/src/features/home/ChildDayCard.tsx` y `frontend/src/features/childDetail/ChildTodayCard.tsx` (y sus textos, si ya nadie los usa), porque `MarkNotice` los reemplaza. Actualizar sus pruebas.
- [X] T027 [US2] Ampliar `frontend/src/shared/marks/immediateMark.test.tsx`: falla de red → la toma y los conteos vuelven y aparece el aviso; el siguiente intento con éxito quita el aviso (FR-010); dos tomas, falla una → solo esa vuelve y el aviso la nombra; marca previa de otra persona → se ve «por Ana» con candado si no se puede quitar y el aviso informativo; «Realizado» con 409 → el conteo vuelve al del servidor sin aviso.
- [X] T028 [US2] Ampliar `frontend/e2e/marcado-inmediato.spec.ts`, parte 2 (390 y 1280 px): `route.abort()` sobre el `PATCH` → la toma vuelve a «Marcar» y se ve «No se guardó la marca de …»; quitar el corte y tocar otra vez → queda marcada y el aviso desaparece; con dos contextos de navegador (dueña y Tutor) marcar la misma toma en los dos → el segundo ve «<Nombre> ya había marcado …»; lo mismo de la falla en `/hijo/hoy`.

**Punto de control**: historias 1 y 2 completas. Recorrer la sección 2 de quickstart.md. Commit.

---

## Fase 5: Historia de Usuario 3 — La app pregunta con su propio diálogo antes de descartar (P2)

**Objetivo**: ningún formulario ni el aviso de versión nueva usa el cuadro del navegador.

**Prueba independiente**: escribir en cada formulario, intentar salir y ver el diálogo de la app; «Seguir editando» conserva todo y «Descartar» sale.

### La pieza compartida

- [X] T029 [US3] Mover `frontend/src/features/family/ConfirmDialog.tsx` a `frontend/src/shared/ui/ConfirmDialog.tsx` (research R9): `rows` pasa a ser opcional y se agrega `body?: string` (una frase sin encabezado de renglón, con el estilo del valor de un renglón). Actualizar el import en los 12 archivos que lo usan (T001) y mover sus pruebas de `features/family/mockPieces.test.tsx` a `shared/ui/ConfirmDialog.test.tsx`. Ningún diálogo existente cambia de aspecto.
- [X] T030 [US3] Crear `frontend/src/shared/ui/useDiscardGuard.tsx` (research R10 y R11, contracts/ui.md §3): `useDiscardGuard({ dirty, title, body, confirmLabel = 'Descartar' })` devuelve `guardLink(event, to)`, `guardAction(event, run)`, `open` y `dialog`. Con `dirty` en falso no hace nada (el enlace o la acción siguen su curso). Con `dirty`: `preventDefault()`, guarda lo pendiente y el control tocado (`event.currentTarget`) y pinta `ConfirmDialog` con `tone: 'ink'`, `cancelLabel: 'Seguir editando'`, `busy: false` y `opener` = ese control. Confirmar ejecuta lo pendiente (`navigate(to)` o `run()`); cancelar lo olvida. Si ya está abierto, un segundo intento no abre otro. `dirty` se lee de una referencia para no usar un valor viejo. Pruebas en `useDiscardGuard.test.tsx`: sin cambios no pregunta; cancelar conserva y devuelve el foco; confirmar navega; Escape y el fondo cancelan; nunca dos diálogos.

### Los formularios (uno por tarea; cada uno actualiza su prueba, que hoy simula `window.confirm`)

- [X] T031 [US3] `frontend/src/features/consultations/ConsultationForm.tsx`: cambiar la propiedad `confirmLeave?: () => boolean` por `onLeaveClick?: (event, to) => void` en el enlace «← Cancelar». `NewConsultationPage.tsx` y `EditConsultationPage.tsx` usan `useDiscardGuard` con «¿Descartar la consulta?» / «Se perderá lo que capturaste.» y «¿Descartar los cambios?» / «Se perderá lo que cambiaste.» (partir `EDIT_TEXT.leave` en `editText.ts` en `leaveTitle` y `leaveBody`). Comprobar en la prueba que la foto elegida sigue tras «Seguir editando» (FR-017).
- [X] T032 [P] [US3] `frontend/src/features/appointments/AppointmentFormPage.tsx` (2 lugares: `backOnClick` y `leave`): «¿Descartar la cita?» / «Se perderá lo que capturaste.»
- [X] T033 [P] [US3] `frontend/src/features/supplements/RoutineFormPage.tsx` (2 lugares): «¿Descartar el suplemento?» o «¿Descartar la actividad?» / «Se perderá lo que capturaste.»
- [X] T034 [P] [US3] `frontend/src/features/medicineCabinet/CabinetFormPage.tsx`: partir `CABINET.leaveConfirm` en `cabinetText.ts`: «¿Salir de todos modos?» / «Lo que escribiste no se ha guardado.»
- [X] T035 [P] [US3] `frontend/src/features/growth/GrowthFormPage.tsx`: partir `GROWTH.leaveConfirm` en `growthText.ts`: «¿Salir sin guardarla?» / «Tienes una medida sin guardar.»
- [X] T036 [P] [US3] `frontend/src/features/childProfile/EditChildPage.tsx`: partir `CHILD_PROFILE.leaveConfirm` en `childProfileText.ts`: «¿Salir sin guardarlos?» / «Tienes cambios sin guardar.»
- [X] T037 [US3] `frontend/src/features/vaccinations/VaccineDialog.tsx` (research R11): `guardAction` al cerrar; título nuevo «¿Salir sin guardar?» y cuerpo «Si sales, se pierde lo que escribiste.» en `vaccineText.ts`. Mientras `guard.open` sea verdadero, el diálogo de vacuna no atiende Escape, Tab ni el clic en el fondo. Prueba en `VaccinationCardPage.test.tsx`: la confirmación queda encima y «Seguir editando» regresa a la vacuna con lo escrito.
- [X] T038 [US3] `frontend/src/shared/appVersion/UpdateNotice.tsx`: con `hasUnsavedWork()`, «Actualizar» abre `ConfirmDialog` («¿Actualizar ahora?» / «Se perderá lo que capturaste.», «Seguir editando» y «Actualizar», `opener` = el botón); `reloadApp()` solo al confirmar. Sin trabajo sin guardar recarga directo, como hoy. Actualizar `UpdateNotice.test.tsx`.

### Pruebas de la historia

- [X] T039 [P] [US3] Crear `frontend/src/shared/ui/noWindowConfirm.test.ts`, hermana de `noColorLiterals.test.ts`: falla si algún archivo de `src/` que no sea de prueba contiene `window.confirm(` o `window.alert(`.
- [X] T040 [US3] Crear `frontend/e2e/confirmaciones.spec.ts` (390 y 1280 px): en nueva consulta, cita, suplemento, botiquín, medida de crecimiento y editar hijo, escribir, tocar salir y comprobar el `dialog` de la app con el foco en «Seguir editando»; Escape conserva lo escrito; «Descartar» sale; sin escribir, sale sin diálogo; Tab no sale del diálogo. La prueba falla si aparece un cuadro del navegador (`page.on('dialog', …)` que marca error).
- [X] T041 [P] [US3] Actualizar `frontend/e2e/actualizar.spec.ts`, `cartilla.spec.ts`, `detalle-consulta-hijo.spec.ts` y `nueva-consulta-web.spec.ts`: dejan de aceptar el cuadro del navegador y tocan los botones del diálogo de la app.

**Punto de control**: historia 3 completa. Recorrer la sección 3 de quickstart.md. Commit.

---

## Fase 6: Pulido y transversales

- [X] T042 Correr todo: `npx tsc --noEmit`, `npx eslint src e2e`, `npx vitest run --coverage --testTimeout=30000 --maxWorkers=4` (más del 90 %; `shared/marks/` y `useDiscardGuard` incluidos) y `npx playwright test` completo con el backend y el frontend arriba. Arreglar lo que falle; si una E2E ajena dependía de un botón deshabilitado mientras guardaba, se corrige la prueba, no el comportamiento.
- [X] T043 Verificar en el navegador (herramienta de vista previa, 390 y 1280 px, red «3G lenta» y «sin conexión») las secciones 2 y 3 de `quickstart.md`, y dejar capturas del marcado inmediato, del aviso y del diálogo en los dos diseños.
- [X] T044 [P] Accesibilidad: con teclado, recorrer el diálogo (foco inicial, Tab atrapado, Escape, foco de vuelta) y comprobar que el aviso se anuncia sin mover el foco (`role="status"`); contraste de 4.5:1 del aviso y áreas de 44 px.
- [X] T045 [P] Actualizar `CLAUDE.md` (entrada `specs/066-marcado-inmediato-confirmaciones/` en «Current features») y `frontend/CLAUDE.md` (`shared/marks/`, `ConfirmDialog` y `useDiscardGuard` en `shared/ui/`, la regla «toda mutación que marca pasa por `requestMark`» y «ningún `window.confirm`»).
- [X] T046 [P] Actualizar `BACKLOG.md`: quitar de las ideas de interfaz lo que esta spec ya hizo, si estaba anotado, y dejar anotado lo que quedó fuera (research R13: marcar sin conexión, preguntar con el botón «atrás» del sistema, las demás mutaciones).
- [X] T047 Poner `Estado: Implementada` en `spec.md` y dejar listo el resumen para el PR a `develop` (el commit, el push y el PR solo cuando el dueño lo pida).

---

## Dependencias y orden

```text
Fase 1 ─▶ Fase 2 ─▶ Fase 3 (US1) ─▶ Fase 4 (US2) ─▶ Fase 6
     └──────────────▶ Fase 5 (US3) ─────────────────▶ Fase 6
```

- **Fase 2** bloquea las historias 1 y 2. Dentro: T002–T006 y T008 en paralelo; T007 después de T002, T004 y T006.
- **US1**: T009–T011 (lecturas) y T012–T015 (mutaciones) antes de T016–T020 (componentes); T014 después de T013 (mismo archivo); T021 y T022 al final.
- **US2** depende de US1 (es la misma pieza por el lado de la falla). T023 → T024 → T025; T026 en paralelo; T027 y T028 al final.
- **US3** no depende de las historias 1 y 2 y puede hacerse antes, después o a la par. T029 → T030 → T031–T038; T039–T041 al final. El único archivo compartido con US2 es `AppShell.tsx` (T025), que US3 no toca.

## Ejemplos de trabajo en paralelo

- Fase 2: T002, T003, T004, T005 y T006 a la vez (archivos distintos, sin dependencias).
- US1: T010 y T011 junto con T009; luego T017, T018, T019 y T020 a la vez.
- US3: T032, T033, T034, T035 y T036 a la vez, cada uno en su formulario.
- Las fases 3–4 y la fase 5 pueden llevarlas dos personas a la vez.

## Estrategia de implementación

- **MVP**: las fases 1 a 4 (historias 1 y 2 juntas). La historia 1 sola no se entrega: mostrar una marca sin la reversión de la historia 2 dejaría en pantalla tomas que el servidor no guardó (FR-005).
- **Segunda entrega**: la fase 5 (historia 3), que es independiente y podría ir en su propio PR si se prefiere.
- **Cierre**: la fase 6.

## Cobertura de los requisitos

| Requisito | Tareas |
|---|---|
| FR-001, FR-002, FR-003 | T003, T008–T020, T021, T022 |
| FR-004 | T004, T007, T021 |
| FR-005, FR-006 | T007, T023, T027, T028 |
| FR-007 | T008, T016–T020, T022 |
| FR-008 | T003, T009–T011, T021 |
| FR-009 | T007 |
| FR-010 | T023, T024, T027, T044 |
| FR-011 | T003, T014 |
| FR-012 | T016–T020 |
| FR-013 | T030–T037, T040 |
| FR-014 | T038, T041 |
| FR-015, FR-016, FR-017 | T029, T030, T031, T040, T044 |
| FR-018 | T005, T024 |
| FR-019 | regla general (ningún archivo de `backend/`), T042 |
