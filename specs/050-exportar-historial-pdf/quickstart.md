# Guía de validación: Exportar el historial a PDF (spec 050)

## Requisitos

- Backend local (`go run ./cmd/api`) con la base de desarrollo y `CLERK_SECRET_KEY`; frontend con `VITE_CLERK_PUBLISHABLE_KEY`.
- Una cuenta con plan completo (`UPDATE accounts SET plan = 'paid' …`) con un hijo con varias consultas, vacunas y alguna foto; y una cuenta gratuita.

## Escenarios

1. **Historial completo** — Historial del hijo → «Exportar a PDF» → «Todo el historial», Consultas y Cartilla → «Generar PDF». Esperado: avance por etapas, «Tu PDF está listo» con nombre, páginas, tamaño y periodo; el archivo abre con portada, consultas de la más reciente a la más antigua, cartilla, encabezado y pie en cada página.
2. **Rango y filtros** — Rango del 1 ene al hoy: solo esas consultas y la portada lo dice; la cartilla sale completa. Con filtros en el Historial: la opción «Usar los filtros del historial» muestra el resumen y el PDF trae solo esas consultas.
3. **Desde la Cartilla** — el panel abre con la cartilla encendida y las consultas apagadas.
4. **Fotos** — encender «Fotos…»: aparece el anexo y cada consulta con foto dice «Foto en p. N».
5. **Sin datos** — un rango sin consultas ni vacunas: «No hay registros en este periodo» y «Cambiar periodo».
6. **Plan gratuito** — el botón lleva «Plan completo» y abre el aviso; `POST /children/{id}/export` con esa sesión responde 422 `reason: "pdf_export"` sin datos.
7. **Cuidador** — una persona Cuidadora de una familia con plan completo puede exportar.
8. **Privacidad** — en la pestaña de red, al generar, solo hay peticiones al API de PediTrack y a los recursos de la app.
9. **Impresión** — imprimir en blanco y negro: las tomas marcadas, sin registrar y por venir se distinguen por forma.

## Comandos

```bash
cd backend && go test ./internal/historyexport/... ./internal/server/... -cover
cd frontend && npx vitest run src/features/pdfExport --coverage
cd frontend && npx playwright test e2e/exportar-pdf.spec.ts --project=chromium
```
