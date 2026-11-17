# Especificación de Funcionalidad: Eliminar la cuenta y descargar todos mis datos

**Rama de la Funcionalidad**: `feature/070-eliminar-cuenta-y-datos`

**Creado**: 2026-11-12

**Estado**: Implementada (2026-11-16)

**Entrada**: Descripción del usuario: "070 Eliminar la cuenta y descargar todos mis datos. Hoy no existe forma de borrar una cuenta ni un hijo, y la LFPDPPP da el derecho de cancelación (ARCO); en PediTrack hay datos de salud de menores (consultas, recetas con foto, tomas, vacunas con fotos, crecimiento, botiquín, suplementos y actividades, citas). Objetivo: (1) «Llévate todo»: antes de borrar, la persona puede descargar todos sus datos en un formato abierto y legible, sostiene el Principio IV y debe estar disponible en cualquier plan; (2) «Eliminar mi cuenta»: la titular pide borrar su cuenta desde la app, con confirmación clara e irreversible, un plazo de gracia antes del borrado real en el que puede cancelar, y al final se borran de verdad todos sus datos y los de sus hijos, su usuario de inicio de sesión, sus dispositivos de avisos, los teléfonos de sus hijos y sus invitaciones; (3) decidir qué pasa con la familia, con una suscripción vigente, con lo que otras personas marcaron y con los respaldos. Nunca datos de salud en direcciones, registros ni mensajes. Sin evaluar ni interpretar datos médicos (Principio I)." (idea «Eliminar la cuenta y descargar todos mis datos» de `BACKLOG.md`, «Antes del primer cobro real»).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Llévate todo: descargar todos mis datos (Prioridad: P1)

Una madre quiere tener una copia de todo lo que ha registrado en PediTrack: sus hijos, cada consulta con su receta y su foto, las tomas marcadas, la cartilla de vacunación con sus fotos, las medidas de crecimiento, el botiquín, los suplementos y actividades, las citas y sus propias consultas. Desde «Mi cuenta» toca «Descargar todos mis datos» y recibe un solo archivo que puede abrir en su computadora sin PediTrack: tablas legibles, las fotos como imágenes y un archivo completo que otra aplicación podría leer.

**Por qué esta prioridad**: es lo que sostiene el Principio IV (los datos nunca se secuestran) y es el paso previo obligado a borrar: nadie debería perder su historial por borrar la cuenta. Además aporta valor por sí sola, aunque nunca borre la cuenta (respaldo personal, cambiar de app, llevarle el historial a otro pediatra).

**Prueba Independiente**: con una cuenta con dos hijos, consultas con foto, vacunas con foto, medidas, botiquín y rutinas, descargar el archivo y comprobar, abriéndolo fuera de la app, que está cada registro y cada foto, y que no hay nada de otras cuentas.

**Escenarios de Aceptación**:

1. **Dado** una cuenta del plan gratuito con un hijo y tres consultas, **Cuando** la titular toca «Descargar todos mis datos», **Entonces** recibe el archivo completo: el plan nunca limita esta descarga.
2. **Dado** una cuenta con fotos de recetas y de la cartilla, **Cuando** descarga sus datos, **Entonces** cada foto viene como imagen y cada registro dice qué foto le corresponde.
3. **Dado** una persona invitada como Tutora a una familia, **Cuando** descarga sus datos, **Entonces** recibe solo lo que es de su propia cuenta (sus consultas propias, sus suplementos y actividades personales, sus hijos propios si los tiene), no los hijos de la familia que solo comparte.
4. **Dado** que la descarga tarda, **Cuando** la persona sale de la pantalla o cierra la app a la mitad, **Entonces** al volver la pide de nuevo y la recibe completa; nunca queda guardada en el servicio una copia de sus datos para descargar después (research R8).

---

### Historia de Usuario 2 - Eliminar mi cuenta con un plazo para arrepentirme (Prioridad: P1)

Un padre decide dejar de usar PediTrack y quiere que se borre todo. En «Mi cuenta» toca «Eliminar mi cuenta». La app le explica en palabras sencillas qué se va a borrar (todo lo suyo y lo de sus hijos), que no se puede recuperar después del plazo, qué pasa con su familia y su suscripción, y le ofrece primero descargar sus datos. Confirma escribiendo una palabra y volviendo a comprobar que es él. Desde ese momento la cuenta queda programada para borrarse **en 30 días**; recibe un correo con esa fecha. Mientras tanto, al entrar solo ve una pantalla con la fecha, «Descargar todos mis datos» y «Cancelar la eliminación»: ya no registra ni marca nada. Si cambia de opinión antes de la fecha, toca «Cancelar la eliminación», y todo sigue como estaba. Llegada la fecha, todo se borra de verdad.

**Por qué esta prioridad**: es el derecho de cancelación de la LFPDPPP sobre datos sensibles de salud de menores; sin esto no se puede cobrar ni lanzar.

**Prueba Independiente**: pedir la eliminación de una cuenta de prueba, comprobar que queda programada, cancelarla y comprobar que nada se perdió; volver a pedirla, adelantar el reloj al final del plazo y comprobar que no queda ningún dato de esa cuenta ni de sus hijos, ni su usuario de inicio de sesión.

**Escenarios de Aceptación**:

1. **Dado** una titular con sesión iniciada, **Cuando** pide eliminar su cuenta, **Entonces** antes de confirmar ve la lista de lo que se borrará, la fecha en que ocurrirá y la opción de descargar sus datos, y debe confirmar su identidad y escribir la palabra de confirmación.
2. **Dado** una cuenta programada para eliminarse, **Cuando** la titular cancela antes de la fecha, **Entonces** la cuenta vuelve a la normalidad sin perder ningún registro.
3. **Dado** una cuenta programada para eliminarse, **Cuando** la titular entra a la app, **Entonces** solo ve la fecha del borrado, «Descargar todos mis datos» y «Cancelar la eliminación»; no puede registrar, editar ni marcar nada.
4. **Dado** una cuenta programada para eliminarse, **Cuando** llega la fecha (30 días después), **Entonces** se borran de verdad sus datos, los de sus hijos (consultas, fotos, tomas, vacunas, medidas, rutinas, citas, botiquín), sus dispositivos de avisos, los teléfonos de sus hijos, sus invitaciones y su usuario de inicio de sesión, y recibe un último correo que lo confirma.
5. **Dado** una cuenta ya eliminada, **Cuando** alguien intenta entrar con ese correo, **Entonces** la app la trata como una cuenta nueva: no aparece ningún dato anterior.
6. **Dado** una cuenta programada para eliminarse, **Cuando** llega la hora de una toma, **Entonces** la titular ya no recibe su recordatorio en sus dispositivos.

---

### Historia de Usuario 3 - La familia y la suscripción no quedan en un estado roto (Prioridad: P2)

Cuando quien elimina su cuenta es la dueña de una familia, sus hijos se borran con ella al final del plazo. Las personas invitadas reciben un aviso con la fecha y, durante esos 30 días, siguen viendo y marcando a esos hijos (un tratamiento puede estar en curso) y pueden descargar todo lo de ellos; al llegar la fecha pierden el acceso. Cuando quien elimina es una persona invitada, sale de la familia y solo se borra lo suyo; los hijos de la familia siguen intactos. Si la cuenta tiene una suscripción vigente, se cancela al pedir la eliminación para que no haya cobros futuros.

**Por qué esta prioridad**: sin estas reglas la eliminación dejaría familias con accesos a datos que ya no existen, o cobros a una cuenta borrada. Depende de la Historia 2.

**Prueba Independiente**: con una familia de dueña y dos Tutores, pedir la eliminación de un Tutor y comprobar que la familia sigue; pedir la de la dueña y comprobar el aviso a los Tutores, que durante el plazo siguen marcando y pueden descargar los datos de los hijos, y que al final pierden el acceso; con una suscripción activa de prueba, comprobar que se cancela al pedir la eliminación.

**Escenarios de Aceptación**:

1. **Dado** un Tutor invitado que elimina su cuenta, **Cuando** se completa la eliminación, **Entonces** sale de la familia, los hijos de la familia siguen con todos sus registros y sus marcas en las tomas de esos hijos quedan como hechas, sin su nombre.
2. **Dado** una cuenta con suscripción vigente, **Cuando** pide eliminarse, **Entonces** la suscripción se cancela en ese momento y no se hace ningún cobro posterior.
3. **Dado** una dueña de familia que pide eliminar su cuenta, **Cuando** confirma, **Entonces** cada persona invitada recibe un aviso con la fecha en que los hijos se borrarán y perderá el acceso.
4. **Dado** un Tutor de una familia cuya dueña pidió la eliminación, **Cuando** entra durante el plazo, **Entonces** ve un aviso con la fecha y «Descargar los datos de Mateo y Sofía», y sigue pudiendo marcar las tomas.
5. **Dado** que llega la fecha, **Cuando** el Tutor vuelve a entrar, **Entonces** esos hijos ya no aparecen y su cuenta sigue funcionando con lo suyo.

---

### Casos Límite

- Una persona pide la eliminación y, antes de que llegue la fecha, se le acaba el plan pagado: la eliminación sigue programada y la descarga sigue disponible (nunca depende del plan).
- La persona pide la eliminación sin conexión: la app no deja pedirla (es una acción que necesita conexión, como las demás de escritura).
- Dos dispositivos de la misma persona: si en uno se cancela la eliminación, en el otro la cuenta también deja de estar programada.
- La eliminación final falla a la mitad (por ejemplo, el proveedor de inicio de sesión no responde): se reintenta hasta completarse; nunca queda una cuenta medio borrada visible para la persona, y la falla queda en el registro de errores con un mensaje fijo.
- Un respaldo de la base (spec 069) que contiene la cuenta se restaura después de que la cuenta se eliminó: las cuentas eliminadas se vuelven a borrar antes de que el servicio atienda a nadie.
- La persona olvida su contraseña durante el plazo de gracia: puede recuperarla y entrar a cancelar.
- La cuenta de la dueña está programada: sus Tutores siguen marcando las tomas de los hijos hasta la fecha, pero nadie puede invitar a la familia ni aceptar una invitación pendiente de ella.
- Un Tutor de esa familia pide también eliminar su propia cuenta: cada eliminación sigue su propio plazo; la de él no adelanta ni retrasa la de la dueña.
- El archivo de datos es grande (muchas fotos): la descarga debe terminar o decir con claridad que falló, sin dejar una descarga incompleta que parezca completa.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Descargar todos mis datos**

- **FR-001**: Toda persona con cuenta DEBE poder descargar, en cualquier plan y en cualquier momento (también durante el plazo de gracia), un archivo con todos los datos de su propia cuenta.
- **FR-002**: El archivo DEBE incluir, de la cuenta y de cada hijo propio: datos del hijo, consultas (doctor, fecha, síntomas, notas, medicamentos, horario y cada toma con su estado y quién la marcó por su nombre de pila), fotos de recetas, citas y sus avisos, cartilla de vacunación y sus fotos, medidas de crecimiento, suplementos y actividades con sus tomas, botiquín con sus fotos, y las consultas, suplementos y actividades propios de la persona.
- **FR-003**: El archivo DEBE poder abrirse sin PediTrack: tablas legibles en una hoja de cálculo, las fotos como imágenes comunes y un archivo completo legible por otra aplicación, más una nota que explique qué contiene cada parte.
- **FR-004**: El archivo NO DEBE incluir datos de otras cuentas (hijos de la familia que la persona solo comparte, correos de otras personas) ni datos internos del servicio, con una excepción: mientras la dueña de una familia tenga su eliminación programada, sus Tutores y Cuidadores DEBEN poder descargar los datos de los hijos de esa familia (FR-014).
- **FR-005**: El archivo DEBE contener solo lo registrado, tal cual: sin interpretaciones, estados de alerta, percentiles ni juicios (Principio I).
- **FR-006**: Lo que la persona descarga y el contenido del archivo NUNCA DEBEN aparecer en direcciones web, registros del servicio ni mensajes de error.

**Eliminar mi cuenta**

- **FR-007**: Toda persona con cuenta DEBE poder pedir la eliminación de su propia cuenta desde «Mi cuenta», en ambos diseños (teléfono y web).
- **FR-008**: Antes de confirmar, la app DEBE mostrar en palabras sencillas qué se borrará, la fecha del borrado real, qué pasa con su familia y su suscripción, y ofrecer descargar sus datos.
- **FR-009**: La confirmación DEBE pedir volver a comprobar la identidad de la persona y escribir una palabra de confirmación; un toque accidental nunca debe bastar.
- **FR-010**: Al confirmar, la cuenta DEBE quedar programada para borrarse al terminar un plazo de gracia de **30 días naturales** (decisión del dueño, 2026-11-12). Durante el plazo la persona **solo puede descargar sus datos y cancelar la eliminación**: no registra, edita ni marca nada, y la app le muestra la fecha del borrado.
- **FR-011**: Durante el plazo, la persona DEBE poder cancelar la eliminación, y la cuenta DEBE volver a su estado anterior sin pérdida.
- **FR-012**: Al pedir la eliminación DEBEN dejar de enviarse los recordatorios a los dispositivos de la propia persona, y sus ligas e invitaciones pendientes DEBEN dejar de funcionar; los recordatorios de las personas invitadas y de los teléfonos de los hijos siguen hasta la fecha (puede haber un tratamiento en curso). Si cancela, sus recordatorios vuelven.
- **FR-013**: Al terminar el plazo, el sistema DEBE borrar de verdad (no solo ocultar) todos los datos de la cuenta y de sus hijos, sus fotos, sus dispositivos de avisos, los accesos de los teléfonos de sus hijos, sus invitaciones y su usuario del proveedor de inicio de sesión; y DEBE quitar el identificador de la cuenta de los registros de errores.
- **FR-014**: Si quien elimina es la dueña de una familia con personas invitadas (decisión del dueño, 2026-11-12): sus hijos **se borran con ella** al final del plazo; cada persona invitada recibe un aviso (correo y en la app) con la fecha; durante el plazo los Tutores y Cuidadores conservan su acceso a esos hijos (ver y marcar) y pueden descargar todos sus datos; al llegar la fecha la familia deja de existir y pierden el acceso, sin perder nada de su propia cuenta. Los hijos no se transfieren a otra cuenta.
- **FR-015**: Si quien elimina es una persona invitada, DEBE salir de la familia y solo se borra lo suyo; las tomas que marcó en hijos de la familia DEBEN seguir marcadas, sin su nombre («por una persona que ya no está en la familia»).
- **FR-016**: Si la cuenta tiene una suscripción vigente, DEBE cancelarse al confirmar la eliminación, sin cobros posteriores; la app DEBE decirlo antes de confirmar. Los reembolsos no se gestionan desde la app.
- **FR-017**: La persona DEBE recibir un correo al pedir la eliminación (con la fecha y cómo cancelar) y otro al completarse; los correos NO DEBEN contener datos de salud ni nombres de hijos.
- **FR-018**: El servicio DEBE guardar una constancia mínima de cada eliminación (cuándo se pidió y cuándo se completó, sin datos personales ni de salud) para demostrar que se atendió el derecho de cancelación, y para volver a borrar la cuenta si un respaldo anterior se restaura.
- **FR-019**: Las fallas del proceso de eliminación DEBEN quedar en el registro de errores con mensajes fijos, sin datos de la cuenta más allá de su identificador mientras exista, y la eliminación DEBE reintentarse hasta completarse.
- **FR-020**: La eliminación de la cuenta y la descarga de datos NUNCA DEBEN depender del plan (Principio IV).

### Entidades Clave

- **Solicitud de eliminación**: una por cuenta; cuándo se pidió, la fecha programada del borrado, si se canceló y cuándo se completó. Al completarse queda solo como constancia sin datos personales.
- **Archivo de datos («Llévate todo»)**: lo que la persona descarga; se arma con los datos de su propia cuenta en ese momento y deja de estar disponible pasado un tiempo corto.
- **Cuenta, hijos y todo lo que cuelga de ellos**: consultas, medicamentos, tomas, fotos, citas, vacunas, medidas, rutinas, botiquín, dispositivos, teléfonos de los hijos, invitaciones y membresías de familia.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Una persona descarga todos sus datos en menos de 2 minutos para una cuenta típica (hasta 3 hijos y 100 consultas con foto), en cualquier plan.
- **SC-002**: El 100 % de los registros y fotos de la cuenta aparecen en el archivo descargado, y el 0 % de datos de otras cuentas.
- **SC-003**: Pedir la eliminación toma menos de 3 minutos y nunca ocurre con un solo toque.
- **SC-004**: Al terminar el plazo, una búsqueda de la cuenta y de cada uno de sus hijos en todos los datos del servicio no encuentra nada, salvo la constancia sin datos personales.
- **SC-005**: Cancelar dentro del plazo devuelve la cuenta al 100 % de sus registros.
- **SC-006**: Ninguna cuenta eliminada recibe cobros ni recordatorios después de pedir su eliminación.
- **SC-007**: Ningún registro del servicio, dirección web o mensaje contiene datos de salud ni contenido del archivo de datos.

## Supuestos

- **Borrar a un solo hijo** sin borrar la cuenta queda fuera de esta spec (decisión del dueño, 2026-11-12) y va a `BACKLOG.md`.
- **Pasar los hijos a un Tutor** (transferir la titularidad) cuando la dueña se va queda fuera; si se pide, sería otra spec.
- La descarga incluye el historial en un formato de archivos (tablas + fotos + archivo completo); el PDF del historial por hijo (spec 050) sigue existiendo aparte y con su propio plan.
- Las copias de seguridad (spec 069, cuando estén activas) conservan datos de una cuenta eliminada hasta que caducan por su retención (máximo 6 meses); no se editan copias cifradas. El aviso de privacidad lo dirá, y la constancia de FR-018 evita que una restauración la reviva.
- Los registros de pagos que la ley fiscal obligue a conservar se quedan sin datos de salud ni nombres de hijos; el dueño lo valida con su contador.
- Los derechos ARCO por correo (a `soporte@pedi-track.com`) siguen siendo posibles y se atienden con esta misma función.
- El proveedor de inicio de sesión permite borrar un usuario y volver a pedir la identidad antes de una acción sensible.
- El aviso de privacidad se actualiza para describir la eliminación, el plazo, la descarga y los respaldos (pendiente del dueño).
