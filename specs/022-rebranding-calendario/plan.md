# Plan de Implementación: Rebranding de los colores del calendario

**Rama**: `feature/022-rebranding-calendario` | **Fecha**: 2026-09-30 | **Especificación**: [spec.md](./spec.md)

## Resumen

Solo frontend. Se reconstruye la presentación del calendario (specs 019/020) con las medidas exactas del diseño de Claude
Design (research R1): pastillas con puntos de color por medicamento, relleno si se dio (R2) y en lugar fijo (R3), los
colores nuevos (R4), la lista de tomas del día con los chips del diseño sin perder los estados de la spec 013 (R5) y,
en la web, la tarjeta «Cómo leer el calendario» (R6). Sin cambios de datos, API ni reglas (R7). Se verifica **renderizando
el mock y la app al mismo ancho y comparando sección por sección**.

## Contexto Técnico

**Lenguaje/Versión**: TypeScript + React 19. **Dependencias**: ninguna nueva.
**Almacenamiento**: N/A. **Pruebas**: Vitest + Testing Library y Playwright a 390/1280 px (más capturas del mock a
430/1024 px para la comparación); >90 %.
**Restricciones**: el mock manda salvo los mínimos de accesibilidad (4.5:1 texto, 3:1 puntos, 13 px); móvil y web son dos
diseños (`variant`); nombres accesibles únicos; textos del Principio I; ámbar = «por marcar», «sin registrar» = punteado.

## Verificación de la Constitución

- **I**: solo presentación; ningún color ni texto sugiere una evaluación médica (el rosa del diseño no es un color de
  alerta y se usa como identidad de un medicamento; «sin registrar» sigue sin ámbar). ✅
- **II, III, IV**: sin datos, API ni planes nuevos. ✅ **V**: sin librerías. ✅ **VI**: unitarias >90 % y E2E a 390/1280. ✅
- **Mocks**: se construye tal cual con las 12 desviaciones listadas (11 aprobadas + la 12 de R5, a confirmar). ✅

## Estructura del Proyecto

```text
frontend/src/
├── index.css                                   # --color-med-1…6 nuevos
└── features/consultations/
    ├── treatmentDays.ts (+ test)               # datos de los puntos (taken por medicamento y día), ranuras, nombre accesible con «dada/sin dar»
    ├── TreatmentCalendar.tsx (+ test)          # pastillas, puntos, día elegido, encabezado, leyenda, por variante
    ├── DayDoses.tsx (+ test)                   # lista del día con la apariencia calendar
    ├── DoseChip.tsx, doseStatus.ts             # apariencia `calendar` (anchos fijos, segundas líneas del diseño)
    ├── CalendarLegendCard.tsx (+ test)         # «Cómo leer el calendario» (solo web)
    └── ConsultationDetailPage.tsx              # monta la tarjeta en la columna derecha de la web
frontend/e2e/calendario-tratamiento.spec.ts, recorrer-tratamiento.spec.ts   # nombres nuevos de los días
frontend/e2e/comparar-calendario.spec.ts (local, no se commitea): capturas del mock y de la app a 430 / 1024 px
specs/005-identidad-visual-front-end/design-tokens.md, CLAUDE.md, frontend/CLAUDE.md, specs/007, specs/019/020 (nota), BACKLOG.md
```

## Seguimiento de Complejidad

Sin violaciones.
