# Especificación: Resumen del detalle del hijo (tomas de hoy y tratamiento activo)

**Rama**: `feature/005b-alinear-mock-escritorio` | **Origen**: mock "Escritorio · Home con detalle" (sesión 2026-09-18)
**Depende de**: `specs/004-detalle-consulta-hijo/` (consultas, medicamentos, tomas) y `specs/005-identidad-visual-front-end/` (sistema visual)

## Contexto

El mock de escritorio del detalle del hijo muestra, además de la lista de consultas, tres tarjetas de
resumen (**Tomas de hoy**, **Consultas**, **Tratamiento activo**), un subtítulo por consulta ("Fiebre y tos ·
2 medicamentos") y un panel **Tomas de hoy** donde se marca cada toma. Ninguno de esos datos existía en la
API: la lista de consultas solo traía doctor y fecha, y no había forma de pedir las tomas de un hijo.

## Alcance

- Nuevo `GET /children/{childId}/overview?from=&to=` (ver `contracts/get-overview.md`).
- `GET /children/{childId}/consultations` suma `symptoms` y `medicationCount` a cada consulta.
- `POST /children/{childId}/consultations` acepta `utcOffsetMinutes` (opcional) para leer el horario de inicio
  de cada medicamento en la zona horaria del padre.
- Frontend: tarjetas, panel "Tomas de hoy" (marcar/desmarcar en el lugar) y subtítulo por consulta.

Fuera de alcance: notificaciones o recordatorios de tomas, editar consultas o medicamentos, hacer opcional la
foto de la receta.

## Requisitos funcionales

- **FR-001**: El detalle del hijo DEBE mostrar tres tarjetas: *Tomas de hoy* (cantidad sin marcar), *Consultas*
  (cantidad y "desde AAAA" de la primera) y *Tratamiento activo* (medicamento y "termina el DD mmm").
- **FR-002**: "Hoy" es el día calendario **local del padre**. El cliente envía el rango `[from, to)`; el servidor
  no adivina zonas horarias. El rango no puede exceder 48 horas.
- **FR-003**: El panel *Tomas de hoy* DEBE listar las tomas del rango ordenadas por hora, cada una con un chip
  "Marcar" (ámbar: el padre no la ha marcado, nunca una alerta médica) o "Tomada" (verde). Tocar el chip
  marca o desmarca la toma, sin restricción de fecha (FR-016 de la 004).
- **FR-004**: *Tratamiento activo* es el medicamento cuya **última toma programada** queda más lejos en el
  futuro; si otros medicamentos también tienen tomas por delante se indica "+N". Se deriva **solo del
  calendario de tomas**; no interpreta ningún dato médico (Principio I). Sin tomas por delante: "Ninguno".
- **FR-005**: Cada consulta del listado DEBE mostrar un subtítulo `síntomas · N medicamento(s)`; una consulta
  sin medicamentos dice "sin receta". Los síntomas vacíos se omiten.
- **FR-006**: El horario de inicio de cada medicamento ("08:00") DEBE leerse en la zona horaria del padre
  (`utcOffsetMinutes`, entre -840 y 840). Sin ese campo se lee como UTC (comportamiento anterior).
- **FR-007**: Con el resumen sin cargar o con error, las tarjetas muestran "—" y el panel un mensaje; la lista de
  consultas sigue funcionando.
- **FR-008**: Todo control del panel mide al menos 44 px de alto (FR-009 de la 005) y cada chip tiene nombre
  accesible completo ("Marcar como tomada: 16:00 Amoxicilina").

## Decisiones y supuestos

- **Zona horaria (corrección)**: hasta la 004 el horario de inicio se guardaba como si fuera UTC, así que un
  padre en México que escribía "08:00" veía 02:00. Ahora el cliente manda su desfase UTC al registrar la
  consulta y las tomas quedan como instantes reales. Las consultas ya guardadas (solo datos de prueba, la app
  no está desplegada) conservan el horario anterior.
- El desfase se toma en la fecha de la consulta; una consulta que cruce un cambio de horario de verano
  conserva el mismo desfase para todas sus tomas (México ya no tiene horario de verano).
- "Sin receta" solo aparece si una consulta no tiene medicamentos; hoy la spec 004 exige al menos uno (FR-015),
  así que el estado existe en la interfaz pero no se alcanza.
- Tarjeta *Tomas de hoy*: ámbar si hay tomas sin marcar; verde suave "todas marcadas" si todas están tomadas;
  neutra "sin tomas hoy" si no hay ninguna.

## Criterios de éxito

- **SC-001**: La pantalla en escritorio (1240 px) coincide con el mock: mismas secciones, mismo orden y mismos
  textos, con la barra lateral del hijo activo.
- **SC-002**: Marcar una toma desde el panel actualiza la tarjeta *Tomas de hoy* sin recargar la página.
- **SC-003**: Un padre en UTC-6 que registra "08:00" ve "08:00" en el panel y en el detalle de la consulta.
