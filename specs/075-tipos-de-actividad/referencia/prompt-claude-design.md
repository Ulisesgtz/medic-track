# Prompt para Claude Design — spec 075

Pegar en Claude Design, en el mismo canvas de PediTrack (sistema visual existente).

---

Diseña para **PediTrack** (bitácora médica infantil, español de México, sistema visual ya existente: tinta `#04252b`,
acción `#0e7490`, Figtree, tarjetas blancas con borde fino, un solo botón sólido por pantalla, chips neutros) los
**tipos de actividad**. Cada estado en **teléfono (390 px)** y **web (1280 px, con la barra lateral de la app)**, como
diseños separados. Tono neutral: sin rojo, verde ni ámbar de alerta, sin felicitaciones ni juicios; el tipo solo
organiza.

Contexto: las actividades de un hijo (spec 035/036) son cosas como «Práctica de fut» (martes y jueves 17:00), «Tarea de
inglés» (lunes a viernes 18:00), «Tomar agua» (cada hora de 08:00 a 20:00) y «Terapia de lenguaje» (miércoles 16:00),
con «Realizado». Ahora cada actividad tiene un **tipo** de un catálogo fijo, en este orden: **Escolar, Deportiva,
Artística y cultural, Terapia y seguimiento, Hábitos y cuidado diario, Otra**.

Estados:

- **A. Sección «Actividades» del detalle del hijo, separada por tipo.** Hoy es una lista de filas compactas (nombre,
  frecuencia, estado; en web una línea, en el teléfono nombre arriba y frecuencia abajo). Ahora: un segmento por tipo
  que tenga actividades, con el nombre del tipo como título, en el orden del catálogo; los tipos sin actividades no
  aparecen. Ejemplo de Mateo: Escolar (Tarea de inglés), Deportiva (Práctica de fut, Natación — pausada), Terapia y
  seguimiento (Terapia de lenguaje), Hábitos y cuidado diario (Tomar agua). Mantén el botón «+ Agregar actividad» de la
  sección. Variante A2: todas de un solo tipo (un solo segmento). Variante A3: sin actividades (el vacío de hoy).
- **B. La misma sección en «Yo» (`/yo`)** con actividades personales (p. ej. Deportiva: Salir a correr; Hábitos: Leer).
- **C. Formulario «Nueva actividad»**: el campo **«Tipo de actividad»** (obligatorio, ninguno elegido al abrir) con los
  seis tipos; decide el control (chips seleccionables, lista de opciones o selector) y su lugar en el formulario
  (sugerencia: después del nombre). C2: el error al guardar sin tipo, junto al campo («Elige el tipo de actividad.»).
- **D. Detalle de una actividad**: la fila «Tipo · Deportiva» con «Cambiar» y el diálogo/hoja para elegir otro tipo
  (el actual marcado, «Guardar» sólido y «Cancelar»). D2: el mismo detalle con el plan vencido o la actividad
  finalizada (no hay «Editar», pero «Cambiar» el tipo sí está).
- **E. Opcional**: un icono por tipo, solo decorativo (el nombre siempre escrito), sin colores de alerta.

Al final, una lista de decisiones de diseño numeradas.
