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
- **T010** [P] `ChildDetailPage.tsx`: header oscuro del hijo (avatar, nombre, edad), bloque ámbar de tomas de hoy, lista de consultas. Preservar el scroll interno del modal (`max-h-[85vh] overflow-y-auto`) tal como está documentado en `frontend/CLAUDE.md`.
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
- **T019** Rejilla de resumen de 3 tarjetas (tomas de hoy, consultas, tratamiento activo) y contenido en dos columnas en la vista de detalle del hijo en escritorio.
- **T020** Verificar reflow a una columna por debajo de `lg` sin scroll horizontal.

## Fase 4 — Verificación

- **T021** Revisar contraste de cada par texto/fondo contra FR-008 y corregir los que no lleguen.
- **T022** Verificar que todo control accionable en móvil mide ≥ 44 px de alto (FR-009).
- **T023** Revisar 320, 390, 768, 1024, 1280 y 1920 px sin scroll horizontal (SC-004).
- **T024** `npx vitest run --coverage`, `npx tsc --noEmit && npx eslint .` y `npx playwright test` en verde. Documentar aquí cualquier aserción que haya cambiado por renombre de texto.
- **T025** Instalar la PWA en iOS y Android y verificar icono, nombre corto, color de tema y splash (SC-002).

## Notas

- Ninguna tarea toca `backend/`, `api.ts`, `types.ts` ni migraciones (FR-013).
- Si una tarea exige cambiar comportamiento para lograr el diseño, se detiene y se replantea: el alcance es visual.
