# Investigación: Marcado inmediato de tomas y confirmaciones propias

Todo se leyó del código de `develop` (`10e041c`). No quedó ninguna incógnita abierta.

## R1 — Cómo se marca hoy

**Hallazgo**: hay siete mutaciones que marcan y ninguna es optimista.

| Mutación | Archivo | Pantallas que la usan | Qué refresca |
|---|---|---|---|
| `useDoseToggle` | `features/consultations/useDoseToggle.ts` | detalle de la consulta (`DoseRow`) | `['consultation', id]`, `['overview']` |
| `useOverviewDoseToggle` | mismo archivo | «Hoy» del hijo (`ChildTodayCard`), tarjeta del hijo en el inicio (`ChildDayCard`), perfil propio y compartido | `consultation`, `routines`, `routine`, `overview` |
| `useRoutineDoseToggle` | `features/supplements/hooks.ts` | detalle de suplemento (`RoutineDoseChip`), «Quitar la última marca» de una actividad | `routines`, `routine`, `overview` |
| `useMarkDone` | mismo archivo | «✓ Realizado» (`RealizadoButton`, `ChildTodayCard`, `TuDia`) | los mismos, en `onSettled` |
| `useMarkDose` | `features/childDevice/phone/hooks.ts` | teléfono del hijo | todo `['child-device', …]` |
| `useDone` | mismo archivo | teléfono del hijo | igual |

Todos los botones se deshabilitan con `isPending` mientras llega la respuesta: por eso hoy no hay toques repetidos, y por eso el toque «no entra» con mala señal.

## R2 — Qué responde el servidor (no cambia)

- `PATCH …/doses/{id}` con `taken: true` sobre una toma **ya marcada por otra persona** responde **200** con la toma tal como está: `takenBy` es la otra persona (la primera marca gana, spec 032). No es un error.
- `taken: false` sobre una marca ajena, sin ser Tutor: **403** `forbidden`.
- Sin acceso, o toma que ya no existe: **404** `dose_not_found`.
- `POST /routines/{id}/done` sin nada por marcar: **409** `nothing_to_mark`.
- El `PATCH` devuelve la toma completa (`taken`, `status`, `takenBy`); `done` devuelve la toma que marcó.

**Consecuencia**: «otra persona la marcó primero» se detecta con `takenBy.mine === false` en la respuesta de un «marcar» (el servidor ya dice si la marca es de la sesión), no por un código de error. Confirmado en `consultation.Repository.UpdateDoseStatus` (`UPDATE … AND NOT taken`, y si no cambió nada devuelve la toma como está).

## R3 — Dónde vive el cambio inmediato

**Decisión**: un **registro de marcas por confirmar** propio (`shared/marks/pendingMarks.ts`), fuera de la caché de TanStack Query: un mapa `doseId → { taken, since }` leído con `useSyncExternalStore`. Los hooks que leen tomas (`useConsultation`, los de `overview`, `useRoutines`, `usePersonalRoutines`, `useRoutine` y los del teléfono del hijo) pasan sus datos por una función pura, `applyPendingMarks`, antes de entregarlos.

**Justificación**:
- **FR-008**: las pantallas vuelven a pedir los datos cada 60 s y al volver a la app. Una respuesta que salió antes de que el servidor guardara la marca reescribe la caché y desharía un parche hecho ahí. El registro se aplica al leer, así que ninguna respuesta lo borra.
- **FR-002 / FR-003 / escenario 7 de la historia 1**: todas las pantallas y todos los conteos salen de esos hooks, así que el cambio aparece igual en todas sin tocar cada componente.
- Hay cinco formas de dato distintas (detalle, resumen, lista de rutinas, rutina, teléfono del hijo). Un solo punto que sabe recorrer «cualquier objeto con `doses`» es más chico que cinco `onMutate`.

**Alternativas consideradas**:
- `onMutate` + `setQueryData` + `cancelQueries` (la receta de TanStack Query): no protege de un refresco que empieza mientras la marca espera, y obliga a escribir el parche y su reversa por cada forma de dato.
- Estado local en cada botón: los conteos y las otras pantallas no se enterarían.

## R4 — Qué se muestra mientras se confirma

**Decisión**:
- **Marcar**: la toma pasa a `taken: true`, `status: 'taken'`, con la hora del toque y **sin autor** («✓ 16:02»). El «por Ana» llega con la respuesta.
- **Quitar la marca**: `taken: false` y `status: 'pending'`, que es el estado sin etiqueta. La app no pone «por marcar» ni «sin registrar» por su cuenta: eso lo dice el servidor al responder (FR-011).
- **«Realizado»**: se marca en pantalla la toma más temprana sin marcar del día que ya trae la rutina, que es la misma regla del servidor. Si el servidor marcó otra (dos personas a la vez), manda su respuesta.

**Justificación**: la hora del toque es solo el texto provisional de una marca propia; ningún estado ni conteo se calcula con el reloj del teléfono.

## R5 — El orden de las operaciones

**Decisión**: una función por toma, `requestMark(doseId, taken, send)`:

1. Anota el estado deseado en el registro (la pantalla cambia en ese instante).
2. Si no hay petición en vuelo para esa toma, la manda.
3. Al responder bien: escribe la toma del servidor en todas las cachés que la tengan (`writeDoseToCaches`, R6). Si el estado deseado cambió entretanto (otro toque), manda una petición más; si no, quita la marca del registro e invalida las consultas como hoy.
4. Al fallar: quita la marca del registro, publica el aviso (R7) e invalida las consultas, para que la pantalla quede con lo que el servidor tiene.

Los botones dejan de deshabilitarse con `isPending`; siguen deshabilitados los que hoy lo están por permiso (candado).

**Justificación**: una petición a la vez por toma cumple FR-009 (termina en el último toque, sin marcas repetidas) sin depender del orden de llegada de dos respuestas. Tomas distintas van en paralelo (SC-006).

**Alternativa considerada**: mandar cada toque de inmediato. Dos respuestas cruzadas pueden dejar al servidor en el estado contrario al de la pantalla.

## R6 — Que el autor del servidor no parpadee

**Decisión**: `writeDoseToCaches(queryClient, dose)` reemplaza por `id` la toma en toda consulta en caché cuyas llaves empiecen con `consultation`, `overview`, `routines`, `routine` o `child-device`, antes de quitar la marca del registro.

**Justificación**: si solo se invalidara, entre quitar la marca del registro y la llegada del refresco la toma se vería un momento sin marcar. Las pantallas que no están abiertas quedan además con el dato correcto para cuando se abran.

## R7 — El aviso de que no se guardó

**Decisión**: un solo componente, `MarkNotice`, que lee un registro de avisos (`shared/marks/markNotices.ts`) y se monta una vez en `AppShell` y una vez en la pantalla del teléfono del hijo. Es una barra fija abajo, encima del aviso de versión nueva, con `role="status"` (se anuncia sin mover el foco) y un botón «Cerrar». Reemplaza los avisos sueltos que hoy tienen `ChildDayCard` y `ChildTodayCard`.

| Caso | Tono | Texto |
|---|---|---|
| Sin conexión o falla del servidor | neutro | «No se guardó la marca de {nombre} de las {hora}. Revisa tu conexión e inténtalo de nuevo.» |
| Al quitar una marca | neutro | «No se quitó la marca de {nombre} de las {hora}. Revisa tu conexión e inténtalo de nuevo.» |
| Otra persona la marcó antes (R2) | informativo | «{Ana} ya había marcado {nombre} de las {hora}.» |
| 403 al quitar una marca ajena | neutro | el texto de hoy: «Solo quien la marcó o un Tutor puede quitar esta marca.» |
| 404 (sin acceso o ya no existe) | neutro | «No se guardó la marca. Esta toma ya no está disponible.» |
| «Realizado» con 409 | — | sin aviso; la pantalla se actualiza |

Varias fallas seguidas se listan una por renglón (máximo tres; después «y N más»). Un aviso se va cuando esa toma se guarda, cuando se toca «Cerrar» o al cambiar de pantalla.

**Justificación**: un solo lugar se ve igual en las siete pantallas y es una sola región viva para los lectores de pantalla. Ningún texto evalúa ni aconseja sobre la salud (Principio I); la prueba de redacción los cubre.

**Alternativa considerada**: un aviso junto a cada toma. En el inicio y en «Hoy» la fila puede quedar fuera de la vista o desaparecer al refrescar, y serían siete lugares que mantener.

## R8 — «guardando…»

**Decisión**: el registro guarda `since`; `usePendingMark(doseId)` devuelve `slow: true` cuando pasan 2 000 ms. Las filas y los chips muestran entonces «guardando…» en el texto secundario de la toma, y su nombre accesible lo incluye.

## R9 — El diálogo de confirmación

**Hallazgo**: `ConfirmDialog` vive en `features/family/` y ya lo importan 12 archivos de otras funcionalidades. Tiene portal, Escape, Tab atrapado, foco inicial en la opción segura, hoja en el teléfono y centrado en la web. Su cuerpo son renglones `{k, v}`.

**Decisión**:
- Se mueve a `shared/ui/ConfirmDialog.tsx` (los 12 imports se actualizan) y gana una propiedad `body?: string` para una frase sin encabezado de renglón.
- La frase de hoy se parte en título y cuerpo sin cambiar palabras: «¿Descartar la consulta?» / «Se perderá lo que capturaste.»
- `tone: 'ink'`, `cancelLabel: 'Seguir editando'`, `confirmLabel: 'Descartar'` (en la actualización, «Actualizar»).

## R10 — De una pregunta que bloquea a una que espera

**Hallazgo**: `window.confirm` devuelve la respuesta en la misma línea; los 11 lugares lo usan para decidir si cancelan un clic (`event.preventDefault()`) o si navegan. Un diálogo propio responde después.

**Decisión**: un hook, `useDiscardGuard({ dirty, title, body })` en `shared/ui/`, que devuelve:
- `guardLink(event, to)`: si hay datos, cancela el clic, recuerda el destino y abre el diálogo;
- `guardAction(run)`: lo mismo para un botón (cerrar el diálogo de vacuna, «Cancelar» del formulario);
- `dialog`: el elemento que la página pinta.

«Descartar» ejecuta lo recordado (`navigate(to)` o `run()`); «Seguir editando» lo olvida. El foco vuelve al control que se tocó.

`ConsultationForm` cambia su propiedad `confirmLeave: () => boolean` por `onLeaveClick: (event, to) => void`.

**Formularios**: `NewConsultationPage`, `EditConsultationPage`, `AppointmentFormPage` (2), `RoutineFormPage` (2), `CabinetFormPage`, `GrowthFormPage`, `EditChildPage`, `VaccineDialog` y `UpdateNotice`: los 11 `window.confirm`.

## R11 — Un diálogo encima de otro (vacuna)

**Hallazgo**: `VaccineDialog` y `ConfirmDialog` escuchan Escape y Tab en `document`; abiertos a la vez responderían los dos.

**Decisión**: mientras la confirmación está abierta, el diálogo de vacuna no atiende teclado ni clic en el fondo (una bandera), y la confirmación se pinta después en `<body>`, así que queda encima. Al cancelarla, el foco vuelve al botón de cerrar de la vacuna. El hook nunca abre una segunda confirmación si ya hay una.

## R12 — Pruebas que dependen del cuadro del navegador

**Hallazgo**: 10 archivos de prueba unitaria simulan `window.confirm` y 4 E2E aceptan el cuadro con `page.on('dialog')` (`actualizar`, `cartilla`, `detalle-consulta-hijo`, `nueva-consulta-web`).

**Decisión**: se reescriben para tocar los botones del diálogo de la app. Una prueba nueva, hermana de `noColorLiterals.test.ts`, falla si alguien vuelve a escribir `window.confirm` en `src/`.

## R13 — Lo que queda fuera

- «Marcar tomas» (todas las de hoy) y la acción «Tomada» del aviso push: sin cambios.
- `AddChildModal` registra trabajo sin guardar pero hoy no pregunta al cerrar: sigue igual.
- Marcar sin conexión para mandarlo después: etapa 2 de «Ver la app sin conexión» del `BACKLOG.md`.
- Las demás mutaciones (pausar, finalizar, «Tus avisos», marcar una cita como realizada) siguen esperando al servidor.
