---

description: "Lista de tareas de la spec 017: actualizar datos y versión de la app instalada"
---

# Tareas: Actualizar datos y versión de la app instalada

**Entrada**: `/specs/017-actualizar-datos-y-version/` (plan.md, spec.md, research.md, data-model.md, contracts/version-file.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en React y Playwright a 390 y 1280 px. Solo frontend.

**Organización**: US1 (P1, gesto) y US2 (P2, aviso) son independientes; comparten solo el montaje en `AppShell`.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Línea base: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde

## Fase 2: US1 - Jalar hacia abajo para actualizar (P1) 🎯 MVP

- [X] T002 [US1] Crear `frontend/src/shared/pullToRefresh/usePullToRefresh.ts`: listeners `touchstart`/`touchmove` (no pasivo)/`touchend`/`touchcancel` en `document`; solo arranca con `scrollingElement.scrollTop === 0`, sin `[aria-modal="true"]` y sin ancestro con `scrollTop > 0`; solo `dy > 0`, `preventDefault()` mientras se jala, distancia `min(dy × 0.5, 72)`, umbral `dy ≥ 140`; al soltar `queryClient.refetchQueries({ type: 'active' }, { throwOnError: true })`, una a la vez; estados `idle | pulling | refreshing | failed` (4 s); constantes exportadas en un solo lugar
- [X] T003 [P] [US1] Crear `frontend/src/shared/pullToRefresh/PullIndicator.tsx`: indicador arriba (`role="status"`, «Suelta para actualizar» / «Actualizando…»), aviso de falla «No pudimos actualizar. Revisa tu conexión.» con `Notice`; sin transición ni giro con `prefers-reduced-motion`; tokens de `design-tokens.md`
- [X] T004 [US1] Montar en `frontend/src/features/home/AppShell.tsx` solo cuando `!useIsDesktop()`, sin cambiar el lugar de `children` en el árbol (regla del `AppShell`)
- [X] T005 [US1] Pruebas (`usePullToRefresh.test.tsx`, `PullIndicator.test.tsx`, `AppShell.test.tsx`): pasa el umbral → refetch y sin recarga; bajo el umbral → nada; página no arriba → nada; diálogo abierto → nada; toque dentro de un ancestro con scroll → nada; una a la vez; falla → aviso y datos previos; web → sin gesto; el formulario conserva lo escrito
- [X] T006 [US1] E2E `frontend/e2e/actualizar.spec.ts` (390 px, contexto `hasTouch`, `TouchEvent` sintéticos): marcar una toma por la API, jalar y soltar → la toma aparece marcada sin navegar; en «Nueva consulta» lo escrito sigue; a 1280 px no existe

**Punto de Control**: un gesto actualiza los datos de cualquier pantalla móvil con sesión sin perder lo capturado.

## Fase 3: US2 - Aviso de versión nueva (P2)

- [X] T007 [US2] `frontend/vite.config.ts` y `src/vite-env.d.ts`: `define: { __APP_VERSION__ }` (`CF_PAGES_COMMIT_SHA` / `GITHUB_SHA` / marca de tiempo) y un plugin pequeño que emite `version.json` (`{ version }`) en `dist/`; `frontend/public/_headers` con `Cache-Control: no-store` para `/version.json`; `vitest.config.ts` define `__APP_VERSION__` para las pruebas
- [X] T008 [P] [US2] Crear `frontend/src/shared/appVersion/unsavedWork.ts` (registro `markUnsaved(): () => void`, `hasUnsavedWork()`) y hook `useUnsavedWork(dirty)`; registrarlo en `NewConsultationPage.tsx` (su `dirtyRef`) y `AddChildModal.tsx`; pruebas
- [X] T009 [US2] Crear `frontend/src/shared/appVersion/useNewVersion.ts`: pide `/version.json?t=` con `cache: 'no-store'` al montar, en `visibilitychange` (visible) y cada 10 min; respuesta inválida o falla → sin información; `true` si `version !== __APP_VERSION__`, y no vuelve a `false`; pruebas con `fetch` simulado y temporizadores falsos (contract `version-file.md`)
- [X] T010 [US2] Crear `frontend/src/shared/appVersion/UpdateNotice.tsx`: «Hay una versión nueva» + botón «Actualizar» de contorno (≥ 44 px, contraste ≥ 4.5:1), fija abajo con `safe-area` y sin tapar contenido, `z-40` (bajo los diálogos); móvil y web con `useIsDesktop`; «Actualizar» → `hasUnsavedWork()` ? `window.confirm('¿Actualizar ahora? Se perderá lo que capturaste.')` : recarga; nunca recarga sola; montarlo en `AppShell.tsx` (ambos diseños); pruebas de `UpdateNotice.test.tsx` (aparece/no aparece, recarga, confirmación con y sin datos, «Cancelar» no recarga)
- [X] T011 [US2] E2E en `actualizar.spec.ts` (390 y 1280 px): `page.route('**/version.json')` con otra versión → aparece el aviso; «Actualizar» recarga (la petición de la página se repite) y, con datos en «Nueva consulta», `dialog` de confirmación; sin versión nueva o `version.json` inválido → sin aviso

**Punto de Control**: el aviso aparece al haber versión nueva y jamás recarga sin que el padre lo pida.

## Fase 4: Pulido

- [ ] T012 Diseño: capturas del indicador, la falla y el aviso en 390 y 1280 px (con y sin diálogo abierto); contraste ≥ 4.5:1; mostrarlas al usuario para aprobarlas
- [X] T013 [P] Documentación: `CLAUDE.md` (feature 017), `frontend/CLAUDE.md` (carpetas `shared/pullToRefresh` y `shared/appVersion`, `version.json`, regla de `unsavedWork`), `DEPLOY.md` (`version.json` y `_headers`), `specs/007` (desviación: indicador y aviso sin mock), `BACKLOG.md` (sección hecha)
- [X] T014 Calidad: `npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage`; `npx playwright test e2e/actualizar.spec.ts` y los E2E afectados en los tres navegadores; `npm run build` genera `dist/version.json`
- [ ] T015 Prueba en el iPhone real por el túnel (quickstart §1 y §2), commit, push, PR a `develop` y code review

## Dependencias

Fase 1 → US1 (T002→T003/T004→T005→T006) e independiente US2 (T007→T009→T010→T011; T008 en paralelo antes de T010) → Pulido.

## Estrategia

MVP = US1 (gesto). US2 va en el mismo PR porque comparten `AppShell` y la documentación, pero puede entregarse aparte.
