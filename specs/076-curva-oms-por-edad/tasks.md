---
description: "Tareas de la spec 076 — la gráfica de crecimiento solo hasta la edad de la curva de la OMS"
---

# Tareas: La gráfica de crecimiento solo hasta la edad de la curva de la OMS

**Entrada**: `specs/076-curva-oms-por-edad/` (spec, plan, research R1–R5, contracts, mock en `referencia/`).
**Pruebas**: obligatorias (> 90 %; E2E a 390 y 1280 px).
**Organización**: US1 la gráfica termina en la edad · US2 sin puntos dibujables · US3 anotar sigue igual.

## Fase 1: Fundamental (backend)

- [X] T001 `backend/internal/growth`: constantes `WeightMaxMonths = 120` y `HeightMaxMonths = 228` (+ prueba de que igualan la última fila de las cuatro tablas de `whodata_gen.go`); función pura `drawableUntil(birth time.Time, maxMonths int) time.Time` = `birth.AddDate(0, maxMonths, 0)`
- [X] T002 `service.Chart`: separar por indicador las medidas con `measured_on <= drawableUntil` (van a `points`) y contar las posteriores; el modelo `Chart` gana `Limits {Weight, Height {MaxMonths, Later}}`, presente también sin tabla elegida y con las curvas apagadas. Pruebas: bordes por fecha (día del cumpleaños 10 entra, el siguiente no; 19 igual para talla), sin tabla, curvas apagadas, plan primero sin cambios
- [X] T003 `handler.go`: `limits` en `chartResponse` según `contracts/api.md`; prueba de contrato; Swagger regenerado

## Fase 2: US1 — La gráfica termina en la edad (P1) 🎯

- [X] T004 [P] [US1] `frontend/src/features/growth/types.ts` (`limits`) y fixtures de pruebas (`growth.test-utils.tsx`)
- [X] T005 [P] [US1] `growthText.ts`: nota fija por indicador («La curva de peso de la OMS llega a los 10 años. Las medidas de después están en Medidas anotadas.», talla a los 19), «Medida n de N en la gráfica de peso|talla», frases de B y C y «Ir a Medidas anotadas ↓»; quitar `beyondWeight`/`beyondHeight`; prueba de redacción (sin «ya no», «fuera de rango», «excede»)
- [X] T006 [US1] `chartModel.ts` + `ChartCard.tsx`: quitar `REFERENCE_END` y el `cap` que se estiraba hasta la última medida; el eje termina en `limits[i].maxMonths`; rangos del mock (hijo > 36 meses: inicial «Hasta N años», «0–3 años» solo con puntos en 0–36 meses; hasta 36 meses la regla de la spec 065); nota fija en el cuadro de notas entre la de referencia y la del pediatra cuando `later > 0`; lectura con el contador en esa pestaña y ‹ › `disabled` con 40 % de opacidad en los extremos; pruebas a 390 y 1280

## Fase 3: US2 — Sin puntos dibujables (P1)

- [X] T007 [US2] `ChartCard`/`GrowthCards`: pestaña sin puntos y `later > 0` → bloque celeste con la frase (nombre del hijo) y el enlace de 44 px que salta a «Medidas anotadas» (ancla a la lista/tabla); sin rangos, lectura, selector Niña/Niño ni nota del pediatra; ningún indicador con puntos → sin pestañas, título «Gráfica de crecimiento» y la frase de las dos curvas; pruebas (B, B2, C) en los dos diseños

## Fase 4: US3 — Anotar sigue igual (P2)

- [X] T008 [US3] Pruebas de que anotar a un hijo de 11 años guarda la medida, sale en la lista y en «última medida» y no se dibuja en Peso (unidad en `GrowthPage.test.tsx`)

## Fase 5: Pulido

- [X] T009 Medir contra el mock a 390 y 1280 px (A, A2, B, B2, C, D) sección por sección; `referencia/desviaciones.md` con lo que quede (incluido «Quitar» en rojo vs acción del mock)
- [X] T010 E2E en `frontend/e2e/crecimiento.spec.ts`: estados A (Peso con nota y 3 puntos), B y C, 390 y 1280; correr con `scripts/e2e-local.sh --workers=2 e2e/crecimiento.spec.ts`
- [X] T011 Suites: `go test ./... -cover`, `npx vitest run --coverage`, `npx tsc --noEmit`, eslint
- [X] T012 Mapas: línea de la 076 en `CLAUDE.md`; `backend/CLAUDE.md` (`limits` de la gráfica) y `frontend/CLAUDE.md` (growth); el BACKLOG lo marca la sesión principal en `develop`

## Dependencias

T001 → T002 → T003 → frontend. T004/T005 en paralelo. T006 → T007. T009–T012 al final.
