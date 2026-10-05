# Plan de Implementación: Actualizar datos y versión de la app instalada

**Rama**: `feature/017-actualizar-datos-y-version` | **Fecha**: 2026-09-30 | **Especificación**: [spec.md](./spec.md)

## Resumen

Solo frontend. (1) Gesto de jalar hacia abajo, una vez en `AppShell` y solo en diseño móvil, que vuelve a pedir los
datos activos de TanStack Query sin recargar (research R4). (2) Aviso «Hay una versión nueva · Actualizar»: el build
publica `version.json` y compila el mismo id en la app; se compara al abrir, al volver al primer plano y cada 10 min
(R1); «Actualizar» recarga y pide confirmación si hay datos sin guardar (R2). El aviso vive en `AppShell` (R3).

## Contexto Técnico

**Lenguaje/Versión**: TypeScript + React 19 (Vite 7). **Dependencias**: ninguna nueva.
**Almacenamiento**: N/A (sin backend, sin API, sin datos del padre).
**Pruebas**: Vitest + Testing Library (eventos táctiles sintéticos, `fetch` simulado), Playwright a 390/1280 px; >90 %.
**Restricciones**: nunca recargar solo; el gesto no recarga la página; textos neutros (Principio I); un solo botón
sólido por pantalla (el aviso usa contorno); área táctil ≥ 44 px; contraste ≥ 4.5:1; móvil y web separados.

## Verificación de la Constitución

- **I**: textos de sistema, nada médico. ✅ **II**: sin datos nuevos ni terceros; `version.json` es público y no lleva
  datos del padre. ✅ **III, IV**: sin cambios. ✅
- **V**: sin librerías, ~60 líneas de gesto y un archivo de versión. ✅ **VI**: unitarias >90 % y E2E a 390/1280 px. ✅
- **Mocks**: sin mock; se diseña con `design-tokens.md` y se muestran capturas (desviación en la spec 007). ✅

## Estructura del Proyecto

```text
frontend/
├── vite.config.ts                  # define __APP_VERSION__ + plugin que emite dist/version.json
├── public/_headers                 # Cache-Control: no-store para /version.json (Cloudflare Pages)
├── src/vite-env.d.ts               # declare const __APP_VERSION__: string
├── src/shared/pullToRefresh/       # usePullToRefresh.ts (+ test), PullIndicator.tsx (+ test)
├── src/shared/appVersion/          # useNewVersion.ts (+ test), UpdateNotice.tsx (+ test), unsavedWork.ts (+ test)
├── src/features/home/AppShell.tsx  # monta el gesto (solo móvil) y el aviso (ambos diseños)
├── src/features/consultations/NewConsultationPage.tsx, src/features/home/AddChildModal.tsx  # registran unsavedWork
├── e2e/actualizar.spec.ts          # gesto (390 px) y aviso (390 y 1280 px)
CLAUDE.md, frontend/CLAUDE.md, DEPLOY.md, specs/007 (desviación), BACKLOG.md (sección hecha)
```

## Seguimiento de Complejidad

Sin violaciones.
