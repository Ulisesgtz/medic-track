# Investigación: Rebranding de los colores del calendario

## R1 — El diseño manda: se mide y se compara renderizando el mock al ancho del mock

**Decisión**: `referencia/Calendario PediTrack.dc.html` es el diseño de Claude Design. Su versión «standalone»
(`~/Downloads/Calendario PediTrack (standalone).html`, autocontenida) se abre con Playwright a 430 px (móvil) y 1024 px
(web), se captura, y se captura la app **con los mismos datos** (tres medicamentos, febrero, día 4 elegido) a los mismos
anchos; se comparan lado a lado sección por sección (encabezado, días de la semana, pastillas y puntos, día elegido,
leyenda, título del día, chips, tarjeta «Cómo leer»). Medidas del diseño (móvil / web): tarjeta radio 24, relleno 20×16 /
24; botones de mes 40 / 36 px, radio 12 / 10, borde 1 px `#cffafe`, fondo `#ecfeff`, flecha `#0e7490`; mes 20 / 18 px 900;
días de la semana 12 px 800 `#64748b` (aquí 13 px, desviación 5); celdas 54 / 62 px de alto, hueco 4 / 6 px; pastilla
radio 12, borde 1 px, número 16 / 15 px 800 `#04252b`; puntos 7 / 8 px con borde 2 px, hueco 3 / 4 px; día elegido fondo
`#04252b`, aro 2 px `#22d3ee`, número 900 blanco; leyenda círculo 26 / 22 px, número 13 / 12 px 900, nombre 14 / 13 px 800
`#1e293b` con `letter-spacing .02em`; divisor 1 px `#cffafe`; título del día 18 / 16 px 900; fila de toma: círculo 26 / 24 px,
nombre 14 px 800, chip de 130 / 160 px, relleno 8 / 7 px, radio 12, borde 1.5 px, hora 16 / 15 px 900 y segunda línea 12 px
700.

## R2 — Los puntos se derivan de las tomas del día; relleno = todas dadas

**Decisión**: `numbered()` guarda, por medicamento, las tomas **no canceladas** de cada día (`Map<día, Dose[]>`); el punto
de un medicamento en un día es `relleno` si todas esas tomas tienen `taken`, `vacío` si alguna no. `marksOn(día)` devuelve
`{ number, role, taken }` (el `role` de inicio/fin de la spec 020 sigue, ahora solo para el nombre accesible y las pruebas).

## R3 — Lugar fijo de cada punto

**Decisión**: la fila de puntos de un día es una cuadrícula de 3 columnas con una ranura **por medicamento de la
consulta**, en su orden; el medicamento sin toma ese día deja su ranura vacía (un `span` del mismo tamaño, invisible).
Con 1 a 3 medicamentos es una fila; con 4 a 6, dos. Así la posición identifica al medicamento aunque el color no se
distinga (los tres colores del diseño quedan a ΔE ≈ 8 entre sí en daltonismo) y el diseño no pierde su aspecto: con tres
medicamentos activos es exactamente el del mock.

## R4 — Colores

**Decisión**: `--color-med-1…6` = `#0e7490`, `#7c3aed`, `#db2777` (del diseño), `#2563eb`, `#475569`, `#78350f`
(propuesta aprobada). Contrastes medidos: blanco sobre cada uno ≥ 4.6:1 (rosa 4.60, el más bajo); los puntos sobre
`#ecfeff` ≥ 3:1 (rosa 4.42). Clases literales `bg-med-N` / `border-med-N` (Tailwind necesita el nombre entero). En el día
elegido los puntos son cian: relleno `#22d3ee`, vacío borde `#a5f3fc`.

## R5 — Chips de la lista del día: el diseño, sin perder los estados de la spec 013

**Decisión**: `DoseChip` gana una apariencia `calendar` (la de la lista del día; las tarjetas de los medicamentos no
cambian). Mapa del estado (derivado por el servidor) al diseño:

| Estado | Chip del diseño | Segunda línea |
|---|---|---|
| `taken` | verde `#ecfdf5` / `#10b981`, «✓ 16:32» | «dada» (sin hora: no se guarda, desviación 6) |
| `due` («por marcar») | ámbar `#fffbeb` / `#f59e0b` | «por marcar» |
| `unregistered` | punteado pizarra | «sin registrar» |
| `pending`, la primera del día elegido | punteado blanco `#cbd5e1` | «próxima» (desviación 7) |
| `pending`, las demás | punteado blanco | ninguna |
| `canceled` | el de la spec 016 | «cancelada» |

**Desviación 12 (nueva, a señalar al usuario)**: el diseño pinta en ámbar «sin registrar»; en la app **ámbar es «por marcar»
y «sin registrar» es punteado** (spec 013, Principio I: ámbar nunca es una advertencia y «sin registrar» no es un
reclamo). Se conserva la regla de la spec 013 y se usa la forma del diseño.
Anchos fijos 130 / 160 px. El nombre accesible del chip sigue siendo «Amoxicilina, 08:00» (único en pantalla).

## R6 — Tarjeta «Cómo leer el calendario» (solo web)

**Decisión**: componente `CalendarLegendCard` en la columna derecha de la web, bajo «Tratamiento activo»: «Punto relleno:
dosis dada», «Punto vacío: dosis sin dar» (desviación 8) y «Día dentro del tratamiento» (pastilla `#ecfeff`). Tarjeta blanca
radio 24, relleno 22, título 12 px 800 mayúsculas.

## R7 — Qué cambia y qué no

Se reescribe la presentación de `TreatmentCalendar` y `DayDoses` (y el chip en su apariencia de calendario); `treatmentDays.ts`
gana los datos de los puntos; `ConsultationDetailPage` agrega la tarjeta en la web. No cambian datos, API ni reglas ni las
tarjetas de medicamento.
