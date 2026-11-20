# Especificación de Funcionalidad: La opción elegida en azul de acción, no en tinta

**Rama de la Funcionalidad**: `feature/078-seleccion-azul`

**Creado**: 2026-11-20

**Estado**: Borrador

**Entrada**: Descripción del usuario (2026-11-20, al ver el formulario de actividad en un iPhone): "No crees que se ve mal el
color obscuro en las selecciones? Tomando en cuenta que el contorno de los botones de filtro son azul clarito, creo que ese
color obscuro no va con el branding, chécalo con design y UI/UX pro". Decisión tras la revisión con UI/UX Pro: opción A —
**la opción elegida va en el azul de acción con texto blanco**. «Checa dónde más se está usando ese oscuro para cambiarlo en
toda la aplicación» y «al encontrarlo abre una spec para el cambio».

## Contexto

En los controles de elegir (segmentados, chips, tarjetas de opción) la opción **sin elegir** tiene borde celeste y texto azul
de acción, pero la **elegida** se pinta con la tinta casi negra (`#04252b`) del sistema visual. Ese salto de color no es de la
misma familia y se ve pesado. El selector de hora (spec 036) ya marca la hora elegida en azul de acción con texto blanco y una
palomita; el resto de la app no.

**Opciones evaluadas** (contraste medido con texto blanco o del chip):

| Opción | Elegida | Contraste | Resultado |
|---|---|---|---|
| Hoy | Tinta `#04252b` + blanco | 16.1:1 | Fuera de la familia de color |
| **A (elegida)** | Acción `#0e7490` + blanco + segunda señal | **5.36:1** | AA, misma familia, ya usada por el selector de hora |
| B | Celeste `#cffafe` + borde acción + texto acción | 4.79:1 | AA pero se distingue poco de la no elegida |
| ✗ | Cian `#0891b2` + blanco | 3.68:1 | No pasa AA |

## Inventario (encontrado el 2026-11-20 por `implementar`)

Controles cuya opción elegida se dibuja hoy con tinta y **pasan a acción**:

| Pantalla | Control | Archivo |
|---|---|---|
| Suplemento / actividad | Segmentados «Todos los días / Ciertos días», días de la semana, «minutos / horas», «Sin fin / Hasta una fecha» | `features/supplements/RoutineForm.tsx` (`segmentOn`) |
| Actividad | Tarjetas «Cuándo se hace» (borde de la elegida, aro y punto del radio) | `features/supplements/RoutineForm.tsx` |
| Actividad | Chips del tipo de actividad (spec 075) | `features/supplements/ActivityTypePicker.tsx` (`chipOn`) |
| Cita | Segmentado del aviso «Tiempo antes / Días antes a una hora» | `features/appointments/AppointmentFields.tsx` |
| Ficha del hijo | Chips de tipo de alergia y de tipo de sangre | `features/childRecord/RecordFormParts.tsx` |
| Familia | Tarjetas de rol al invitar (borde, aro y punto) | `features/family/InviteForm.tsx` |
| Unir hijos | Tarjeta de elección (borde y círculo con palomita) | `features/family/merge/ChoiceCard.tsx` |
| Crecimiento | Pastillas de rango «0–3 años / Hasta 10 años / Hasta 19 años» | `features/growth/ChartCard.tsx` |
| Botiquín | Chips de unidad (cajas, tabletas, frascos, ml) | `features/medicineCabinet/CabinetFormPage.tsx` |

Ya están en acción y no cambian: selector de hora, chips de síntomas, el panel del PDF, la barra lateral, «Mostrar detalle /
Texto genérico» de los recordatorios.

**No cambian** (no son una opción elegida): textos y títulos en tinta; el borde de error del campo de tipo de actividad; el
borde de un campo con foco o de un panel abierto (`formStyles`, `TimeField`); botones sólidos y bandas oscuras (diálogos de
confirmación en tono tinta, aviso de versión, pantallas de error y de inicio de sesión); avatares y chips de rol fijos; el
recuadro «Nuevo aviso» de la cita.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Lo elegido se ve en el azul de la app (Prioridad: P1)

Al crear una actividad, Ana toca «Ciertos días», «horas» y el tipo «Deportiva». Cada opción elegida se pinta en el azul de
acción con texto blanco, de la misma familia que el borde celeste y el texto azul de las demás; lo elegido se reconoce también
por una segunda señal (la palomita en los chips, el punto en las tarjetas de opción, el relleno en los segmentados).

**Por qué esta prioridad**: es el pedido completo.

**Prueba Independiente**: abrir cada pantalla del inventario a 390 y 1280 px y elegir una opción: se ve en azul de acción con
texto blanco; ninguna opción elegida se ve en tinta.

**Escenarios de Aceptación**:

1. **Dado** cualquier control del inventario, **Cuando** se elige una opción, **Entonces** su fondo (o su borde y su punto, en
   las tarjetas de opción) es el azul de acción y su texto blanco, con contraste de al menos 4.5:1.
2. **Dado** una opción sin elegir, **Entonces** se ve como hoy (borde celeste, texto azul).
3. **Dado** una opción elegida, **Entonces** el color no es la única señal: los chips llevan palomita, las tarjetas de opción su
   punto, y el lector de pantalla anuncia el estado como hoy.
4. **Dado** el foco del teclado sobre una opción elegida, **Entonces** el aro de foco se sigue viendo.

### Casos Límite

- **Una opción elegida y deshabilitada** (p. ej. un control bloqueado por el plan): mantiene la opacidad de deshabilitada de
  hoy sobre el color nuevo.
- **Campo con error** (tipo de actividad sin elegir): el borde de error sigue en tinta; no se confunde con una selección.
- **Calendario del tratamiento**: la celda del día elegido es un diseño propio (spec 022, con puntos de color encima); queda
  igual en esta spec.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: La opción elegida de cada control del inventario DEBE dibujarse en el azul de acción con texto blanco (o borde y
  punto de acción en las tarjetas de opción), en los dos diseños.
- **FR-002**: Ninguna opción elegida de un control de elegir DEBE dibujarse con fondo de tinta; la tinta queda para texto,
  bandas y botones de confirmación.
- **FR-003**: La opción elegida DEBE tener una segunda señal además del color (palomita, punto o la forma del segmentado) y
  conservar sus atributos de accesibilidad.
- **FR-004**: Las opciones sin elegir, las medidas, los textos y el orden NO cambian.
- **FR-005**: La regla DEBE quedar escrita en el sistema visual (`design-tokens.md`) y vigilada por una prueba, para que un
  control nuevo no vuelva a la tinta.

### Entidades Clave

Ninguna: solo presentación.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Los 9 controles del inventario muestran la opción elegida en azul de acción (verificado en pruebas y a 390/1280 px).
- **SC-002**: Contraste de la opción elegida ≥ 4.5:1 (blanco sobre `#0e7490` = 5.36:1).
- **SC-003**: Una prueba falla si un control vuelve a usar fondo de tinta para la opción elegida.
- **SC-004**: Ningún otro cambio visual fuera del inventario (comparación antes/después).

## Supuestos

- Solo frontend: sin API, migración ni textos nuevos.
- Los mocks ya entregados que dibujaban la elegida en tinta (075, 073, 074, 062…) quedan superados por esta decisión del dueño;
  se anota como decisión, no como desviación.

## Fuera de Alcance (decisión del dueño, 2026-11-20: se dejan igual por ahora; anotados en `BACKLOG.md`)

- La celda del día elegido del **calendario del tratamiento** (tinta con puntos de colores encima, spec 022).
- Las **pestañas Peso / Talla** y la tabla **Niña / Niño** de crecimiento: hoy la activa lleva borde de acción sobre fondo
  blanco, sin relleno de tinta.
- El borde de **«Tu plan actual»** en Planes (estado informativo, no un control).
