# Especificación de Funcionalidad: Actividad a una hora fija y selector de hora

**Rama de la Funcionalidad**: `feature/036-actividad-hora-fija-y-selector-de-hora` (sale de `feature/035-actividades-y-suplementos`)

**Creado**: 2026-10-08

**Estado**: Implementado (PR a `feature/035-actividades-y-suplementos` mientras el #42 no se une a `develop`)

**Entrada**: Observaciones del dueño del producto (2026-10-08, con capturas de la versión web y de un iPhone sobre «Agregar actividad»): (1) el selector de hora nativo del navegador en la web es una lista larga y poco amable («no hay algún mejor drop down más amigable y bonito, en web y móvil?»): se eligió la **opción A, cuadrícula de horas**; (2) los cuadros de «Desde las / Hasta las» se ven **muy grandes** en la web y, en el móvil, **encimados** (la hora y la fecha se salían de la tarjeta); (3) una actividad no siempre es «cada cuánto»: puede ser **a una hora fija** en ciertos días («práctica de fut» martes y jueves a las 17:00) o «salir a correr» a una sola hora, con el aviso a esa hora. Complementa la spec 035.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Elegir una hora en una cuadrícula (Prioridad: P1)

En todo campo de hora de suplementos, actividades y próxima cita, el padre toca el campo («Elegir hora») y se abre un panel con las **24 horas** y los **minutos de 5 en 5**: un toque en la hora y otro en los minutos, y el panel se cierra. Es igual en web y móvil. El campo es compacto (148 px), no ocupa toda la tarjeta.

**Escenarios de Aceptación**:

1. **Dado** un campo de hora nuevo, **Entonces** está vacío y dice «Elegir hora» (no se sugiere ninguna hora, Principio I).
2. **Dado** el panel abierto, **Entonces** hay un grupo «Hora» de 24 botones y un grupo «Minutos» de 12, cada botón de 44 px, el elegido en `ink`, y «Listo».
3. **Dado** que se toca una hora, **Entonces** el campo queda con esa hora y los minutos que ya tenía (o :00); **Dado** que se tocan los minutos después, **Entonces** el panel se cierra y el foco vuelve al campo.
4. **Dado** que se tocan los minutos antes que la hora, **Entonces** esperan a que se elija la hora.
5. **Dado** el panel abierto, **Entonces** se cierra con Escape, con «Listo» y con un toque fuera.
6. **Dado** el campo del lado derecho de una fila, **Entonces** el panel cuelga de su borde derecho para no salirse de la pantalla.
7. **Dado** un teléfono de 390 px o una web de 1280 px, **Entonces** la pantalla no se desplaza de lado y las fechas del formulario (inicio y fin) no se salen de la tarjeta.

---

### Historia de Usuario 2 - Una actividad a una hora fija (Prioridad: P1)

En «Agregar actividad» el padre elige **«Cuándo se hace»**: **«Varias veces al día»** (desde una hora hasta otra, cada cuánto: lo de la spec 035) o **«A una hora fija»** (una a seis horas, como un suplemento). Con los **días** «Todos los días» o «Ciertos días». «Práctica de fut» = a una hora fija, martes y jueves, 17:00. «Salir a correr» = a una hora fija, 07:00. El aviso llega a esa hora y se marca con «Realizado» como cualquier actividad.

**Escenarios de Aceptación**:

1. **Dado** «A una hora fija», **Entonces** el formulario pide «Horas» (1–6, sin repetir) en lugar de «Horario del día» y «Cada cuánto», y «Días».
2. **Dado** una actividad a una hora fija, **Entonces** la tarjeta dice «Mar, Jue · a las 17:00» y «Desde el 1 oct · sin fecha de fin»; el detalle lista «Días», «Horas» y «Fechas»; la cuenta del día es «0 de 1 hechas hoy» y «✓ Realizado» marca la toma.
3. **Dado** que se edita una actividad, **Entonces** conserva su modo; no se puede convertir un suplemento en actividad ni al revés.
4. **Dado** el servidor, **Entonces** una actividad acepta periodo `window` (como en la spec 035) **o** `daily`/`weekdays` con 1–6 horas; un suplemento nunca acepta `window`; `interval` ya no existe para ninguno.

## Requisitos *(obligatorio)*

- **FR-001**: Existe un solo componente de hora (`shared/ui/TimeField.tsx`): campo compacto que abre un panel de horas (00–23) y minutos (de 5 en 5), accesible con teclado, nombrado por su `<label htmlFor>` o `ariaLabel`, que devuelve «HH:MM» o «». Se usa en el formulario de suplementos y actividades y en «Hora de la cita» y «Hora del aviso» de la próxima cita.
- **FR-002**: Los campos de fecha del formulario de suplementos y actividades no se salen de su tarjeta (`appearance-none`, `min-w-0`, `max-w-full`) y en la web miden como mucho 220 px.
- **FR-003**: Una actividad a una hora fija se guarda como `kind: "activity"`, `period: "daily" | "weekdays"`, `times` (1–6) y sin ventana; la migración `0023` relaja el CHECK de forma de `supplement_routines` (no cambia ningún dato).
- **FR-004**: Todo lo demás de la actividad (tope por tipo, «Realizado», avisos con `source: "activity"`, plan, acceso) no cambia: se deriva del tipo, no del periodo.
- **FR-005**: Ningún texto, ejemplo ni valor inicial sugiere una hora (Principio I).

## Fuera de alcance

- La «Primera toma» de un medicamento de la consulta (`MedicationFieldset`) sigue con el selector nativo: es del mock de la consulta y de la lectura de la receta.
- Rueda tipo iPhone y botones más/menos (opciones B y C del documento de opciones).

## Supuestos

1. El diseño (Claude Design) no dibujó el modo «a una hora fija»: es una adición de esta spec; queda en `BACKLOG.md` para que Design lo dibuje.
2. Los minutos van de 5 en 5 (el mínimo de una actividad es 5 minutos); una hora de otro minuto no se puede escribir.
3. Con los siete días elegidos, el texto dice «Todos los días».
