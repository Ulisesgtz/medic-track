# Plan de Implementación: Rediseño del inicio — tu día y el de cada hijo

**Rama**: `feature/055-rediseno-inicio` | **Fecha**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Entrada**: Especificación de `specs/055-rediseno-inicio/spec.md`; diseño `referencia/Inicio PediTrack.dc.html`.

## Resumen

Rehacer el inicio (`features/home/HomePage.tsx`) con el diseño entregado: saludo + «Tu día» (resumen personal) primero, la
tarjeta de cada hijo con su día (filas de Medicamentos, Suplementos y Actividades) y «Marcar» la próxima toma en su pie, «Lo
demás» como lista al final y «Cerrar sesión» en el menú de las iniciales; y alinear la pantalla «Hoy» del teléfono del hijo
(spec 047). **Solo frontend**: todo se deriva de los endpoints que ya existen (`research.md` R1), con el mismo número de
peticiones por hijo que hoy; sin migración, sin API nueva.

## Contexto Técnico

**Lenguaje/Versión**: TypeScript 5 / React 19 (Vite)
**Dependencias principales**: TanStack Query, React Router, Tailwind CSS v4, `@clerk/react` — ninguna nueva
**Almacenamiento**: N/A (sin cambios en PostgreSQL)
**Pruebas**: Vitest + Testing Library (> 90 %), Playwright (Chromium, 390 y 1280 px)
**Plataforma Objetivo**: PWA en teléfono (iOS/Android) y navegador de escritorio
**Tipo de Proyecto**: aplicación web (backend Go + frontend React); esta spec toca solo `frontend/`
**Objetivos de Rendimiento**: con 10 hijos, el inicio no tarda más que hoy (SC-003); nada salta al cargar (SC-004)
**Restricciones**: el diseño manda (medidas, textos, colores); colores solo como tokens de `@theme`
(`noColorLiterals.test.ts`); dos diseños con `useIsDesktop`, nunca mezclados; 44 px y 4.5:1
**Escala/Alcance**: 1 pantalla rehecha (inicio, dos diseños) + 1 alineada (`/hijo/hoy`); ~8 componentes nuevos

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Solo conteos de estados que decide el servidor; ámbar = «por marcar», «sin registrar» punteado gris; `homeText.test.ts` prohíbe palabras que evalúan (R4) |
| II. Privacidad | ✅ | Sin datos nuevos ni direcciones nuevas; nombres de medicamentos solo en cuerpos de respuesta, nunca en la dirección ni en `error_logs`; la pantalla del hijo no gana ningún dato |
| III. Stack fijo | ✅ | React PWA, sin dependencias nuevas |
| IV. Freemium disciplinado | ✅ | Lo que se ve y se marca no depende del plan; «Tu día» en el plan gratuito muestra el aviso del plan (como hoy «Mis suplementos») y lo decide el servidor (`paidPlan`) |
| V. Simplicidad | ✅ | Sin endpoint agregado (R1); reutiliza `useOverviewDoseToggle`, `useRoutines`, `usePersonalRoutines`, `scheduleText` |
| VI. Cobertura | ✅ | > 90 % unitarias; E2E de los estados 1, 3, 4, 5 y 7 a 390 y 1280 px |

**Gates**: sin violaciones. Revisión después del diseño: sin cambios.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/055-rediseno-inicio/
├── spec.md
├── plan.md              # este archivo
├── research.md          # R1–R9
├── data-model.md        # ChildDay / PersonalDay (derivados, sin tablas)
├── quickstart.md
├── contracts/ui.md      # endpoints usados y contrato de la pantalla
├── checklists/requirements.md
└── referencia/
    ├── Inicio PediTrack.dc.html   # el diseño (manda)
    └── desviaciones.md            # se escribe al construir
```

### Código Fuente

```text
frontend/src/
├── shared/
│   ├── date.ts                    # + formatWeekdayLong («jueves 1 de noviembre»)
│   └── ui/DayRow.tsx              # fila icono + título + valor (inicio y pantalla del hijo)
├── features/home/
│   ├── HomePage.tsx               # rehecha: orden del diseño, dos diseños
│   ├── homeText.ts (+ test)       # todas las frases (R4)
│   ├── daySummary.ts (+ test)     # ChildDay / PersonalDay, funciones puras (R3)
│   ├── Greeting.tsx               # saludo, fecha, iniciales + menú de cuenta (R6)
│   ├── TuDia.tsx                  # «Tu día» en sus cuatro modos
│   ├── ChildDayCard.tsx           # reemplaza ChildCard en el inicio: filas, estados, pie con «Marcar»
│   ├── MoreLinks.tsx              # «Lo demás»: filas (teléfono) / franja (web)
│   ├── HomeSkeleton.tsx           # esqueletos de altura fija (R8)
│   └── ChildrenSidebar.tsx        # ajustes del diseño (FR-011)
├── features/supplements/PersonalHomeBlock.tsx   # se retira del inicio (lo sustituye TuDia)
└── features/childDevice/phone/ChildTodayPage.tsx # estado 7 (R7)

frontend/e2e/
├── inicio.spec.ts                 # nuevo
├── hijo.spec.ts                   # estado 7
└── (specs que buscan «Tus hijos», «Cerrar sesión» en el encabezado o «N consultas»: ajustar)
```

**Decisión de Estructura**: aplicación web; solo `frontend/`. `ChildCard` sigue existiendo si otra pantalla lo usa; si no,
se borra junto con `ChildStatusChips`. `PersonalHomeBlock` sale del inicio y se borra si nadie más lo usa.

## Orden sugerido

1. `daySummary.ts` + `homeText.ts` + `formatWeekdayLong` (puros, con pruebas).
2. `ChildDayCard` (US1) y el inicio con el orden nuevo: es el MVP.
3. `TuDia` y `Greeting` (US2).
4. `MoreLinks`, menú de cuenta, barra lateral (US3).
5. `ChildTodayPage` (US4).
6. Esqueletos y fallas por tarjeta; E2E; medir contra el diseño a 390 y 1280 px; `desviaciones.md`; docs (`CLAUDE.md` raíz y
   `frontend/CLAUDE.md`).

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar.
