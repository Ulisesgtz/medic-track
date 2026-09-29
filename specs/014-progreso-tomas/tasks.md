---

description: "Lista de tareas de la spec 014: barra de progreso de tomas"
---

# Tareas: Barra de progreso de tomas por medicamento

**Entrada**: `/specs/014-progreso-tomas/` (plan.md, spec.md, research.md, data-model.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % y Playwright a 390 y 1280 px. Solo frontend.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [ ] T001 Línea base: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde

## Fase 2: Fundamental

- [ ] T002 Crear `frontend/src/features/consultations/progress.ts`: `medicationProgress(doses: Dose[]) → { taken, total, unregistered }` (marcadas = `taken`, sin registrar = `status === 'unregistered'` vía `isUnregistered` de `doseStatus.ts`), `progressText({taken,total})` → "3 / 9 tomas" / "0 / 1 toma" / "1 / 1 toma", y `unregisteredSuffix(n)` → " · 2 sin registrar" o "" (research R2)
- [ ] T003 [P] Pruebas en `frontend/src/features/consultations/progress.test.ts`: 0 marcadas, todas, con sin registrar, una sola toma (singular), sin tomas, una toma marcada aunque su estado sea otro

## Fase 3: US1 - Ver cuánto va del tratamiento (P1) 🎯 MVP

**Prueba independiente**: un medicamento de 9 tomas con 3 marcadas muestra "3 / 9 tomas" y la barra a un tercio.

- [ ] T004 [US1] Crear `frontend/src/features/consultations/ProgressBar.tsx`: `role="progressbar"` con `aria-valuemin=0`, `aria-valuemax=total`, `aria-valuenow=taken`, `aria-valuetext="3 de 9 tomas registradas"` y `aria-label` "Progreso de las tomas"; pista `bg-slate-200`, relleno `bg-confirmed` con ancho en % y `transition-[width] motion-reduce:transition-none`; texto "N / total tomas" (`text-[13px] font-bold text-ink-soft`) encima; nada si `total === 0` (FR-007) (research R3)
- [ ] T005 [US1] En `frontend/src/features/consultations/MedicationCard.tsx`: mostrar `ProgressBar` entre el título y la línea del horario, en ambos diseños, con `medicationProgress(medication.doses)`
- [ ] T006 [US1] Pruebas en `frontend/src/features/consultations/ProgressBar.test.tsx` y `ConsultationDetailPage.test.tsx`: valores y texto accesibles, sin barra sin tomas, la barra y el texto se actualizan al marcar una toma (mock del `PATCH` y del detalle), ancho proporcional
- [ ] T007 [US1] E2E en `frontend/e2e/detalle-consulta-movil.spec.ts` y `detalle-consulta-web.spec.ts` (390 y 1280 px): "0 / 3 tomas" al inicio; al marcar una toma pasa a "1 / 3 tomas" sin recargar y `aria-valuenow` cambia

## Fase 4: US2 - Ver cuántas quedaron sin registrar (P2)

- [ ] T008 [US2] En `ProgressBar.tsx`, junto al texto, `unregisteredSuffix` en `text-slate-600` solo si hay sin registrar; no cuentan en la barra
- [ ] T009 [US2] Pruebas en `ProgressBar.test.tsx` y E2E en `frontend/e2e/tomas-sin-registrar.spec.ts`: con la toma sin registrar del escenario de zona horaria, el texto dice "· 1 sin registrar" y `aria-valuenow` no la cuenta

## Fase 5: Pulido

- [ ] T010 Diseño: capturas de la barra en móvil (390) y web (1280), vacía, a medias, llena y con sin registrar; contraste y `motion-reduce`; mostrarlas al usuario para aprobarlas
- [ ] T011 [P] Revisar textos contra el Principio I (nada de "bien", "atrasado", "te faltan"); anotar en `specs/007-homologar-pantallas-a-mocks/spec.md` la barra como adición sin mock
- [ ] T012 [P] Mapas: `CLAUDE.md` (feature 014), `frontend/CLAUDE.md` (`progress.ts`, `ProgressBar`); B3 hecho en `BACKLOG.md`
- [ ] T013 Calidad: `npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage` (>90 %); E2E afectados en los tres navegadores
- [ ] T014 Commit, push, PR a `develop` y code review

## Dependencias

Fase 1 → 2 → US1 → US2 → Pulido. T003 en paralelo con T004.

## Estrategia

MVP = US1 (avance). US2 agrega el conteo de sin registrar. Un solo PR.
