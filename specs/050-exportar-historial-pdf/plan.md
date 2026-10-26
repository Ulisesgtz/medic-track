# Plan de Implementación: Exportar el historial a PDF

**Rama**: `feature/050-exportar-historial-pdf` | **Fecha**: 2026-10-25 | **Spec**: [spec.md](spec.md)
**Entrada**: Especificación de `specs/050-exportar-historial-pdf/spec.md`; mock en `referencia/`.

## Resumen

Un endpoint de solo lectura, `POST /children/{childId}/export`, entrega en una respuesta el texto del historial (hijo, consultas del periodo con su registro de tomas, tratamiento en curso, próximas citas y la cartilla completa) después de que el servidor decide el plan (422 `pdf_export` sin datos para una familia gratuita). El PDF se arma **en el navegador** con `@react-pdf/renderer` 4.9.0, cargado solo al tocar «Generar PDF»; las fotos, si se piden, llegan una por una (`GET /consultations/{id}/photo` nuevo y la de la cartilla, que ya existe). El panel (hoja en el teléfono, diálogo en la web) sigue el mock entregado, con sus seis estados, y se abre desde el Historial y la Cartilla. La rama ya trae el cambio del CI (E2E en cinco jobs).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.3 (backend), TypeScript + React 19 (frontend)
**Dependencias Principales**: chi, pgx (backend); `@react-pdf/renderer` 4.9.0 y `@fontsource/figtree` 5.3.0 nuevas (frontend, cargadas con `import()`); TanStack Query, Tailwind v4
**Almacenamiento**: PostgreSQL, solo lectura (sin migración)
**Pruebas**: `go test` contra la base real; Vitest + Testing Library; Playwright (Chromium, 390 y 1280 px)
**Plataforma Objetivo**: PWA en teléfonos (iOS Safari, Android Chrome) y navegador de escritorio
**Tipo de Proyecto**: aplicación web (backend + frontend)
**Objetivos de Rendimiento**: PDF de 20 consultas sin fotos en < 15 s en un teléfono de gama media (SC-001); la biblioteca no se descarga hasta generar
**Restricciones**: el PDF no pasa por terceros; criterios en el cuerpo, nunca en la dirección ni en `error_logs`; textos sin evaluación (Principio I); dos diseños nunca mezclados
**Escala/Alcance**: 1 endpoint nuevo + 1 lectura de foto; 1 carpeta de frontend (`features/pdfExport/`); 2 puntos de entrada

## Verificación de la Constitución

| Principio | Cómo se cumple |
|---|---|
| I. Registra, nunca interpreta | Solo conteos y fechas de lo registrado («16 de 18 tomas marcadas»); sin porcentajes, «faltantes», rangos ni rojo; todos los textos en `exportText.ts` con prueba de redacción |
| II. Privacidad | PDF armado en el navegador, sin terceros (fuentes servidas por la app); aviso antes de compartir; criterios en el cuerpo; nada del pedido en `error_logs` |
| III. Stack fijo | Go + React PWA + PostgreSQL; la biblioteca es una dependencia de frontend |
| IV. Freemium disciplinado | Exportar es del plan completo (aprobado en el backlog); nunca bloquea ver ni marcar lo ya registrado |
| V. Simplicidad | Un endpoint de lectura que reutiliza búsqueda, detalle, vacunas y citas; sin migración ni almacenamiento del PDF |
| VI. Cobertura | > 90 % en el paquete nuevo y en la carpeta del frontend; E2E del flujo a 390 y 1280 px |

**Resultado**: sin violaciones. Se re-evaluó después del diseño (Fase 1): igual.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/050-exportar-historial-pdf/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── referencia/ (mock del documento y desviaciones.md)
```

### Código Fuente

```text
backend/
├── internal/historyexport/      # nuevo: Service (pedido → datos del documento), Handler, pruebas
├── internal/consultation/       # PlanLimitPDFExport, detalle sin foto, GET /consultations/{id}/photo
└── internal/server/router.go    # POST /children/{childId}/export (seesChild), GET /consultations/{id}/photo (seesConsultation)

frontend/
├── src/features/pdfExport/
│   ├── exportText.ts            # todas las frases (+ prueba de redacción)
│   ├── api.ts, useExport.ts     # pedido, fotos una por una, cancelar
│   ├── ExportPanel.tsx          # hoja (teléfono) / diálogo (web), seis estados
│   ├── ExportEntry.tsx          # botón (o botón con «Plan completo» → aviso del plan)
│   ├── document/                # componentes del PDF (portada, consultas, cartilla, anexo) y funciones puras
│   └── share.ts                 # compartir o descargar
├── src/features/consultations/HistoryPage.tsx        # monta ExportEntry
├── src/features/vaccinations/VaccinationCardPage.tsx # monta ExportEntry (cartilla encendida)
└── e2e/exportar-pdf.spec.ts
```

**Decisión de Estructura**: aplicación web; un paquete backend nuevo que compone repositorios existentes y una carpeta de frontend propia, con el documento separado del panel para probarlo con los tres casos del mock.

## Seguimiento de Complejidad

Sin violaciones que justificar.
