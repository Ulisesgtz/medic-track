# Desviaciones del mock — Spec 075 «Tipos de actividad»

Mock: `Tipos de actividad PediTrack.dc.html` (estados A, A2, A3, B, C, C2, D, D1, D2, D3, E). Medidas, textos, SVG de los iconos y
colores tomados del HTML del mock. El dueño decidió implementar también el estado E (iconos por tipo: no es desviación). Lo que
sigue es lo que **no** es igual y por qué; cada punto espera la aprobación del dueño.

## Medición (hecha, 2026-11-19)

Con una prueba temporal de Playwright (no subida al repo) se midió la app a 390 y 1280 px y se abrió el HTML del mock para medir los
mismos artboards (capturas en el scratchpad de la sesión, no en el repo). Resultado tras corregir:

| Parte | Mock | App |
|---|---|---|
| A/E sección «Actividades» teléfono | 652 px | 652 px |
| A/E sección web (ancho de la columna distinto: 552 vs 580) | 612 px | 612 px |
| Tarjeta de segmento: encabezado / fila teléfono / fila web | 58 / 64 / 56 px | 58 / 64 / 56 px |
| Ancho del título de cada tipo (Escolar, Deportiva, Terapia…, Hábitos…) | 101.7 / 122.8 / 218.9 / 236.5 | idéntico |
| C2 grupo de tipo, teléfono / web | 313 / 192 px | 313 / 192 px |
| D1 hoja (teléfono, alto total) | 457 px | 456 px |
| D1 diálogo web | 335 px | 335 px |
| D2 nota, teléfono | 114 px | 114 px |

Lo corregido tras medir: el interlineado de las filas y los títulos (el mock usa `normal`, la app traía 1.5 y cada fila salía unos px
más alta), el espacio entre tarjetas del teléfono (12 px, no 10), el margen bajo la leyenda del diálogo (8 px), y la segunda línea de
cada fila de actividad, que ahora se dice como en el mock («Lun a vie · 18:00», «Mar y jue · 17:00», «Cada hora · 08:00 a 20:00»;
`activityRowText`).

Sin medir 1:1: la nota D2 en la web (el mock la dibuja en una columna de 341 px y la app en una de 372, así que ocupa 93 px en vez de
114 por el ancho, no por el diseño) y el artboard D3 (solo se comprobó por prueba que no trae «Realizado» ni botones y conserva «Cambiar»).

## Diferencias de estructura

1. **«+ Agregar actividad» en el encabezado solo en «Actividades».** El mock lo dibuja en el encabezado de la sección; hoy la app lo
   tiene **debajo** de la lista, punteado, en todas las secciones. Se movió **solo en «Actividades»** (hijo y `/yo`); «Suplementos»
   conserva el suyo debajo porque el mock dice que «siguen igual».
2. **El formulario del mock está abstraído.** Las artboards C y C2 dibujan «Días: Sábados» y «Hora: 10:00» como campos de texto
   simples; la app conserva su formulario real. Solo se replicó el **campo de tipo** y su lugar (después del nombre, antes de «Cuándo se
   hace»).
3. **Los datos del detalle (D) son los de la app, no los del mock.** La tarjeta de datos conserva sus filas reales («Días», «Horas»,
   «Fechas», «Agregada por»…) en lugar de «Frecuencia / Hora / Desde», y «Editar» sigue en el encabezado de la pantalla en vez de junto a
   «Pausar» (así es hoy el detalle de la spec 056). Lo del mock que sí es igual: «Tipo» primero, «Cambiar» subrayado de 44 px, los
   botones de contorno y «Finalizar actividad» como texto subrayado.
4. **Las filas de los segmentos no llevan el icono redondo** de la fila (`DayIcon`) que sí llevan las filas de «Suplementos»: el mock no
   lo dibuja (el icono del tipo va en el título del segmento).
5. **La segunda línea de las filas** sigue la regla compacta del mock para los casos que dibuja (rango de días, dos días, un día,
   «Cada hora · desde a hasta»); para los que no dibuja se extiende igual: días sueltos «Lun, Mié, Vie», «Todos los días · 07:00 y
   19:00» y, en una actividad de ventana con días elegidos, los días antes de «Cada …».

## Diferencias de comportamiento

6. **D2 también para la actividad de un hijo.** El mock lo dibuja con la actividad de Mateo. Hoy la app deja «Pausar» a quien maneja la
   actividad de un hijo con el plan vencido (el servidor lo permite); para una actividad se quitó «Pausar»/«Reanudar»/«Editar» como en el
   mock (para un suplemento no cambia). **«Finalizar actividad» (y «Eliminar», si no hay marcas) se conservan** en D2: el mock no las
   dibuja, pero el servidor las permite sin plan y quitarlas dejaría a quien tiene el plan vencido sin forma de cerrar o corregir su
   registro (Principio IV).
7. **El catálogo cargando o con error** (no está en el mock): un renglón «Cargando los tipos…» o un aviso neutral «No pudimos cargar los
   tipos de actividad…»; en el diálogo igual. En la lista, sin catálogo, se muestra la lista sin segmentos.
8. **Un tipo retirado** (no está en el mock): se muestra elegido en el formulario y en el diálogo mientras sea el de la actividad, y su
   segmento conserva nombre e icono; un código que el catálogo no conoce usa el icono de «Otra» y se nombra por su código.
9. **El diálogo** no tiene la «×» de cerrar (el mock no la dibuja); se cierra con «Cancelar», Escape o tocando fuera. El foco inicial va a
   la elección actual (el mock no lo define).
10. **Vacío en `/yo`**: el mock A3 solo dibuja el del hijo («…hábitos de Mateo para llevar su registro.»); en `/yo` el mock B no dibuja
    vacío, así que la frase va sin nombre: «Agrega rutinas, deportes, terapias o hábitos para llevar tu registro.».

## Colores y tokens

11. **Grises de pizarra.** El asa de la hoja (`#94a3b8` en el mock) es `bg-slate-400` y el chip «Pausada»/«Terminada» (`#f1f5f9`) es
    `bg-slate-100`: los `slate-*` de Tailwind v4 son oklch y salen uno o dos niveles distintos del hex del mock (ya pasa en el resto de la
    app). El texto del chip es `text-muted` (`#475569`, token).
12. **La palomita** de los chips usa `stroke="currentColor"` (blanco por el texto del chip elegido) en vez de `#ffffff`, para no escribir
    un color literal (`noColorLiterals.test.ts`).
13. **Error del campo sin rojo.** Aplicado como el mock (borde de tinta de 2 px y texto de tinta en negrita). Queda abierta la pregunta del
    mock («cuál regla manda: rojo para errores de formulario o tinta»): el resto de la app usa `red-700` para los errores de campo.

## Lo que el mock dejó abierto y se resolvió así

14. **Las actividades existentes** quedan en «Hábitos y cuidado diario» (la migración `0041`), no en «Otra»; el padre las cambia con
    «Cambiar».
15. **La nota de plan vencido** es el texto del mock D2 tal cual (el mock avisa que el texto es suyo).
16. **«Yo»** en la barra lateral: la sección de `/yo` es la misma que la del hijo (`RegistroCompacto`), como supone el mock; no se cambió
    el nombre de ninguna entrada.
