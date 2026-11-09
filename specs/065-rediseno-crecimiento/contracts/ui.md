# Contrato de la interfaz: «Crecimiento» (spec 065)

No cambia ningún contrato HTTP: se usan los de la spec 063 (`specs/063-curvas-crecimiento/contracts/api.md`). Este contrato fija lo que las pruebas y la E2E leen de la pantalla.

## Rutas (sin cambios)

- `/children/:childId/crecimiento`: la pantalla.
- `/children/:childId/crecimiento/nueva`: anotar. Con `state.registered` llega con la medida del registro ya escrita.
- `/children/:childId/crecimiento/:measurementId/editar`: corregir.

## Encabezado

- Enlace «← {nombre}» que lleva a `/children/:childId`.
- `h1` con «Crecimiento».
- Subtítulo «{nombre} · {edad}».
- Enlace «+ Anotar medida» que lleva a `…/nueva`: solo con `canEdit` y medidas.

## Regiones (nombres accesibles)

| Región | Rol / nombre | Contenido |
|---|---|---|
| Última medida | `section` «Última medida» | «ÚLTIMA MEDIDA», «11.4 kg · 82 cm», «hace 12 días · 12 oct 2026» |
| Registro | `section` «Medida del registro» | «AL REGISTRAR A MATEO», «3.3 kg · 50 cm», «Sin fecha, por eso no aparece en la gráfica.», enlace «Anotarla con fecha» (solo `canEdit`) |
| Gráfica | `section` «Gráfica de crecimiento» | ver abajo |
| Bloqueada | `section` «Gráfica de crecimiento» | `h2` «Gráfica de crecimiento», «Plan completo», «Con el Plan completo ves las medidas de Mateo sobre las curvas de la OMS.», botón «Ver la gráfica» |
| Vacía | — | «Aún no hay medidas anotadas», «Anota el peso, la talla o los dos, con la fecha en que se midieron.», enlace «Anotar la primera medida» (solo `canEdit`) |
| Lista (teléfono) | `section` «Medidas anotadas» + `role=list` | `h2` «Medidas anotadas», «N medidas»; cada `listitem`: fecha, valores, edad, «Anotada por Ana», «Nota: …», «Corregida el … por …», «Corregir» / «Quitar» |
| Tabla (web) | `role=table` «Medidas anotadas» | encabezados Fecha · Edad · Peso · Talla · Anotada por · (Acciones, oculto); celda vacía «—» con `aria-label` «Sin peso anotado» / «Sin talla anotada» |
| Nota OMS | `role=note` | «Las curvas son la referencia de la OMS para niñas y niños nacidos a término.» + «Tu pediatra es quien interpreta la gráfica.» |
| Solo lectura | `role=note` | «**Vista de Cuidadora.** Puedes ver las medidas. Anotarlas lo hace la familia.» (Cuidador) o «**Solo lectura.** …» (otro rol sin escritura) |

## Tarjeta de la gráfica

- `role=tablist` «Medida en la gráfica» con dos `tab`: «Peso» y «Talla» (`aria-selected`).
- `role=group` «Rango de edad»: botones «0–3 años» y «Hasta 10 años» / «Hasta 19 años» (`aria-pressed`).
- La invitación (D, `canEdit`): «Elige la tabla de la OMS para ver las curvas de referencia.» + «Por ahora ves solo las medidas de Mateo.» + botones «Niña» y «Niño».
- La lectura (`aria-live=polite`):
  - botón «Medida anterior» (‹) y botón «Medida siguiente» (›), `disabled` en los extremos;
  - en el teléfono, el valor y debajo «fecha · edad»;
  - en la web, «fecha · valor · edad» en una línea.
- `svg` `role=img` con el nombre «Gráfica de {peso|talla} de {nombre}. Los mismos datos están en Medidas anotadas.».
- Selector (`canEdit` y tabla elegida): «Curvas de la OMS para» + `role=group` «Tabla de la OMS» con «Niña» y «Niño» (`aria-pressed`).
- Sin `canEdit` y con la tabla elegida: «Curvas de la OMS para {niña|niño}. La tabla la elige {Ana}.».
- La nota OMS va dentro de la tarjeta.
- Si la referencia está apagada: la frase `referenceOff`, sin invitación, sin selector y sin la nota de las curvas.

## Formulario

- `h1`: «Anotar medida» o «Corregir medida»; volver es «← Crecimiento».
- Campos:
  - «Fecha» (`type=date`, `max` = hoy, `min` = nacimiento);
  - «Peso», con el sufijo «kg» visible y fuera del nombre;
  - «Talla», con el sufijo «cm»;
  - «Nota (opcional)».
- «Puedes anotar solo el peso o solo la talla.»
- Errores con `role=alert` bajo su campo:
  - fecha futura: «Esa fecha aún no llega. Elige hoy o un día anterior.»;
  - peso inválido: «Escribe el peso en kilos, con punto decimal. Por ejemplo: 11.6»;
  - talla inválida: «Escribe la talla en centímetros. Por ejemplo: 83»;
  - fecha anterior al nacimiento: «Esa fecha es antes del nacimiento. Elige otra.»;
  - sin valores: «Escribe el peso, la talla o los dos.».
- Botón «Guardar medida»:
  - teléfono: fijo abajo;
  - web: a la derecha, junto a «Cancelar».

## Aviso del plan

«Ver la gráfica» abre `FreemiumLimitModal` con `reason="growth_chart"`. Es una desviación del mock.
