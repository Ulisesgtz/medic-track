# Investigación: Tomas "sin registrar" automáticas

Decisión / Justificación / Alternativas para cada punto técnico de la spec 013.

## R1. La regla: "llegó la siguiente toma" = su hora + la frecuencia

**Decisión**: una toma está **sin registrar** si no está marcada y `ahora >= hora de la toma + frecuencia del
medicamento`. Está **por marcar** si no está marcada, su hora ya llegó y aún no llega ese momento; **pendiente** si su
hora no ha llegado; **tomada** si está marcada.

**Justificación**: las tomas de un medicamento se generan todas juntas, separadas exactamente por su frecuencia
(`generateDoseSchedule`, spec 004), así que la hora de la siguiente toma siempre es la hora de esta más la frecuencia, y
para la última es justo "cuando tocaría la siguiente" (FR-002). Una sola fórmula cubre ambos casos sin buscar la toma
siguiente.

**Alternativas**: buscar la toma siguiente en la base (misma respuesta, más costo y un caso especial para la última);
un límite fijo de horas (lo descartó el usuario).

## R2. Estado derivado y calculado en el servidor, no guardado

**Decisión**: sin columna nueva. El backend calcula el estado de cada toma con su propio reloj al responder y lo manda
como `status: "pending" | "due" | "taken" | "unregistered"` en cada toma de `GET /consultations/{id}`, `POST` de
consulta, `PATCH` de toma y `GET /children/{id}/overview`. El frontend deja de decidir con su reloj si una toma "ya
pasó".

**Justificación**: FR-003/FR-004 piden el mismo estado en todos los dispositivos y la hora real; calcularlo en un solo
lugar con el reloj del servidor lo garantiza. Derivarlo evita un proceso que actualice filas cada minuto y deja la marca
(`taken`) como el único dato que cambia (spec 004, FR-016). Desmarcar una toma vieja la regresa sola a "sin registrar"
(FR-006) porque el estado se recalcula.

**Alternativas**: columna `status` actualizada por un proceso periódico (más piezas, estados que pueden quedar
desfasados); calcularlo en el frontend (depende del reloj del teléfono, contra FR-004).

## R3. Que la pantalla cambie sola: volver a pedir los datos cada 60 s

**Decisión**: las consultas de TanStack Query del detalle de la consulta y del overview (bloque/panel del día y chips del
home) se vuelven a pedir cada 60 s mientras la pantalla está visible (`refetchInterval: 60_000`,
`refetchIntervalInBackground: false`), además de al volver a la app (ya ocurre).

**Justificación**: cumple FR-011 ("a más tardar en un minuto") con el estado calculado en el servidor (R2), sin reloj
propio en el cliente. El costo es una petición pequeña por minuto por pantalla abierta, aceptable en el MVP (Principio V).

**Alternativas**: mandar `unregisteredAt` y recalcular en el cliente con un desfase contra la hora del servidor (evita
peticiones, pero duplica la regla y agrega manejo del reloj); push del servidor (fuera de lugar para esto).

## R4. Recordatorios: nunca para una toma sin registrar

**Decisión**: `ClaimDueDoses` (spec 011) agrega la condición
`d.scheduled_at + make_interval(hours => m.frequency_hours) > $1`.

**Justificación**: la ventana de los recordatorios es de 60 min; con un medicamento cada hora, una toma podía reclamarse
justo cuando ya está sin registrar (o si el backend estuvo detenido y se reanuda). La condición garantiza FR-010 en el
mismo lugar donde se decide avisar.

## R5. "Tomas de hoy", panel del día y home (aclaración: opción A)

**Decisión**:
- "Sin marcar" = tomas de hoy no marcadas y no sin registrar (incluye las pendientes del día, como hoy).
- Bloque móvil: `"2 sin marcar · 1 sin registrar · Amoxicilina"`; si no queda nada sin marcar pero hay sin registrar:
  estado "Sin tomas pendientes" (menta) con una línea `"1 sin registrar"`, sin botón. "Marcar tomas" marca solo las sin
  marcar.
- Panel web: el `SummaryCard` "Tomas de hoy" cuenta las sin marcar, y su línea dice `"sin marcar · 1 sin registrar"`
  cuando hay; cada toma sin registrar del panel usa el estilo nuevo con el texto "Sin registrar".
- Tarjeta del hijo (home): el chip "N tomas hoy" no cuenta las sin registrar.

## R6. El chip "Sin registrar"

**Decisión**: fondo `surface`, **borde punteado** `slate-400` de 1.5 px, la hora en `slate-700` y debajo, en 11 px,
el texto "sin registrar" (`slate-600`). Mismo tamaño, área táctil (≥ 44 px), foco y comportamiento que los demás chips.
Accesibilidad: el nombre del botón sigue fijo ("Toma de 08:00", estado en `aria-pressed`, regla de `frontend/CLAUDE.md`)
y el estado se anuncia con `aria-describedby` apuntando al texto "Sin registrar". En el panel web el botón dice "Sin
registrar" en lugar de "Marcar".

**Justificación**: se distingue sin color por el borde punteado y el texto (FR-007, SC-005); sin rojo (no es alerta
médica) ni ámbar ("por marcar"); `slate-600/700` sobre blanco superan 4.5:1.

## R7. Pruebas

- Backend: tabla de casos de la función de estado (antes de su hora, justo en su hora, justo antes y justo en hora +
  frecuencia, marcada), `status` en detalle, overview y `PATCH` (desmarcar una toma vieja → `unregistered`), y
  `ClaimDueDoses` sin tomas sin registrar.
- Frontend: chip por estado, bloque/panel/tarjeta con conteos y "Marcar tomas" sin las sin registrar, `refetchInterval`.
- E2E (390 y 1280 px): consulta con fecha de ayer (sus tomas ya sin registrar) → chip "sin registrar", marcarla y
  desmarcarla; bloque del día. Evitar depender de la hora exacta de la corrida.
