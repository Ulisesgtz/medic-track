# Hora fija y selector de hora — mock de Claude Design y desviaciones (2026-10-12)

Diseño entregado: `Hora fija y selector de hora PediTrack.dc.html` (proyecto «Logo PWA para aplicación»), que usa `ActividadForm`,
`ActividadTarjeta`, `ActividadDetalle`, `CitaCampos` y `TimeField`. Se hizo en `feature/042-hora-fija-selector-mock`; antes de eso la
spec 036 había construido el modo y el selector **sin mock**, con el sistema visual.

## Lo que se adoptó tal cual

**`TimeField` (`shared/ui/TimeField.tsx`)**
- Campo de 148 px: «Elegir hora» (16 px, 500, slate) o la hora (17 px, 800, tinta), flecha `▼`/`▲` en lugar del reloj; abierto: borde de 2 px
  en tinta y fondo `hint`; con error: borde de 2 px `red-700`.
- Panel: `top` 56 px, borde de 1.5 px `hint-border`, radio 18, sombra, ancho **del ancho de su tarjeta** (`panelWidth`: 314 en el móvil y 372 en la
  web por omisión; 306 la hora de la cita en el móvil, 270 con 4 columnas el aviso en el móvil), `cols` 6 o 4, `align` `start`/`end`.
- «Hora» y «Minutos» en 13 px 800, con la hora elegida en acción a la derecha del primero (`10:—`, `—:—` mientras no hay nada).
- El botón elegido: fondo y borde de acción, texto blanco, **subrayado y con ✓** (segundo indicador además del color). Los minutos dicen
  `00`, `05`… (ya no `:00`). «Listo» de contorno, alineado a la derecha.
- **Comportamiento**: sin valor, la hora **espera sus minutos** (el panel dice `10:—` y sigue abierto; el valor se guarda al elegir los minutos,
  que además lo cierran). Cerrar de otra forma («Listo», Escape, tocar fuera) con solo la hora elegida vale `:00`. Con valor, cambiar la hora
  cambia el valor al instante. Un minuto elegido antes que la hora espera a la hora.

**`ActividadForm`, modo «A una hora fija»**
- «Cuándo se hace» son **dos tarjetas de opción** con su ejemplo («Por ejemplo, tomar agua cada hora.» / «Por ejemplo, práctica de fut a las
  17:00.»), no un control segmentado; «Cada cuánto» del suplemento usa las mismas tarjetas (`OptionCards`).
- En «A una hora fija» el orden es **Días → Horas**; «Días» dice «Todos los días» / «Ciertos días de la semana» (en «Varias veces al día», «Ciertos
  días»). «Horas»: las filas (el error bajo **su** fila), «+ Agregar hora» (en el suplemento sigue «+ Agregar otra hora», como su diseño),
  «De una a seis horas.» / «Ya son seis horas, el máximo.» y la frase **«Martes y jueves a las 17:00.»** que repite lo elegido.
- «Horario del día» en dos columnas; «Hasta las» cuelga del borde derecho.

**`ActividadTarjeta` y `ActividadDetalle` a hora fija**: sin conteo y **sin barra** (una práctica tiene una toma al día): «Próxima: hoy, 17:00» (o
«mañana, 07:00», «mar 13 oct, 17:00»), «Última: hoy, 07:05», «✓ Realizado» (contorno en la lista, sólido en el detalle) mientras haya una toma de hoy
sin marcar, «✓ Hecha hoy» al terminar; el detalle trae las cajas «Próxima» (con el día debajo de la hora) y «Última marcada», «No quedan avisos hoy.» y
«Quitar la última marca». El servidor ahora manda `nextDose` **siempre** para una actividad a hora fija activa (antes solo sin tomas hoy), para poder
decir cuándo es la siguiente aunque la de hoy ya esté marcada.

## Desviaciones (cerradas el 2026-10-13, spec 043)

El dueño pidió cerrarlas todas en la spec 043: la 1 y la 6 se hicieron; la 2, 3, 4 y 5 se aceptan como están.

1. **«Última» de otro día.** El diseño del detalle dice «Última marcada 17:10 · mar 6 oct» (la de la vez anterior). El servidor solo manda las tomas de
   hoy, así que la caja muestra la de hoy o «—». **Hecho (spec 043)**: el servidor manda `lastDone` (la toma marcada más reciente, de cualquier día) para una actividad a hora fija y la tarjeta y el detalle dicen «Última: por Ana, jue 1 oct, 17:10».
2. **«Última» en la familia.** El diseño de la tarjeta dice «Última: hoy, 07:05»; con otra persona se escribe «Última: por Ana, hoy, 07:05» (la regla
   «por Ana» de la spec 032).
3. **Fechas.** El diseño dibuja «8 oct 2026» como texto; se mantiene el selector nativo de fecha (desviación ya aprobada de la spec 035).
4. **Ancho del panel.** El diseño usa el ancho interior de cada tarjeta; aquí son constantes por contexto (314/372, 306, 270). Si la tarjeta cambia de
   relleno, el panel no la sigue solo.
5. **El error del campo** (`TimeField` con `invalid`): el mensaje de error lo escribe cada formulario bajo el campo, no el campo.
6. **La barra lateral del diseño dice «Inicio»** (Inicio · hijo · Personal), que aún no existe (el inicio sigue titulándose «Tus hijos» y la barra no lo
   lleva). El enlace «← Inicio» se adoptó el 2026-10-12 y **la barra lateral web ganó «Inicio» el 2026-10-13** (spec 043); el título del inicio sigue siendo «Tus hijos».
