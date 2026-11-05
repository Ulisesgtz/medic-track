# Especificación de Funcionalidad: Eliminar suplementos y actividades

**Rama**: `feature/060-eliminar-suplementos-actividades`
**Creada**: 2026-11-04
**Estado**: Borrador
**Entrada**: decisión del dueño del 2026-11-04 (sale de `BACKLOG.md`, «Editar y eliminar suplementos y actividades»; editar ya existe desde la spec 033).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Quitar un suplemento o una actividad capturado por error (Prioridad: P1)

Una mamá registró «Vitamina D» dos veces para su hijo, o una actividad con el nombre equivocado, y todavía no marcó ninguna toma. Quiere que desaparezca por completo, con sus avisos, en vez de tener que finalizarlo y verlo para siempre en la lista.

**Por qué esta prioridad**: es todo el valor de la funcionalidad: corregir un error de captura sin dejar basura en el registro.

**Prueba Independiente**: crear un suplemento sin marcar ninguna toma, eliminarlo desde su detalle y comprobar que ya no aparece en el hijo, en «Hoy», en el inicio ni manda avisos.

**Escenarios de Aceptación**:

1. **Dado** un suplemento de un hijo sin ninguna toma marcada, **Cuando** la dueña toca «Eliminar» y confirma, **Entonces** el suplemento, sus tomas y sus avisos desaparecen y la app vuelve al detalle del hijo.
2. **Dado** una actividad personal sin marcas, **Cuando** su dueña la elimina, **Entonces** desaparece y la app vuelve a su perfil, en la sección de actividades.
3. **Dado** el diálogo de confirmación abierto, **Cuando** la persona toca «Cancelar», **Entonces** no cambia nada.
4. **Dado** una cuenta en el plan gratuito (con un suplemento creado cuando pagaba), **Cuando** lo elimina sin marcas, **Entonces** se elimina igual: corregir lo propio no se cobra.

---

### Historia de Usuario 2 - Lo que ya tiene marcas se finaliza, no se elimina (Prioridad: P2)

Si alguna toma del suplemento o de la actividad ya fue marcada, aunque sea una, el registro tiene historia y no se borra: la app no ofrece «Eliminar» y, si alguien lo intenta (otro dispositivo marcó en el mismo momento), el servidor lo rechaza y la app explica que se puede finalizar.

**Por qué esta prioridad**: protege el historial que otras personas de la familia ya registraron.

**Prueba Independiente**: marcar una toma y comprobar que el botón no aparece; forzar la petición y comprobar que se rechaza sin borrar nada.

**Escenarios de Aceptación**:

1. **Dado** un suplemento con una toma marcada, **Cuando** se abre su detalle, **Entonces** no hay botón «Eliminar» (sí «Finalizar», si está activo).
2. **Dado** que otra persona marca una toma mientras el diálogo está abierto, **Cuando** se confirma eliminar, **Entonces** no se borra nada y la app dice que ya tiene tomas marcadas y que se puede finalizar.
3. **Dado** una toma marcada y luego desmarcada, **Cuando** ninguna toma queda marcada, **Entonces** se puede eliminar (la regla mira las marcas que hay, no las que hubo).

---

### Historia de Usuario 3 - Solo quien puede todo elimina (Prioridad: P3)

Eliminar es del mismo nivel que editar o finalizar: la dueña de la cuenta y un Tutor de una familia de pago. Un Cuidador, un Tutor de una familia que dejó de pagar y el teléfono del hijo no pueden. Un suplemento o una actividad personal solo lo elimina su dueña.

**Prueba Independiente**: con un Cuidador, el botón no aparece y la petición se rechaza.

**Escenarios de Aceptación**:

1. **Dado** un Cuidador, **Cuando** abre el detalle de un suplemento sin marcas, **Entonces** no ve «Eliminar» y el servidor rechaza la petición.
2. **Dado** un Tutor de una familia de pago, **Cuando** elimina un suplemento sin marcas de un hijo, **Entonces** se elimina.
3. **Dado** la actividad personal de otra persona, **Cuando** alguien más lo intenta, **Entonces** se rechaza como si no existiera.

### Casos Límite

- Dos personas eliminan a la vez: una lo logra y la otra recibe «no existe».
- Una marca y un eliminar a la vez: o la marca llega primero (y eliminar se rechaza) o espera y encuentra que la toma ya no existe.
- Un suplemento finalizado o pausado sin marcas también se puede eliminar.
- Avisos ya enviados de ese suplemento: se borra su registro; no se reenvía nada.
- Un identificador mal formado o desconocido responde «no existe».

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: La app DEBE permitir eliminar un suplemento o una actividad (de un hijo o personal) solo mientras ninguna de sus tomas esté marcada.
- **FR-002**: El servidor DEBE decidirlo en el momento de eliminar, con la rutina y sus tomas bloqueadas, y rechazar (conflicto, `routine_has_marks`) si alguna está marcada, sin borrar nada.
- **FR-003**: Eliminar DEBE borrar de verdad el suplemento o la actividad, todas sus tomas, sus recordatorios por persona y del teléfono del hijo y la preferencia «Tus avisos» de cada persona.
- **FR-004**: Solo quien tiene el nivel «puede todo» sobre la rutina (dueña y Tutor de familia de pago; en lo personal solo su dueña) DEBE poder eliminar; los demás reciben el mismo rechazo de siempre.
- **FR-005**: Eliminar DEBE funcionar en cualquier plan (Principio IV).
- **FR-006**: La rutina DEBE decir si tiene alguna toma marcada, para que la app ofrezca «Eliminar» solo cuando se puede.
- **FR-007**: La app DEBE pedir confirmación con un texto neutral e irreversible antes de eliminar, en ambos diseños (teléfono y web).
- **FR-008**: Al eliminar, la app DEBE volver al detalle del hijo o al perfil propio en su sección, y dejar de mostrarlo en todas las pantallas sin recargar.
- **FR-009**: Si el servidor rechaza por marcas, la app DEBE decirlo y sugerir finalizar, sin evaluar ni juzgar (Principio I).
- **FR-010**: Los textos DEBEN vivir en un solo lugar con una prueba de redacción.
- **FR-011**: La ruta NO DEBE existir para el teléfono del hijo.

### Entidades Clave

- **Suplemento / actividad (rutina)**: gana el dato derivado «tiene marcas»; sin columnas nuevas.
- **Toma de la rutina**, **recordatorio por persona**, **recordatorio del teléfono del hijo**, **«Tus avisos»**: se borran junto con la rutina.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Una persona elimina un suplemento capturado por error en dos toques (Eliminar → Confirmar).
- **SC-002**: El 100 % de los intentos de eliminar algo con una toma marcada se rechaza sin perder ningún dato (probado contra la base real, también con marcas simultáneas).
- **SC-003**: Después de eliminar, el suplemento no aparece en ninguna pantalla ni genera ningún aviso.
- **SC-004**: Cobertura de pruebas > 90 % en backend y frontend; E2E a 390 y 1280 px.

## Supuestos

- Sin migración: todo lo que se borra ya existe y la regla se deriva de las tomas.
- No hay papelera ni «deshacer»: el diálogo lo dice.
- El historial, el PDF y el inicio no necesitan cambios propios: leen lo que existe.
- Sin mock entregado: se usa el sistema visual (`design-tokens.md`) y el mismo diálogo de confirmación de «Finalizar».
