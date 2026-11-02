# Investigación: Rediseño de las pantallas de detalle (spec 056)

## R1 — ¿Hace falta algún dato del servidor?

**Decisión**: **no**. Solo frontend, sin migración ni API nueva.

**Justificación**: cada pieza de los diseños sale de respuestas que ya existen:

| Pieza | De dónde sale |
|---|---|
| «Hoy» del hijo (tomas de medicamento y suplemento, actividades) | `GET /children/{id}/overview` + `GET /children/{id}/routines?kind=activity` (las mismas llaves que la tarjeta del inicio, `useChildDay` de la spec 055) |
| Tratamiento activo, próxima cita | `overview.activeTreatment` y `ChildAppointmentSection` (ya en la pantalla) |
| Secciones Consultas / Suplementos / Actividades / Cartilla | `fetchConsultations`, `useRoutines(kind)`, `CardEntry` (ya en la pantalla) |
| «Lo demás» del hijo: «Acceso del hijo», «Familia que lo ve» | `ChildAccessBlock` (spec 047) y `useFamily` |
| Detalle de la consulta | `GET /consultations/{id}` (tomas con `status`, `takenBy`, `endedAt`, `extensions`, `edited`) |
| «Mi día» | `GET /accounts/{id}/routines?kind=supplement|activity` (`usePersonalRoutines`) |

«Hoy» del hijo marca con `useOverviewDoseToggle` (spec 055) y las actividades con `useMarkDone` (spec 035).

**Alternativas**: un endpoint «día del hijo» agregado — ya está en `BACKLOG.md` desde la spec 055; no hace falta para esto.

## R2 — El componente de encabezado

**Decisión**: `shared/ui/PageHeader.tsx`, un componente presentacional con dos variantes (`phone` / `desktop`) y las partes
del diseño como props: `back: { label, to }`, `eyebrow?`, `title`, `subtitle?`, `chip?: { label, tone: 'hint' | 'line' }`,
`actions?` (nodos: el sólido y los de contorno los pone cada pantalla con `pageHeaderButton(kind)` para respetar las medidas),
`readOnly?`, `search?` (nodo que se pega abajo con `sticky top-0` en el teléfono), `state?: 'ready' | 'loading' | 'error'`
con `onRetry` y el texto del error. Teléfono: sin banda, `padding-top: env(safe-area-inset-top)`, `px-5 pb-4`, título 28/900
`leading-[1.15]` `[text-wrap:balance]`, acciones bajo el título (`mt-2.5`, `gap-2`). Web: título 34/900 y las acciones a la
derecha (`items-center`). Usa `leading-[normal]` y tamaños exactos (lección de la spec 055).

**Cómo reemplaza lo que hay**:
- `RoutinePageFrame` (7 pantallas: suplemento/actividad detalle y formulario, Mis suplementos/actividades, Cartilla, citas
  historial y formulario, Planes, regreso del pago) conserva su nombre y sus props y **por dentro** usa `PageHeader`, así
  las 7 cambian sin tocarlas; gana props opcionales `subtitle`, `chip`, `actions`, `readOnly`.
- Las 5 pantallas con encabezado propio (`ChildDetailPage`, `ConsultationDetailPage`, la página del formulario de consulta,
  `HistoryPage`, `FamilyPage`) pasan a `PageHeader` directamente.
- `shared/ui/AppHeader.tsx` ya no lo usa nadie desde la spec 055: se borra.
- Fuera: `SignupPhone`/`AuthLayout` (iniciar sesión y registro tienen su propio diseño), el inicio y `/hijo/hoy`.

**Alternativas**: reescribir cada pantalla con su propio encabezado — rompe la consistencia que justifica la spec.

## R3 — Guardar fijo abajo en los formularios (teléfono)

**Decisión**: `shared/ui/StickyActionBar.tsx`: una barra `sticky bottom-0` (no `fixed`) dentro del `<form>`, con fondo
`canvas`, borde superior `hint-edge` y `padding-bottom: calc(1.625rem + env(safe-area-inset-bottom))`; el botón de
guardar adentro (52 px, ancho completo). Al ser `sticky` dentro del flujo, **no tapa el campo activo** cuando sale el
teclado (iOS mueve el viewport visual y el campo enfocado queda visible) y el formulario no necesita un relleno inferior
calculado. En la web el mismo botón va al final del formulario (sin barra). Se usa en `RoutineForm`, `ConsultationForm`
(Nueva / Editar) y el formulario de citas.

**Alternativas**: `position: fixed` — con el teclado de iOS el botón flota sobre el campo; se descartó.

## R4 — El índice de secciones pegado

**Decisión**: `shared/ui/SectionIndex.tsx`: una fila de pastillas (`<nav aria-label="Secciones">` con enlaces a `#id`), `sticky
top-0` en el teléfono con fondo `canvas`; cada sección lleva `id` y `scroll-margin-top` igual a la altura del índice. Tocar
una pastilla usa `scrollIntoView({ behavior: smooth | auto según prefers-reduced-motion })`. La pastilla de la sección
visible se marca con `aria-current="true"` usando un `IntersectionObserver` (sin observador en jsdom: queda la primera). En
la web el índice va arriba de la columna izquierda, sin pegarse. Solo muestra las secciones que existen (sin secciones vacías).

## R5 — «Hoy» del hijo

**Decisión**: `features/childDetail/` (nuevo, para no seguir creciendo `consultations/`): `ChildTodayCard` reutiliza
`useChildDay` y `childDay` de la spec 055 para el chip y los conteos, y agrupa las tomas con `groupByPeriod` (spec 015);
cada toma usa el chip nuevo de la consulta (R7) y cada actividad la fila de `ActividadTarjeta` reducida a «nombre · N de M
hechas · próxima» + `RealizadoButton`. El orden y la regla de «una marca de otra persona es texto» son los de la spec 055.

## R6 — Calendario semanal en el teléfono

**Decisión**: `TreatmentCalendar` gana `mode: 'week' | 'month'` (teléfono empieza en `week`, la web siempre `month`) y un
botón «Ver mes» / «Ver semana» (`aria-expanded`). `treatmentDays.ts` gana `weekOf(day)` (lunes a domingo, como
`monthGrid`) y las flechas en semana pasan de semana en semana sin salir del tratamiento. Las celdas, los puntos y la marca de
hoy son los mismos de las specs 022/027.

## R7 — El chip de toma: candado y «programada»

**Decisión**: `DoseChipView` gana: (a) **candado** dibujado (SVG `aria-hidden`) y «✓ HH:MM · por Nombre» cuando la marca es
de otra persona — sigue siendo un botón deshabilitado con nombre fijo y `aria-pressed` (convención del proyecto, como la
desviación 7 de la spec 055); (b) la palabra **«programada»** en una toma `pending` de **otro día que no es hoy** y posterior a
hoy, **que se puede marcar** (FR-018, decisión del dueño). «cancelada» (tachada) no cambia.

## R8 — «Mi día»

**Decisión**: ruta `/mi-dia` → `features/supplements/MyDayPage.tsx` (dentro de `RequireSession` y `AppShell`) con
`PageHeader` (H5: «← Inicio», «Mi día», «Solo tú ves esto»), «Hoy» (tomas por Mañana / Tarde / Noche + actividades), el índice
Suplementos · Actividades y las secciones con `MisRegistroSeccion` (ya tiene el aviso de primera vez, el plan y el tope).
`/mis-suplementos` y `/mis-actividades` pasan a `<Navigate to="/mi-dia#suplementos|#actividades" replace />`; las rutas de
**crear** (`/mis-suplementos/nueva`, `/mis-actividades/nueva`) y los detalles (`/suplementos/:id`, `/actividades/:id`) se
quedan, y sus «← …» pasan a «← Mi día». «Ver todo» de «Tu día» y la entrada única «Mi día» de la barra lateral llevan ahí.

## R9 — Textos y pruebas

- Textos nuevos en `features/childDetail/childDetailText.ts`, `consultations/consultationDetailText.ts`,
  `supplements/myDayText.ts` y los del encabezado en `shared/ui/pageHeaderText.ts`, cada uno con su prueba de redacción
  (mismas palabras prohibidas que `homeText.test.ts`).
- Unitarias de cada pieza nueva (PageHeader en sus variantes, StickyActionBar, SectionIndex, semana del calendario, chip con
  candado y «programada», «Hoy» del hijo, «Mi día», redirecciones) y de las pantallas en ambos diseños. Cobertura > 90 %.
- E2E (Chromium, 390 y 1280 px): `detalle-hijo.spec.ts` (Hoy primero y marcar, índice, Cuidador, plan gratuito),
  `detalle-consulta.spec.ts` ampliado (tratamiento primero, semana/mes, candado, «programada» se marca, datos plegados),
  `mi-dia.spec.ts` (Ver todo → Mi día, marcar, crear, redirecciones). Los E2E que buscan la banda oscura, «Consultas: N desde»,
  «Mis suplementos» como título o «Tomas de hoy» del bloque viejo se ajustan.
- Medir contra los diseños con el arnés de la spec 055 (Clerk sustituido, API falsa) a 390 y 1280 px.
