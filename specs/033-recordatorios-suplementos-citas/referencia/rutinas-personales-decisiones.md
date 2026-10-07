# Rutinas personales (spec 033, parte 3) — decisiones y desviaciones (de Claude Design)

Copia de `repo-pr/specs/005-identidad-visual-front-end/rutinas-personales-decisiones.md` del proyecto de Claude Design
(`https://claude.ai/design/p/f4e28757-d885-471d-b5b9-6e6ca094449a`), 2026-10-07.

**Mock**: `Rutinas Personales PediTrack.dc.html` (+ nuevo `MisSuplementosSeccion`; reutiliza `RutinaTarjeta`, `RutinaForm`, `RutinaDetalle`,
`TomaChip`, `TomasHoyPanel`; los `.dc.html` se vuelven a bajar con `DesignSync get_file`, no se copian aquí). Ids del tablero: I = inicio,
S = sección, A = aviso de primera vez, F = formulario, D = detalle, T = tomas de hoy, G = integrante invitada / plan caducado.
Cada punto queda **pendiente de aprobación**.

## A. Tokens

Sin tokens nuevos (`ink`, `ink-soft`, `action`, `bright`, `confirmed`, `canvas`, `surface`, `hint`, `hint-border`, `hint-edge`, `bright-soft`,
`body`, `ink-muted`, `ink-edge`, `med-1`, `pending`, `pending-soft`, `pending-strong`, `calendar-muted`, `calendar-text`; Tailwind
`slate-100/300/500/600`, `emerald-800`, `red-700`, `red-50`). Fondo de diálogo `bg-ink/70`.

## B. Desviaciones y tratamientos nuevos

1. **Dónde vive la entrada**: bloque «Personal · Mis suplementos» en el **inicio** (móvil y web), debajo de «Tus hijos» y sus tomas; en **web**,
   además, un grupo «Personal» en la barra lateral debajo de «Familia», separado por una línea `ink-edge`.
2. **Nuevo «Inicio» en la barra lateral web y título «Inicio» en móvil**; etiqueta «Hijos» sobre la lista; en móvil «← Tus hijos» pasa a
   «← Inicio». **Cambia la navegación existente.**
3. **Tomas de hoy: bloque aparte** («Tus tomas de hoy», dentro del bloque Personal, con su frase de privacidad y una línea `hint-border`
   de 2 px; en web una columna con borde). Sin etiqueta «Suplemento» (todas lo son).
4. **Resumen del bloque Personal** («1 sin marcar» / «todo marcado hasta ahora») en texto `slate-600`, no en tarjeta ámbar.
5. **Chip de toma personal sin autor**: «✓ Tomada · a las 07:20» (solo marca la dueña). `TomaChip`: sin `by`, muestra «a las HH:MM».
6. **Aviso de primera vez: bloque `hint` dentro de la página, no diálogo**, con «Entendido» (contorno); «ya lo vi» **por cuenta**. Después queda
   el botón de texto «Cómo funcionan estas rutinas» al final, que lo vuelve a mostrar.
7. **Estado vacío con botón sólido** «Crear mi primera rutina» (aquí no hay otro sólido). Rompe la paridad con Suplementos S2.
8. **Nuevo `MisSuplementosSeccion`** (copia la estructura de `SuplementosSeccion` con textos propios).
9. `RutinaForm` acepta `noteHelp` («Solo la ves tú.»); `RutinaDetalle` acepta `personal` (bloque «Avisos») y plan caducado; `TomasHoyPanel`
   acepta `title`, `date` y `empty`.
10. **Bloque de avisos del detalle personal**: «Avisos» / «A la hora de cada toma, en este dispositivo.» / «Se activan en cada dispositivo por separado.».
11. **Sin «Creada por»** ni nombres de la persona o de sus hijos en la sección. **Excepción web**: la barra lateral sigue mostrando a los hijos.
12. **Formulario**: el mismo, con la nota `hint` «Es una rutina personal: solo tú la ves y solo a ti te llegan sus avisos.».
13. **Plan caducado**: bloque `hint` «Tu cuenta está en el plan gratuito»; lo creado se ve y se marca; en el detalle solo «Finalizar rutina»
    (se quitan Editar, Pausar y Reanudar).
14. **Integrante invitada**: la misma sección con la línea «Las usas con el plan completo de la familia a la que te invitaron. Nadie de esa
    familia las ve.».

## C. Textos finales

- Privacidad (sección, inicio): «Solo tú ves estas rutinas y solo a ti te llegan los avisos.» · (formulario): «Es una rutina personal: solo tú la ves y solo a ti te llegan sus avisos.» · ayuda de la nota: «Solo la ves tú.»
- Aviso de primera vez: «Antes de empezar» / «PediTrack solo recuerda lo que tú registras: el nombre, las horas y las fechas que escribas. No sugiere suplementos ni opina sobre ellos.» / [Entendido] · Después: «Cómo funcionan estas rutinas».
- Vacío: «Aún no tienes rutinas» / «Si tomas algo de forma regular, puedes registrarlo con su horario. Cada toma aparece en el inicio para marcarla y, si lo activas, te llega un aviso.» / [Crear mi primera rutina]
- Entrada sin rutinas (inicio): «Ver mis suplementos →» / «Para registrar lo que tomas tú, con su horario.»
- Plan completo: «Tus rutinas de suplemento» / «Registra lo que tomas de forma regular, con su horario. Cada toma se marca en el inicio y puede llegarte un aviso. Solo tú las ves.» / [Ver el plan completo]
- Tope: «Ya tienes 10 rutinas activas» / «Es el máximo. Para agregar otra, pausa o finaliza una de las de abajo; las pausadas no cuentan.» / [Ir a las rutinas activas]
- Plan caducado (sección): «Tu cuenta está en el plan gratuito» / «Tus rutinas siguen aquí y sus tomas se pueden marcar. Para crear, editar o reanudar una rutina se necesita el plan completo.» · (detalle): «Con el plan gratuito puedes ver y marcar las tomas. Para editar, pausar o reanudar se necesita el plan completo.»
- Invitada: «Las usas con el plan completo de la familia a la que te invitaron. Nadie de esa familia las ve.»
- Avisos (detalle): «Avisos» / «A la hora de cada toma, en este dispositivo.» / «Se activan en cada dispositivo por separado.»
- Finalizar: «¿Finalizar Vitamina B12?» · Deja de pasar: «Desde hoy no se crean más tomas ni avisos. Las de hoy que no estén marcadas dejan de aparecer.» · Se conserva: «Las 2 tomas marcadas, con su hora, y el calendario hasta hoy.» · Después: «Queda en «Pausadas y terminadas». No se puede reanudar; para volver a registrarla, crea una rutina nueva.»
- Push: sin pantalla nueva. Genérico «Recordatorio de toma» / «Hay una toma registrada para ahora.»; con detalle «Vitamina B12 · 13:00» / «Toma registrada para ahora.»; sin el nombre de la persona.

## D. Preguntas abiertas y cómo se resolvieron al implementar (el dueño puede cambiarlas)

1. «Inicio» en la barra lateral web y «← Inicio» en móvil: **se implementa como en el mock** (B2) y queda marcada para aprobar.
2. Con el plan caducado las rutinas activas **siguen generando tomas y avisos** (como las de los hijos, FR-020); solo se puede «Finalizar».
3. Persona invitada que sale de la familia de pago, o familia que deja de pagar: **se trata como plan caducado**.
4. Las tomas personales **no** cuentan en ningún resumen general; solo dentro del bloque Personal.
5. El tope de 10 es **propio de la persona** (independiente del de cada hijo).
6. «Ya lo vi»: **por cuenta** (todos los dispositivos).
7. Sin hijos registrados, el inicio muestra el bloque Personal.
8. En web la lista de hijos de la barra lateral **no** se oculta dentro de «Mis suplementos» (es el marco de la app).
