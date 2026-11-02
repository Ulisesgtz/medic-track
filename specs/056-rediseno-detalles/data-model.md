# Modelo de datos: Rediseño de las pantallas de detalle (spec 056)

**Sin migración, tablas ni campos nuevos.** Todo se deriva de las respuestas que ya existen (research R1).

## Vistas derivadas (frontend)

| Vista | De dónde | Reglas |
|---|---|---|
| «Hoy» del hijo | `childDay(overview, activities)` (spec 055) + las tomas del overview agrupadas con `groupByPeriod` | Tomas canceladas fuera; el estado es el `status` del servidor; las actividades solo activas |
| «Hoy» de «Mi día» | `personalDay(supplements, activities, paidPlan)` (spec 055) + las tomas personales agrupadas | Igual |
| Chip de toma | `status`, `taken`, `takenBy` (con `mine`) y el día elegido | «Marcar» / «✓ HH:MM» propio / candado + «✓ HH:MM · por Nombre» ajeno / «sin registrar» punteado / «cancelada» tachada / **«programada»** = `pending` de un día posterior a hoy, **marcable** (FR-018) |
| Resumen de «Datos de la consulta» | `photoBase64`, `symptoms`, `notes` | «Foto · 2 síntomas · notas»; solo las partes que existen |
| Semana del calendario | `weekOf(día elegido)` | Lunes a domingo; las flechas no salen del rango del tratamiento |
