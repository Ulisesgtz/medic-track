# Plan de Implementación: Rediseño de «Crecimiento»

**Rama**: `feature/065-rediseno-crecimiento` | **Fecha**: 2026-11-09 | **Spec**: [spec.md](spec.md)
**Entrada**: Especificación de `specs/065-rediseno-crecimiento/spec.md` y el mock `referencia/Crecimiento PediTrack.dc.html`

## Resumen

Se rehace la pantalla «Crecimiento» y su formulario tal como el mock de Claude Design, en dos diseños: teléfono a 390 px y web a 1280 px.

**La pantalla:**
- arriba, la última medida en grande;
- la caja de la medida del registro;
- la gráfica con pestañas Peso/Talla, un rango corto por omisión y una lectura fija con ‹ ›. La dibuja un SVG propio con las medidas del mock;
- la lista (teléfono) o la tabla (web) «Medidas anotadas».

**Los estados especiales:** sin medidas, sin tabla de la OMS, plan gratuito y solo lectura.

**El formulario:** campos con sufijo kg/cm y errores con un ícono «!».

**Alcance:** solo frontend en `src/features/growth/`, con cuatro tokens de color nuevos, `formatDateShortNoPad` y el cambio de `ageAt` para que diga años desde los 12 meses. Sin API ni migración (research R1).

## Contexto Técnico

**Lenguaje/Versión**: TypeScript 5 · React 19
**Dependencias Principales**: TanStack Query, React Router y Tailwind CSS v4. Ninguna nueva: la gráfica es un SVG propio.
**Almacenamiento**: N/A (la API de la spec 063 sin cambios)
**Pruebas**: Vitest + Testing Library (> 90 %), Playwright (`e2e/crecimiento.spec.ts`, Chromium, 390 y 1280)
**Plataforma Objetivo**: PWA (iPhone/Android y navegador de escritorio)
**Tipo de Proyecto**: aplicación web (frontend)
**Objetivos de Rendimiento**: la gráfica se dibuja con a lo más 500 puntos y 5 curvas de unos 25 nodos, sin biblioteca; el cambio de pestaña, de rango o de selección se ve al instante.
**Restricciones**:
- Principio I: ninguna frase ni color que evalúe.
- Colores solo por tokens (`noColorLiterals`).
- Dos diseños que nunca se mezclan.
- Áreas táctiles de 44 px y contraste de 4.5:1.
- Las medidas del mock.

**Escala/Alcance**: 1 página, 1 formulario y unos 8 componentes chicos.

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Solo se muestran valores, fechas, edades y las curvas publicadas. Sin percentil del hijo, tendencias ni colores de alerta. La prueba de redacción revisa todas las frases nuevas (incluida «hace N días»). El texto fijo dice «Tu pediatra es quien interpreta la gráfica». |
| II. Privacidad | ✅ | Nada sale del teléfono: el SVG se dibuja en el dispositivo y los datos solo van al API propio, como hasta hoy. |
| III. Captura de fotos | n/a | Sin fotos. |
| IV. Freemium sin perder datos | ✅ | El plan gratuito ve su lista completa y su última medida. Solo la gráfica es del plan completo; lo decide el servidor y la gráfica nunca se pide. |
| V. Piezas pequeñas | ✅ | La página se parte en componentes chicos y la lógica de la gráfica queda pura en `chartModel.ts`. |
| VI. Pruebas | ✅ | Vitest > 90 % en `features/growth/` y la E2E a 390 y 1280 actualizada. |

Sin violaciones. Se revisó de nuevo después del diseño y sigue igual.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/065-rediseno-crecimiento/
├── spec.md
├── plan.md              # este archivo
├── research.md          # R1–R11: qué se reusa, medidas del mock, tokens, escalas, accesibilidad
├── data-model.md        # el modelo de vista (sin datos nuevos)
├── quickstart.md        # cómo validar lado a lado y con pruebas
├── contracts/ui.md      # contrato de la pantalla: estados, textos y nombres accesibles
├── checklists/requirements.md
└── referencia/
    ├── Crecimiento PediTrack.dc.html   # el mock
    └── desviaciones.md                  # se escribe al implementar
```

### Código Fuente (raíz del repositorio)

```text
frontend/src/
├── index.css                         # + --color-line, --color-curve, --color-field-edge, --color-error, --color-grid
├── shared/date.ts                    # + formatDateShortNoPad
└── features/growth/
    ├── GrowthPage.tsx                # orquesta los estados A–F en los dos diseños
    ├── LatestCard.tsx                # «Última medida»
    ├── RegisteredBox.tsx             # «Al registrar a …»
    ├── ChartCard.tsx                 # pestañas, rango, lectura ‹ ›, SVG, selector Niña·Niño, nota OMS
    ├── ChartLockedCard.tsx           # estado E
    ├── MeasurementsList.tsx          # lista del teléfono
    ├── MeasurementsTable.tsx         # tabla de la web
    ├── GrowthChart.tsx               # el SVG del mock
    ├── chartModel.ts                 # puro: rangos, marcas, eje Y, escala, punto más cercano, curvas suavizadas
    ├── growthText.ts                 # frases del mock + sinceLine, kgText, cmText
    ├── growthAge.ts                  # ageAt pasa a años desde los 12 meses
    ├── GrowthFormPage.tsx            # G1/G2
    ├── growthForm.ts                 # mensajes del mock
    ├── (api.ts, hooks.ts, types.ts, GrowthSection.tsx sin cambios)
    └── *.test.ts(x)
frontend/e2e/crecimiento.spec.ts      # actualizado
specs/005-identidad-visual-front-end/design-tokens.md   # los tokens nuevos
```

**Decisión de Estructura**: se usa la carpeta de la funcionalidad que ya existe (`features/growth/`). `chartScale.ts` se cambia por `chartModel.ts`.

## Seguimiento de Complejidad

Sin violaciones que justificar.
