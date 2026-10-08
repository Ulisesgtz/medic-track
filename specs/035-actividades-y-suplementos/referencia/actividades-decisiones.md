# Suplementos y Actividades por separado — decisiones y desviaciones (de Claude Design)

Copia de `repo-pr/specs/005-identidad-visual-front-end/actividades-decisiones.md` del proyecto de Claude Design
(`https://claude.ai/design/p/f4e28757-d885-471d-b5b9-6e6ca094449a`), 2026-10-08. Mock: `Actividades PediTrack.dc.html` (+ `SuplementoTarjeta`, `ActividadTarjeta`,
`RegistroSeccion`, `SuplementoDetalle`, `ActividadDetalle`, `ActividadForm`; se vuelven a bajar con `DesignSync get_file`). Hoy en el mock: jueves 8 oct, 14:30.
Cada punto queda **pendiente de aprobación**.

## A. Tokens

Sin tokens nuevos: `ink`, `ink-soft`, `ink-muted`, `ink-edge`, `action`, `bright`, `bright-soft`, `confirmed`, `canvas`, `surface`, `hint`, `hint-border`, `hint-edge`,
`body`, `calendar-text`, `med-1`; `pending*` solo en el chip de toma sin marcar; Tailwind `slate-100/300/500/600`, `red-700`/`red-50` (errores). Diálogo `bg-ink/70`.

## B. Desviaciones y tratamientos nuevos

1. **`RegistroSeccion`** (`kind`: suplemento/actividad; `scope`: hijo/personal) reemplaza `SuplementosSeccion` y `MisSuplementosSeccion`; en el hijo, Suplementos primero y Actividades debajo, separadas por línea `hint-border` de 2 px.
2. **Lo personal: dos pantallas** («Mis suplementos» y «Mis actividades»), cada una con su entrada en «Personal» de la barra lateral web.
3. **Inicio, «Personal · solo lo ves tú»**: «Mis suplementos» («Tus tomas de hoy») y «Mis actividades» («Tus actividades de hoy»: fila con «N de M hechas hoy · Próxima: HH:MM», barra de 6 px y «Realizado» de contorno de 44 px; las que hoy no tocan no aparecen).
4. **`SuplementoTarjeta`**: nombre y estado → «Todos los días · 6 tomas» → fechas → línea `hint-edge` → «2 de 6 tomas hoy» (22 px/900) → barra → chips (rejilla `auto-fill` de 104 px). Estados masculinos: Activo, Pausado, Terminado.
5. **`ActividadTarjeta`**: nombre y estado → regla («Cada hora, de 08:00 a 20:00») → días y fechas → «6 de 13 hechas hoy» → barra → «Próxima» y «Última» → «✓ Realizado» de contorno. Sin chips, horas ni calendario. Propias: la última solo lleva la hora. Todas marcadas: se quita el botón y «Próxima» dice «Sin más avisos hoy».
6. **«Realizado» de contorno en listas y sólido en el detalle**; en la actividad pausada el sólido es «Reanudar» y no hay «Realizado».
7. **Barra del día**: pista `hint-edge` de 8 px (6 en el inicio), relleno `action` (4.6:1), nunca cambia de color, `role="progressbar"` con el texto «N de M» al lado.
8. **Se quita el calendario del detalle del suplemento**: tarjeta «Hoy · jue 8 oct» con «2 de 6 tomas hoy» (34 px/900), barra y tomas marcables; las horas se escriben en «Horas».
9. **Detalle de la actividad**: tarjeta «Hoy» con cuenta, barra, casillas `hint` «Próxima» y «Última marcada» (con «por Ana» solo en las de un hijo) y «Realizado»; datos «Cada cuánto», «Días», «Avisos al día», «Fechas», «Agregada por». **Nuevo «Quitar la última marca»**.
10. **El formulario de suplemento sigue siendo `RutinaForm`** sin «Cada cierto número de horas»; props `timesLabel` («Horas»), `timesHelp` («De una a seis horas.» / «Ya son seis horas, el máximo.») y `timesFull`.
11. **Sin valores por omisión en las horas** (campos de hora y «Cada» vacíos; la fecha de inicio sí viene con hoy).
12. **`ActividadForm`**: «Horario del día» («Desde las» / «Hasta las»), «Cada cuánto» («Cada [número]» + minutos/horas), «Días», «Fecha de inicio», «Fecha de fin» («Sin fin» / «Hasta una fecha»), «Nota». Sin placeholders; vista previa `hint`: «Con esto, cada martes y jueves hay 4 avisos: el primero a las 09:00 y el último a las 18:00.».
13. **«Tus avisos» en todos los detalles**, también los personales (subtítulo de actividad: «A cada hora programada, en este dispositivo.»).
14. **Aviso push con botón de acción** (`n.actions`).
15. **Vacío del hijo con su nombre** («Mateo aún no tiene suplementos / actividades»); personal «Aún no tienes …»; botón «+ Agregar suplemento / actividad», de contorno en el hijo y sólido en lo personal.
16. **«← Tus hijos» → «← Inicio»** (propuesta pendiente de rutinas personales B2). *No se adopta en esta entrega* (ver BACKLOG).
17. **Plan caducado**: bloque `hint` «Tu cuenta está en el plan gratuito» por sección, sin ámbar; todo se ve y se marca, incluido «Realizado»; en el detalle solo queda «Finalizar …».
18. **Actividad de 24 avisos**: misma altura que una de 4 («Cada hora, de 00:00 a 23:00», «9 de 24 hechas hoy», «Avisos al día: 24»).

## C. Textos finales

**Secciones**
- Títulos: «Suplementos» / «Actividades» (hijo) · «Mis suplementos» / «Mis actividades». Cuenta: «3 activos» / «2 activas». Botones: «+ Agregar suplemento» · «+ Agregar actividad». Listas: «Activos» / «Pausados y terminados» · «Activas» / «Pausadas y terminadas».
- Vacío, hijo: «Mateo aún no tiene suplementos» / «Para lo que Mateo toma a horas fijas. Cada toma aparece en «Tomas de hoy» para marcarla, y cada persona de la familia puede recibir sus avisos.» · «Mateo aún no tiene actividades» / «Para lo que Mateo hace varias veces al día, desde una hora hasta otra. Cada vez se marca con «Realizado», y cada persona de la familia puede recibir sus avisos.»
- Vacío, personal: «Aún no tienes suplementos» / «Para lo que tomas a horas fijas. Cada toma aparece en el inicio para marcarla y, si lo activas, te llega un aviso.» · «Aún no tienes actividades» / «Para lo que haces varias veces al día, desde una hora hasta otra. Cada vez se marca con «Realizado» y, si lo activas, te llega un aviso.»
- Privacidad: «Solo tú ves estos suplementos y solo a ti te llegan los avisos.» · «Solo tú ves estas actividades y solo a ti te llegan los avisos.»
- Cuidador: «Los suplementos los agrega y edita un Tutor. Tú puedes marcar las tomas y elegir tus avisos.» · «Las actividades las agrega y edita un Tutor. Tú puedes marcar «Realizado» y elegir tus avisos.»
- Tope: «Ya tienes 10 suplementos activos» / «Es el máximo para Mateo. Para agregar otro, pausa o finaliza uno de los de abajo; los pausados no cuentan.» / [Ir a los suplementos activos] · «Ya tienes 10 actividades activas» / «Es el máximo para Mateo. Para agregar otra, pausa o finaliza una de las de abajo; las pausadas no cuentan.» / [Ir a las actividades activas]. En lo personal empieza con «Es el máximo.».
- Plan (aviso compacto): «Suplementos» / «Lo que Mateo toma a horas fijas, con cada toma para marcar y avisos para la familia.» · «Actividades» / «Lo que Mateo hace varias veces al día, desde una hora hasta otra, marcado con «Realizado» y con avisos para la familia.» · Personal: «Tus suplementos» / «Lo que tomas a horas fijas, con cada toma para marcar y avisos solo para ti.» · «Tus actividades» / «Lo que haces varias veces al día, desde una hora hasta otra, marcado con «Realizado» y con avisos solo para ti.»
- Plan caducado: «Tu cuenta está en el plan gratuito» / «Los suplementos siguen aquí y sus tomas se pueden marcar. Para agregar, editar o reanudar uno se necesita el plan completo.» · «Las actividades siguen aquí y se pueden marcar con «Realizado». Para agregar, editar o reanudar una se necesita el plan completo.»

**Tarjetas**
- Suplemento: «Todos los días · 6 tomas» · «2 de 6 tomas hoy» · «Hoy no le toca. La siguiente es mañana, vie 9 oct, a las 09:00.» (propio: «Hoy no toca…») · «Pausado desde el 2 oct. Mientras esté pausado no genera tomas ni avisos.» · «Terminado el 30 sep · 12 de 14 tomas» · «Ver suplemento →».
- Actividad: «Cada hora, de 08:00 a 20:00» · «Cada 30 min, de 09:00 a 18:00» · «6 de 13 hechas hoy» · «Próxima: 15:00» · «Última: por Ana, 14:05» (propia: «Última: 14:02») · «Sin más avisos hoy» · [✓ Realizado] · «Pausada desde el 5 oct. Mientras esté pausada no llegan avisos. Lo marcado se conserva.» · «Terminada el 30 sep» · «Ver actividad →».

**Inicio**: «Personal · solo lo ves tú» · «Tus tomas de hoy» · «Tus actividades de hoy» · «Ver mis suplementos →» / «Para lo que tomas tú a horas fijas.» · «Ver mis actividades →» / «Para lo que haces tú varias veces al día.»

**Formulario de suplemento**: «Agregar suplemento» / «Editar suplemento» · «Cada cuánto»: «Todos los días» (A una o varias horas fijas.) / «Ciertos días de la semana» (Eliges los días y las horas.) · «Horas» · [Guardar suplemento] / [Guardar cambios] · «Los cambios cuentan desde la siguiente toma. Las tomas ya marcadas no cambian.»

**Formulario de actividad**: «Agregar actividad» / «Editar actividad» · «Nombre» · «Horario del día»: «Desde las» / «Hasta las» · «Cada cuánto»: «Cada [ ] minutos / horas» · «Días»: «Todos los días» / «Ciertos días» · «Fecha de inicio» · «Fecha de fin»: «Sin fin» / «Hasta una fecha» · «Se repite hasta que la pauses o la finalices.» · «Nota (opcional)» / «La ve toda la familia.» (propia: «Solo la ves tú.») · «PediTrack guarda lo que escribas tal cual: no revisa el nombre, el horario ni cada cuánto.» · «Con esto, cada día hay N avisos: el primero a las HH:MM y el último a las HH:MM.» · [Guardar actividad] / [Guardar cambios] · «Los cambios cuentan desde el siguiente aviso. Lo ya marcado no cambia.»

**Errores**: Suplemento: «Escribe el nombre del suplemento.» · «Elige al menos un día.» · «Esta hora ya está en la lista.» · «La fecha de fin va después de la primera toma (8 oct 2026).» — Actividad: «Escribe el nombre de la actividad.» · «La hora de fin va después de la de inicio.» · «Elige cuánto tiempo pasa entre avisos.» · «Elige al menos un día.» · «La fecha de fin va después de la fecha de inicio.»

**Detalles**
- Suplemento: «Hoy · jue 8 oct» · «2 de 6 tomas hoy» · Horas / Fechas / Nota / Agregado por · [Pausar] [Editar] · «Finalizar suplemento» · «Un Tutor puede pausar, editar o finalizar este suplemento.» · Caducado: «Con el plan gratuito puedes ver y marcar las tomas. Para editar, pausar o reanudar se necesita el plan completo.»
- Actividad: «Hoy · jue 8 oct» · «6 de 13 hechas hoy» · «Próxima» · «Última marcada» · [✓ Realizado] · «Quitar la última marca» · «No quedan avisos hoy.» · Cada cuánto / Días / Avisos al día / Fechas / Agregada por · [Pausar] [Editar] · «Finalizar actividad» · [Reanudar] · «Un Tutor puede pausar, editar o finalizar esta actividad.» · Caducado: «Con el plan gratuito puedes ver la actividad y marcar «Realizado». Para editar, pausar o reanudar se necesita el plan completo.»
- Tus avisos: «Tus avisos» / «A la hora de cada toma, en este dispositivo.» (suplemento) · «A cada hora programada, en este dispositivo.» (actividad) · «Cada persona de la familia elige los suyos. Activarlos aquí no los activa para nadie más.» (hijo) · «Se activan en cada dispositivo por separado.» (personal).

**Diálogos**
- «¿Finalizar Probiótico?» · «Desde hoy no se crean más tomas ni avisos para nadie de la familia. Las de hoy que no estén marcadas dejan de aparecer.» · «Cada toma marcada, con quién la marcó y a qué hora.» · «Queda en «Pausados y terminados». No se puede reanudar; para volver a registrarlo, agrega un suplemento nuevo.» · [Cancelar] [Finalizar suplemento]
- «¿Finalizar Tomar agua?» · «Desde hoy no llegan más avisos de esta actividad a nadie de la familia.» · «Cada «Realizado», con quién lo marcó y a qué hora.» · «Queda en «Pausadas y terminadas». No se puede reanudar; para volver a registrarla, agrega una actividad nueva.» · [Cancelar] [Finalizar actividad]
- En lo personal se quita «para nadie de la familia» / «a nadie de la familia» y «con quién».

**Aviso push de actividad**: Genérico «Actividad programada» / «Hay una actividad registrada para ahora.» · [Realizado] — Con detalle, de un hijo: «Actividad programada · Tomar agua» / «Mateo · 15:00» · [Realizado] — propia: «Actividad programada · Pararse a estirar» / «15:00» · [Realizado].

## D. Preguntas abiertas y cómo se resolvieron (el dueño puede cambiarlas)

1. ¿Actividades de un hijo en el inicio? **No**: solo en el detalle del hijo.
2. «Realizado» antes del siguiente aviso: **sí cuenta**, marca la más temprana sin marcar del día hasta el total.
3. «Quitar la última marca»: **siempre que haya marcas hoy**; la regla de las tomas decide de quién (el autor o quien puede todo).
4. Mínimo/máximo de «cada»: **5 a 59 minutos o 1 a 23 horas**.
5. Fin que no cae en el intervalo: **el último aviso es el último que cabe**.
6. Tope de 10: **por tipo y por hijo** (y por tipo en lo propio).
7. Las rutinas «cada N horas» existentes: **pasan a actividades**.
8. Horas sin valor por omisión: **sí**.
9. Un diálogo de finalizar por tipo, «Pausar» sin confirmación: **sí**.
