# Tareas: Identidad visual y rediseño del front-end

**Rama**: `feature/005-identidad-visual-front-end` | **Plan**: [plan.md](./plan.md) | **Sistema visual**: [design-tokens.md](./design-tokens.md)

Convención: `[P]` = paralelizable con las tareas marcadas igual dentro de la misma fase.

## Fase 0 — Tokens y logo (bloquea todo lo demás)

- **T001** Declarar los tokens de `design-tokens.md` en el bloque `@theme` de `frontend/src/index.css` y actualizar el reset de `body` a `--color-canvas` + tinta `--color-ink`.
- **T002** Crear `frontend/src/shared/ui/Logo.tsx`: SVG inline con props `size` y `variant` ('dark' | 'light'), sin dependencias.
- **T003** [P] Exportar `frontend/public/favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` desde el SVG del logo.
- **T004** [P] Crear `frontend/public/manifest.webmanifest` con `name`, `short_name`, `theme_color` y `background_color` `#04252b` y los iconos de T003.
- **T005** Actualizar `frontend/index.html`: `<title>PediTrack</title>`, `<meta name="theme-color" content="#04252b">`, link al manifest y al favicon nuevo. Ajustar la aserción de título en `src/App.test.tsx` si la hubiera.
- **T006** Prueba unitaria de `Logo.tsx` (render por variante) para no bajar del umbral de cobertura del Principio VI.

## Fase 1 — Pantallas móviles

- **T007** `AccountSignupForm.tsx`: encabezado oscuro con `Logo` + propuesta de valor, campos al patrón nuevo, tarjeta de hijo con badge, CTA primaria única. No tocar validaciones ni el banner de error genérico del servidor.
- **T008** [P] `ChildFieldset.tsx`: tarjeta `--color-hint`, badge "Hijo N", campos en el patrón nuevo. Conservar `positiveNumberValidation` y el `onChange` que limpia `stateCode`.
- **T009** [P] `HomePage.tsx` + `ChildCard.tsx`: header oscuro con logo y avatar, titular "Tus hijos", tarjetas con avatar de inicial, edad y chips de resumen; estados "sin cuenta" y "cuenta sin hijos" con la misma jerarquía.
- ✅ **T010** (parcial) [P] `ChildDetailPage.tsx`: header oscuro del hijo (avatar, nombre, edad), bloque ámbar de tomas de hoy, lista de consultas. Preservar el scroll interno del modal (`max-h-[85vh] overflow-y-auto`) tal como está documentado en `frontend/CLAUDE.md`.
- **T011** [P] `ConsultationCard.tsx`: tarjeta con barra de acento izquierda; acento brillante para la consulta más reciente.
- **T012** [P] `ConsultationDetailPage.tsx`: tarjeta de receta con miniatura y "Ver completa", síntomas como párrafo de 16 px, medicamentos en tarjeta con chips de toma.
- **T013** [P] `DoseCheckbox.tsx`: chip de 44 px de alto, emerald para tomada y ámbar para pendiente, siempre habilitado (sin restricción por fecha).
- **T014** `ConsultationForm.tsx`: panel de OCR sobre `--color-ink-soft` con barra de progreso `--color-bright` y la nota de privacidad; los campos autollenados por OCR llevan borde `--color-bright`. No alterar `useOcrSuggestion`, el stagger de `MEDICATION_STAGGER_MS`, la línea de progreso ni el `input` de archivo oculto por ref.
- **T015** `MedicationFieldset.tsx`: badge de medicamento, nombre a ancho completo, frecuencia y duración en dos columnas. Conservar el header en CSS Grid y el comportamiento colapsable (nunca colapsado por defecto).

## Fase 2 — Modales

- **T016** `AddChildModal.tsx` al patrón de FR-010 (encabezado, cuerpo, acciones a la derecha). Conservar que "Quitar hijo" de `ChildFieldset` siga siendo el control de cierre.
- **T017** `FreemiumLimitModal.tsx` con franja de encabezado ámbar y overline "Plan gratuito". Conservar `aria-modal` y la trampa de foco entre sus dos botones.

## Fase 3 — Escritorio

- **T018** Barra lateral persistente de hijos desde `lg` en `HomePage.tsx` (logo, lista de hijos, "Agregar hijo", usuario y plan al pie).
- ✅ **T019** (parcial) Rejilla de resumen de 3 tarjetas (tomas de hoy, consultas, tratamiento activo) y contenido en dos columnas en la vista de detalle del hijo en escritorio.
- **T020** Verificar reflow a una columna por debajo de `lg` sin scroll horizontal.

## Fase 4 — Verificación

- ✅ **T021** Revisar contraste de cada par texto/fondo contra FR-008 y corregir los que no lleguen.
- ✅ **T022** Verificar que todo control accionable en móvil mide ≥ 44 px de alto (FR-009).
- **T023** Revisar 320, 390, 768, 1024, 1280 y 1920 px sin scroll horizontal (SC-004).
- ✅ **T024** `npx vitest run --coverage`, `npx tsc --noEmit && npx eslint .` y `npx playwright test` en verde. Documentar aquí cualquier aserción que haya cambiado por renombre de texto.
- **T025** Instalar la PWA en iOS y Android y verificar icono, nombre corto, color de tema y splash (SC-002).

## Resultados de verificación

- **Desviaciones T010/T019**: sin avatar de hijo en el header ni tarjetas de "tomas de hoy" / "tratamiento
  activo": `GET /children/{id}/consultations` no trae dosis y FR-013 prohíbe tocar la API. El resumen usa
  Consultas, Última consulta y Doctores. Pendiente en `BACKLOG.md`.
- **T021 (contraste)**: auditoría automática sobre el DOM real (color efectivo compuesto sobre el fondo,
  umbral 4.5:1 / 3:1 para ≥24 px en peso ≥700) en registro, home, detalle del hijo, detalle de consulta
  y los modales (registrar consulta con errores, freemium, agregar hijo, visor de receta), a 390 y 1280 px:
  **0 pares por debajo del umbral**. Pares de los tokens: blanco/ink 16.1, blanco/action 5.36,
  blanco/confirmed 5.48, ink/bright 8.91, on-pending/pending 6.97, action/hint 5.15,
  pending-strong/pending-soft 6.37, confirmed-strong/confirmed-soft 6.78, bright/ink-soft 6.74.
- **T022 (áreas táctiles)**: la misma auditoría midió todo `a`, `button`, `input`, `select`, `textarea`
  (para checkboxes, el `<label>` que los envuelve). Cuatro controles medían menos de 44 px y se corrigieron:
  los dos enlaces "← Volver…" del header (17 px), el botón cerrar (X) del modal de consulta (34 px) y el enlace
  del logo de la barra lateral (36 px). Resultado final: 0 controles < 44 px a 390 y 1280 px.
- **T024**: `tsc`, `eslint` y `vitest --coverage` en verde (147 pruebas; ramas 91.49 %); `playwright test` en verde
  en Chromium, Firefox y WebKit (42 pruebas). Aserciones que cambiaron por el rediseño, no por comportamiento:
  - Playwright corre a 1280 px, donde ahora hay barra lateral: el nombre del hijo y el botón "Agregar hijo"
    aparecen en la barra y en el contenido, así que los selectores se acotan a `getByRole('main')`.
  - La toma (`DoseCheckbox`) es un chip `<label>` con el checkbox oculto: la prueba hace clic en el chip,
    como lo haría un padre, en vez de en el input.
  - Título de la página de registro ("Tus hijos" / "Crear cuenta") ajustado en pruebas previas.

## Notas

- Ninguna tarea toca `backend/`, `api.ts`, `types.ts` ni migraciones (FR-013).
- Si una tarea exige cambiar comportamiento para lograr el diseño, se detiene y se replantea: el alcance es visual.
