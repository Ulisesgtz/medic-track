# Próxima cita — decisiones y desviaciones del sistema visual (de Claude Design)

Copia de `repo-pr/specs/005-identidad-visual-front-end/proxima-cita-decisiones.md` del proyecto de Claude Design
(`https://claude.ai/design/p/f4e28757-d885-471d-b5b9-6e6ca094449a`), 2026-10-06.

**Mock**: `Proxima Cita PediTrack.dc.html` (copia en esta carpeta; importa `CitaTarjeta`, `CitaCampos`, `CitasHistorial`, `AvisoNotificacion` y
reutiliza `TomasHoyPanel`; los `.dc.html` se bajan con `DesignSync get_file` al implementar). Ids del tablero: C = campo en «Nueva consulta»,
P = tarjeta, E = editar, A = agregar a consulta guardada, H = historial, X = diálogo, N = texto del aviso. Cada punto queda **pendiente de aprobación**.

## A. Tokens

Sin tokens nuevos: `ink`, `ink-soft`, `action`, `bright`, `confirmed`, `canvas`, `surface`, `hint`, `hint-border`, `hint-edge`, `bright-soft`, `body`,
`ink-muted`, `ink-edge`, `med-1`; de Tailwind `slate-100/300/500/600`, `emerald-800` y `red-700` (solo el error de fecha). Fondo de diálogo `bg-ink/70`.
En React: `fieldModal`/`labelClass`/`errorClass` de `formStyles.ts`, `<AppShell>` y `<AppHeader>`.

## B. Desviaciones o tratamientos nuevos

1. **Cuenta regresiva** en chip `hint` + `action`: «en 3 días», «mañana», «hoy, en 2 horas», «hoy». Nunca ámbar ni rojo, aunque la cita esté cerca.
2. **Fecha y hora** en 32 px/900: fecha en `ink`, hora en `action`; se parten en dos líneas a 390 px si no caben.
3. **Chips de aviso editables**: `hint` + borde `hint-border` + `action`, de 44 px, la etiqueta es un botón (abre la edición) y una × de 44 × 44 quita; la × va en `action`, no en rojo.
4. **Aviso que ya pasó** (E4): chip `slate-100` con borde punteado `slate-500`, texto `slate-600` («era hoy, 10:30») y una nota `hint` que lo explica. No se borra solo.
5. **Máximo de 5 avisos** (E3): «+ Agregar aviso» se cambia por un texto `slate-600` que dice cómo agregar otro. No hay botón deshabilitado.
6. **Ejemplos de aviso** (E2) como botones de contorno gris que solo llenan el campo; son ejemplos de formato, no recomendaciones.
7. **Un solo sólido por pantalla.** Detalle del hijo: «Nueva consulta». Formularios: «Guardar consulta», «Guardar cambios» o «Guardar cita». Tarjeta: Editar y Marcar realizada con contorno, Cancelar cita como texto. Diálogo: «Cancelar cita» en `ink` y «Volver» con el foco inicial.
8. **Marcar realizada sin confirmación**: se deshace desde el aviso `role=status` (P5) y desde el historial.
9. **Chips del historial**: Realizada = `hint`/`action`; Cancelada = `slate-100`/`slate-600`; Pasó sin marcar = blanco con borde punteado `slate-500` y texto `slate-600`. Ninguno en ámbar ni rojo.
10. **Cuenta gratuita** (C4): campos `slate-100` + `slate-600`, sin `opacity-50`, y bloque `hint` «Disponible en el plan completo» con un enlace, no un botón sólido.
11. **Agregar a una consulta guardada** (A2): pantalla aparte con la consulta como referencia de solo lectura (`hint`); no abre el formulario completo.
12. **Notificaciones**: en web, el aviso del navegador aparece arriba a la derecha; en móvil, pantalla bloqueada sobre `ink`. Las leyendas («1 día antes · …») son del mock, no del aviso.
13. **«Tus avisos de esta cita»** en la tarjeta (interruptor `action`, 44 px), también para el Cuidador, como en Suplementos.

## C. Texto del aviso (sin imperativos)

Con detalle: 1 día antes — «Cita de Mateo: mañana a las 10:30» / «Con Dra. Laura López, el viernes 9 oct. Nota: …»; 2 horas antes — «Cita de Mateo: hoy a las 10:30» / «Con Dra. Laura López, en 2 horas.»;
personalizado — mismo título / «Con Dra. Laura López, en 3 horas.»
Genérico: «Recordatorio de cita» / «Hay una cita registrada para mañana.» · «… para hoy, en 2 horas.»
Sin nombre del hijo, doctor, hora exacta ni nota en la genérica. Nunca «No olvides», «Prepárate» ni «Lleva…».

## D. Supuestos de producto que el diseño hace visibles

1. **Genérico por omisión** y por persona y dispositivo (Ajustes, N3). El ajuste aplica a todos los avisos de la app, no solo a las citas.
2. La lista de avisos es **de la cita** (la edita un Tutor); cada persona solo enciende o apaga los suyos.
3. Una consulta tiene **como máximo una próxima cita** (vigente). El detalle del hijo muestra la más cercana de todas sus consultas.
4. Una cita **pasa a «Pasó sin marcar»** al terminar el día de la cita si nadie la marcó. Un Tutor puede marcarla después.
5. **Cancelar** apaga los avisos para todos; la cita queda en el historial con quién la canceló.
6. El historial es una pantalla aparte («Historial de citas →»), por hijo.
7. ¿Pueden agregarse citas a consultas del plan gratuito después de pasar al plan completo? El mock A1 lo permite.

## E. Contraste verificado

`action` sobre `hint` 5.2:1 · `action` sobre blanco 5.4:1 · `slate-600` sobre `slate-100` 7.0:1 · `slate-600` sobre blanco 7.6:1 · `red-700` sobre blanco 6.5:1 · `bright-soft` sobre `ink` 11:1 · `hint-border` sobre `ink` 12:1 · `body` sobre blanco 11:1.
