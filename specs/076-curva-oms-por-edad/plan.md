# Plan de Implementación: La gráfica de crecimiento solo hasta la edad de la curva de la OMS

**Rama**: `feature/076-curva-oms-por-edad` | **Fecha**: 2026-11-19 | **Especificación**: [spec.md](spec.md)

## Resumen

El servidor deja fuera de la respuesta de la gráfica las medidas posteriores a la edad máxima de la curva de cada indicador
(peso 10 años, talla 19; por fecha de calendario) y dice cuántas quedaron fuera (`limits`). La pantalla de «Crecimiento» se
ajusta al mock: eje hasta esa edad, nota fija, lectura solo de lo dibujado, bloque «sin gráfica» por pestaña o para la tarjeta
entera, y rangos según la edad. Anotar y la lista no cambian. Detalle en [research.md](research.md).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.2; TypeScript + React 19.
**Dependencias Principales**: `internal/growth`, `httpx.Responder`; `features/growth/`. Ninguna nueva.
**Almacenamiento**: sin migración ([data-model.md](data-model.md)).
**Pruebas**: Go (unidad + repositorio), Vitest > 90 %, Playwright a 390 y 1280 px con `scripts/e2e-local.sh`.
**Plataforma Objetivo**: API en Railway; PWA en Cloudflare Pages.
**Tipo de Proyecto**: aplicación web.
**Restricciones**: Principio I (sin juicios; no comparar contra una curva que terminó); mock tal cual; dos diseños.
**Escala/Alcance**: 1 respuesta ampliada; `ChartCard`/`chartModel`/`growthText` y pruebas.

## Verificación de la Constitución

| Principio | ¿Cumple? | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Deja de dibujar donde la referencia no existe; anotar sigue igual; prueba de redacción. |
| II. Privacidad | ✅ | Sin datos nuevos ni en direcciones. |
| III. Stack fijo | ✅ | Go + React. |
| IV. Freemium | ✅ | Sin cambio de plan. |
| V. Simplicidad | ✅ | Corte por fecha en el servidor; sin migración. |
| VI. Pruebas | ✅ | Bordes 119/120/121 y 227/228/229 meses por fecha; E2E de A, B y C. |
| Reglas del repo | ✅ | `Responder`, Swagger, mock tal cual, web y teléfono separados, mapas `CLAUDE.md`. |

## Estructura del Proyecto

```text
backend/internal/growth/   # límites por indicador, corte en Chart, limits en la respuesta, pruebas
frontend/src/features/growth/  # types, ChartCard, chartModel, growthText, GrowthCards, pruebas
frontend/e2e/crecimiento.spec.ts
specs/076-curva-oms-por-edad/referencia/desviaciones.md
```

## Pendientes del dueño

Ninguno técnico (sin migración). Aprobar las desviaciones que queden.
