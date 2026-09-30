# Contrato de interfaz: calendario del tratamiento

Sin endpoint. Lo que ve y puede hacer el padre, y los nombres accesibles que las pruebas usan.

## Bloque «Calendario del tratamiento» (detalle de la consulta, antes de «Medicamentos»)

| Elemento | Texto / nombre accesible |
|---|---|
| Encabezado | «Calendario del tratamiento» |
| Título del mes | «septiembre 2026» (`aria-live="polite"`) |
| Flechas | «Mes anterior» / «Mes siguiente» (deshabilitadas en el primer y último mes con tratamiento) |
| Cabecera de días | `L M M J V S D` (lunes primero) |
| Día | `<button>`; nombre «30 de septiembre» y, con marcas, «30 de septiembre · 1 Amoxicilina, 2 Paracetamol»; `aria-pressed` si es el seleccionado; `aria-current="date"` si es hoy |
| Marca | círculo del color del medicamento con su número (1–6), `aria-hidden` (el nombre del día ya la dice) |
| Leyenda | una fila por medicamento: marca + «Amoxicilina» (en el orden de la consulta) |
| Lista del día | encabezado «Tomas del 30 de septiembre» (o «Tomas de hoy» si es hoy); vacía: «Ese día no hay tomas.» |
| Fila de la lista | marca + medicamento + chip de toma; el chip se llama «Amoxicilina, 08:00» y mantiene `aria-pressed`, estado «sin registrar»/«cancelada» y el marcar/desmarcar de hoy |

## Colores (se agregan a `design-tokens.md`)

`--color-med-1 … --color-med-6` (candidatos en research R3; valores finales tras medir contraste y daltonismo). Se
repiten con más de 6 medicamentos; el número es el segundo indicador. Nunca rojo, verde (`confirmed`), ámbar (`pending`)
ni cian.

## Reglas

- Mismos estados y reglas que los chips de los medicamentos (spec 013/016); marcar desde la lista actualiza el detalle y
  el resumen del hijo (`useDoseToggle`).
- Textos neutros: nada de «atrasado», «falta» ni avisos (Principio I).
