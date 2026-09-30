# Investigación: Calendario del tratamiento

## R1 — Todo se deriva en el frontend de lo que el detalle ya trae

**Decisión**: sin endpoint ni columna nueva. `ConsultationDetail.medications[].doses[]` ya trae `scheduledAt`, `taken`,
`status` y `endedAt` por medicamento; el calendario es una función pura de eso más el «hoy» local (`useLocalDay`).

**Justificación**: el detalle ya se refresca cada 60 s y se invalida al marcar una toma (`useDoseToggle`); lo que se
derive de él se mantiene al día solo. Los días se calculan con la hora local del navegador, igual que las tomas (specs
013/015): el servidor nunca adivina la zona.

**Alternativas**: un endpoint `GET /consultations/{id}/calendar` (duplica lo que ya viaja y reintroduce el problema de
zonas horarias); una librería de calendario (`react-day-picker` y similares: un selector de fecha, no un calendario con
marcas por medicamento; dependencia para ~120 líneas).

## R2 — Rango de un medicamento

**Decisión**: `medicationRange(medication)` = del día de su primera toma al día de su última toma; si tiene `endedAt`
(spec 016), termina en `min(último día, día de endedAt)`; si ese fin queda antes del primer día (se finalizó antes de que
empezara) el rango es **vacío** y el medicamento no marca ningún día, pero sigue en la leyenda. Los días intermedios sin
tomas (frecuencia de 48 h o más) **sí** llevan la marca: el rango es continuo, como pide el backlog («de inicio a fin»).

**Justificación**: un rango continuo responde «¿hasta cuándo le toca?»; la lista del día dice si ese día hay toma o no.

## R3 — Colores: seis, numerados, sin rojo, verde ni ámbar

**Decisión**: seis tokens `--color-med-1 … --color-med-6` en el bloque `@theme` de `src/index.css` y su tabla en
`design-tokens.md`. Candidatos de partida (se miden en la implementación, T002): índigo `#4338ca`, azul `#1d4ed8`, violeta
`#6d28d9`, fucsia `#a21caf`, verde azulado `#0f766e`, pizarra `#475569`. Se descartan: rojos y rosas (alerta médica,
Principio I), verde (`confirmed` = «tomada»), ámbar y naranja (`pending` = «por marcar»), cian (acción y marca de la app).
Requisitos: contraste ≥ 3:1 contra `canvas` y `surface` (elemento gráfico) y ≥ 4.5:1 del número blanco sobre la marca;
distinguibles entre sí con deuteranopia y protanopia (se comprueba simulándolas en el script de medición).

**Segundo indicador**: cada marca lleva el **número del medicamento** (1–6, por su orden en la consulta) y la leyenda
repite «1 Amoxicilina». Con más de 6 medicamentos los colores se repiten (`(n − 1) % 6 + 1`) y el número sigue siendo
único. Un número y no una inicial: «Amoxicilina» y «Ambroxol» comparten la A.

**Alternativas**: patrones (rayado/punteado) por medicamento — más difícil de leer en una celda de 44 px; colores
ilimitados generados — no garantizan contraste ni distinción.

## R4 — Componente propio, una cuadrícula de botones

**Decisión**: `TreatmentCalendar` dibuja el mes como cuadrícula de 7 columnas (lunes primero, `L M M J V S D`), una
`<button>` por día con el número y hasta 6 marcas numeradas pequeñas. Día seleccionado: `aria-pressed="true"`; hoy:
`aria-current="date"` y un anillo; fuera del tratamiento: atenuado pero legible (texto `slate-500` ≥ 4.5:1) y también
seleccionable (muestra «Ese día no hay tomas»). Nombre accesible de cada día: «30 de septiembre · 1 Amoxicilina, 2
Paracetamol» (sin marcas: solo la fecha). Flechas «‹ mes anterior» / «mes siguiente ›» (`min-h-11`) que solo llegan a los
meses con algún día del tratamiento (de cualquier medicamento); el título del mes es «septiembre 2026».

**Justificación**: sin librería, con las mismas reglas de los demás componentes (botones de 44 px, focus visible,
`cursor-pointer`). El mes inicial es el del día seleccionado al abrir (R5).

## R5 — Día seleccionado y lista del día

**Decisión**: al abrir, el día seleccionado es hoy si cae entre el primer y el último día de **cualquier** medicamento;
si no, el primer día. Tocar un día lo selecciona (y si es de otro mes, el calendario no cambia de mes: solo se puede tocar
lo que se ve). La lista del día (`DayDoses`) junta las tomas de todos los medicamentos de ese día, ordenadas por hora, cada
una con la marca numerada, el nombre del medicamento y el mismo chip de toma (`DoseChip`) con su estado y su marcar/
desmarcar; vacía dice «Ese día no hay tomas.». Un refresco del detalle conserva el día elegido.

**`DoseChip` se mueve** de `MedicationCard.tsx` a su propio archivo para compartirlo. Como la pantalla tendrá dos chips por
toma (el del medicamento y el de la lista del día), el de la lista lleva otro nombre accesible —«Amoxicilina, 08:00»— para
que «Toma de 08:00» siga siendo único: los selectores de las pruebas existentes (por subcadena) no cambian.

## R6 — Dónde va en cada diseño

**Decisión**: bloque nuevo «Calendario del tratamiento» **antes** de «Medicamentos»: en el móvil, una sección a ancho
completo (`px-6`); en la web, una tarjeta en la columna izquierda encima de los medicamentos. Móvil y web son dos árboles
(`useIsDesktop`), no clases `lg:`. Se conserva el selector «Día anterior / Día siguiente» de cada medicamento (spec); si
resulta redundante al ver las capturas se decide con el usuario.
