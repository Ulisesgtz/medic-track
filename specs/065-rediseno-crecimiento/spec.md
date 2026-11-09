# Especificación de Funcionalidad: Rediseño de «Crecimiento»

**Rama de la Funcionalidad**: `feature/065-rediseno-crecimiento`

**Creado**: 2026-11-09

**Estado**: Borrador

**Entrada**: Descripción del usuario: el dueño vio la pantalla «Crecimiento» de la spec 063 y «no se entiende». Pidió a Claude Design un rediseño legible con la marca y lo entregó: `referencia/Crecimiento PediTrack.dc.html` (estados A–G, teléfono 390 px y web 1280 px, con la sección «Medidas y decisiones»). Se construye **exactamente ese mock**.

## Contexto

- La spec 063 creó el historial de medidas del hijo (fecha, peso y/o talla, nota) y la gráfica con las curvas P3–P97 de la OMS. Esta spec **no cambia qué se guarda ni quién puede hacer qué**: solo cómo se ve y se lee la pantalla y su formulario.
- Todo lo que el mock muestra ya existe en los datos de la spec 063: las medidas con su autor y su corrección, la medida del registro sin fecha, la tabla Niña/Niño elegida, la fecha de nacimiento, si la persona puede editar, si su plan tiene la gráfica y, para la gráfica, los puntos en meses y las curvas de referencia (peso hasta 10 años, talla hasta 19).
- Reglas del proyecto que siguen:
  - **Principio I**: registrar, nunca interpretar. Nada de percentil del hijo, «normal», tendencias ni colores de alerta.
  - **Dos diseños que nunca se mezclan**: teléfono y web.
  - **Solo un botón sólido por pantalla.**
  - **Accesibilidad**: contraste de 4.5:1 y áreas táctiles de 44 px.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Ver de un vistazo cómo va el hijo (Prioridad: P1)

Ana abre «Crecimiento» de Mateo.

- Arriba ve en grande la última medida («11.4 kg · 82 cm») y cuándo se tomó («hace 12 días · 12 oct 2026»).
- Debajo ve una gráfica clara:
  - pestañas Peso / Talla;
  - un rango de edad corto por omisión («0–3 años»), así los puntos de Mateo ocupan casi todo el ancho;
  - las curvas grises de la OMS con su nombre al final de cada una;
  - la línea de Mateo en color con sus puntos;
  - arriba de la gráfica, la lectura fija de la medida elegida («11.4 kg», «12 oct 2026 · 2 años 1 mes»).
- Puede recorrer las medidas con ‹ › o tocando la gráfica.
- Debajo de la gráfica están:
  - el selector «Curvas de la OMS para Niña · Niño»;
  - la nota fija de la OMS y «Tu pediatra es quien interpreta la gráfica».

**Por qué esta prioridad**: es la razón del rediseño: la pantalla de hoy no se entiende.

**Prueba Independiente**: con un hijo con 8 medidas y la tabla elegida, la pantalla se ve como el estado A y, al cambiar de pestaña, como el estado B, en ambos diseños.

**Escenarios de Aceptación**:

1. **Dado** un hijo con medidas, **Cuando** se abre la pantalla, **Entonces**:
   - la tarjeta «Última medida» muestra los valores de la medida más reciente y «hace N días · fecha»;
   - la lectura de la gráfica muestra esa misma medida.
2. **Dado** la gráfica de Peso, **Cuando** se toca «Talla», **Entonces**:
   - la gráfica, sus ejes y la lectura pasan a talla;
   - la medida elegida vuelve a ser la más reciente con talla.
3. **Dado** la gráfica, **Cuando** se toca ‹ o ›, **Entonces** la lectura y el punto resaltado pasan a la medida anterior o a la siguiente; en el primer y en el último punto el botón se ve atenuado.
4. **Dado** la gráfica, **Cuando** se toca cualquier parte del área de datos, **Entonces** se elige la medida más cercana en fecha a ese lugar.
5. **Dado** el rango «0–3 años», **Cuando** se toca «Hasta 10 años» (Peso) o «Hasta 19 años» (Talla), **Entonces** la gráfica muestra toda la referencia.
6. **Dado** cualquier estado, **Entonces** ningún texto dice dónde está el hijo respecto a la referencia, qué es normal o qué hacer.

---

### Historia de Usuario 2 - Leer y corregir las medidas anotadas (Prioridad: P1)

Ana ve «Medidas anotadas · 8 medidas»:

- **En el teléfono**: una lista. Cada medida muestra:
  - la fecha y los valores;
  - la edad en ese momento y «Anotada por Ana»;
  - la nota y la corrección, si las tiene;
  - «Corregir» y «Quitar».
- **En la web**: una tabla con las columnas Fecha / Edad / Peso / Talla / Anotada por y las acciones. Una celda sin valor dice «—».

Esta lista es la versión accesible de la gráfica, con los mismos datos.

**Por qué esta prioridad**: los mismos datos que la gráfica, legibles sin ella. Además la usan el plan gratuito y quien no ve la gráfica.

**Prueba Independiente**: con 8 medidas, la lista del teléfono y la tabla de la web muestran las 8, de la más reciente a la más antigua, con las acciones solo para quien puede editar.

**Escenarios de Aceptación**:

1. **Dado** una medida con solo peso, **Entonces**:
   - la fila del teléfono muestra solo el peso;
   - la celda de talla de la web dice «—» y su nombre accesible dice «Sin talla anotada».
2. **Dado** una medida corregida, **Entonces** la fila dice «Corregida el … por Luis».
3. **Dado** quien puede editar, **Cuando** toca «Corregir», **Entonces** abre el formulario con esa medida; **Cuando** toca «Quitar», **Entonces** pide confirmación como hasta hoy.

---

### Historia de Usuario 3 - Anotar o corregir una medida (Prioridad: P1)

Ana toca «+ Anotar medida». El formulario «Anotar medida» tiene:

- **Fecha**;
- **Peso** (sufijo «kg») y **Talla** (sufijo «cm») lado a lado;
- «Puedes anotar solo el peso o solo la talla.»;
- **Nota (opcional)**.

Los errores aparecen bajo su campo, con un ícono «!» y palabras neutrales. En el teléfono, «Guardar medida» va fijo abajo. En la web, la tarjeta mide 600 px y lleva «Cancelar» y «Guardar medida» a la derecha. «Corregir» abre el mismo formulario con el título «Corregir medida».

**Por qué esta prioridad**: anotar es la acción principal; el formulario es parte del mock (G1/G2).

**Prueba Independiente**: anotar una medida con peso y talla desde ambos diseños y verla en la lista y en la gráfica; intentar una fecha futura y un peso fuera de rango y leer los mensajes del mock.

**Escenarios de Aceptación**:

1. **Dado** una fecha futura, **Entonces** el campo dice «Esa fecha aún no llega. Elige hoy o un día anterior.» y no se guarda.
2. **Dado** un peso que no es válido, **Entonces** el campo dice «Escribe el peso en kilos, con punto decimal. Por ejemplo: 11.6».
3. **Dado** datos escritos, **Cuando** se sale, **Entonces** pide confirmar, como hasta hoy.

---

### Historia de Usuario 4 - Estados especiales (Prioridad: P2)

Cada estado especial se ve como su estado del mock.

- **C, sin medidas**:
  - «Aún no hay medidas anotadas» con «Anotar la primera medida» como único botón sólido;
  - sin gráfica ni lista;
  - la nota de la OMS y la caja de la medida del registro.
- **D, sin elegir Niña · Niño**:
  - la gráfica solo con los puntos del hijo;
  - arriba, la invitación «Elige la tabla de la OMS para ver las curvas de referencia.» / «Por ahora ves solo las medidas de Mateo.» con los botones Niña y Niño;
  - debajo de la gráfica no está el selector.
- **E, plan gratuito**:
  - la última medida y la lista completas;
  - en lugar de la gráfica, la tarjeta «Gráfica de crecimiento · Plan completo» con «Con el Plan completo ves las medidas de Mateo sobre las curvas de la OMS.» y «Ver la gráfica», que abre el aviso del plan;
  - la gráfica nunca se pide.
- **F, Cuidadora (solo lectura)**:
  - la nota «**Vista de Cuidadora.** Puedes ver las medidas. Anotarlas lo hace la familia.» bajo el título;
  - sin «+ Anotar medida», sin «Corregir» ni «Quitar», sin el selector y sin «Anotarla con fecha»;
  - bajo la gráfica, «Curvas de la OMS para niño. La tabla la elige Ana.».

**Por qué esta prioridad**: son casos reales de la spec 063 que deben verse bien, pero son menos frecuentes que A/B.

**Prueba Independiente**: cada estado se reproduce con su cuenta (sin medidas, sin tabla, plan gratuito, Cuidadora) y se compara con el mock en ambos diseños.

**Escenarios de Aceptación**:

1. **Dado** un plan gratuito, **Cuando** se toca «Ver la gráfica», **Entonces** se abre el aviso del plan y no se pide ninguna gráfica.
2. **Dado** una Cuidadora, **Entonces** no hay ningún control de escritura en la pantalla.
3. **Dado** sin tabla elegida, **Cuando** quien puede editar toca «Niño», **Entonces** las curvas aparecen y la invitación se cambia por el selector bajo la gráfica.

### Casos Límite

- **Una sola medida**: la gráfica la dibuja como un punto sin línea, y ‹ › quedan atenuados.
- **La última medida solo trae un valor** (p. ej. solo peso): la tarjeta «Última medida» muestra solo ese valor. No mezcla con otra medida anterior, para que lo mostrado sea siempre una sola medida.
- **Una pestaña sin medidas de su tipo** (hay peso pero nunca talla): la gráfica de Talla dice «Aún no hay medidas de talla.», sin lectura ni ‹ ›.
- **El hijo es mayor que el rango corto, o el rango de la referencia termina antes** (más de 10 años en peso): el rango por omisión crece hasta el año entero siguiente, sin pasar del final de la referencia. Más allá de esa edad los puntos se dibujan sin curvas, con la nota que ya existe («La referencia de la OMS de peso para la edad llega a los 10 años.»).
- **Referencia de la OMS apagada** (sin permiso de licencia): la gráfica muestra solo los puntos con la frase que ya existe («La referencia de la OMS aún no está disponible…»), sin invitación ni selector Niña/Niño, y sin la nota de las curvas.
- **La gráfica no carga**: dentro de su tarjeta aparece «No pudimos cargar la gráfica.» con «Reintentar»; la lista sigue visible.
- **Sin medida del registro**: la caja punteada no aparece. En la web, la última medida ocupa toda la fila.
- **«hace N días»**:
  - «hoy» y «ayer» para 0 y 1 días;
  - «hace N días» hasta 30 días;
  - después, «hace N meses» y «hace N años».
- **Un hijo de menos de un año**: el rango corto dice «0–1 año».

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: La pantalla DEBE construirse como el mock entregado, con un diseño de teléfono (390 px) y uno web (1280 px con la barra lateral de la app). Se elige uno u otro por el ancho y nunca se mezclan.
- **FR-002**: El encabezado DEBE tener:
  - «← {nombre}» que vuelve al hijo, el título «Crecimiento» y «{nombre} · {edad}»;
  - «+ Anotar medida» como único botón sólido, solo para quien puede editar y cuando hay medidas: bajo el título en el teléfono, a la derecha en la web.
- **FR-003**: Con medidas, la tarjeta «Última medida» DEBE mostrar los valores de la medida más reciente por fecha (solo los que tenga) y «hace … · fecha».
- **FR-004**: La medida del registro (sin fecha), si existe, DEBE ir en una caja punteada:
  - «Al registrar a {nombre}», los valores y «Sin fecha, por eso no aparece en la gráfica.»;
  - «Anotarla con fecha» solo para quien puede editar;
  - en la web va junto a la última medida (proporción 1.7 a 1); en el teléfono, después de la lista.
- **FR-005**: La gráfica DEBE tener:
  - pestañas Peso / Talla;
  - un rango corto por omisión (desde el nacimiento hasta el año entero siguiente a la edad del hijo) y uno completo («Hasta 10 años» / «Hasta 19 años»);
  - la lectura fija de la medida elegida con ‹ ›;
  - el área de datos que elige la medida más cercana al tocarla;
  - las medidas, márgenes, tipografía y colores de la sección «Medidas y decisiones» del mock.
- **FR-006**: Las curvas de referencia DEBEN ser líneas grises finas con solo «P3…P97» al final de cada una, sin relleno entre ellas. La línea del hijo es la única en color y con puntos. El punto elegido va más grande, con aro y una guía punteada vertical.
- **FR-007**: El eje X DEBE decir:
  - «meses» bajo 0–24;
  - «años» después, con una marca más larga en los 2 años.
  
  El eje Y DEBE llevar su unidad arriba («kg» / «cm») y la rejilla solo horizontal.
- **FR-008**: El selector «Curvas de la OMS para Niña · Niño» DEBE ir bajo la gráfica, solo para quien puede editar. Sin tabla elegida, en su lugar va la invitación del estado D. Quien no puede editar lee «Curvas de la OMS para {niña|niño}. La tabla la elige {nombre de la dueña}.».
- **FR-009**: La nota fija «Las curvas son la referencia de la OMS para niñas y niños nacidos a término.» + «Tu pediatra es quien interpreta la gráfica.» DEBE estar:
  - dentro de la tarjeta de la gráfica;
  - fuera de ella en los estados C y E.
- **FR-010**: «Medidas anotadas · N medidas» DEBE mostrarse, de la más reciente a la más antigua:
  - en el teléfono, como lista;
  - en la web, como tabla con encabezados y «—» en la celda vacía (nombre accesible «Sin peso anotado» / «Sin talla anotada»).
  
  Es la alternativa accesible de la gráfica: la tabla que la gráfica tenía dentro se quita.
- **FR-011**: «Corregir» y «Quitar» (con la confirmación de hoy) DEBEN aparecer solo para quien puede editar.
- **FR-012**: El estado sin medidas DEBE mostrar «Aún no hay medidas anotadas», «Anota el peso, la talla o los dos, con la fecha en que se midieron.» y «Anotar la primera medida», sin gráfica ni lista.
- **FR-013**: En el plan gratuito, en lugar de la gráfica DEBE aparecer la tarjeta «Gráfica de crecimiento» con la marca «Plan completo», su texto y «Ver la gráfica». Al tocarla se abre el aviso del plan **de la app**, el mismo de todos los límites. La gráfica nunca se pide.
- **FR-014**: Una Cuidadora (o un Tutor de una familia que dejó de pagar) DEBE ver la nota «Vista de Cuidadora…» y ningún control de escritura.
- **FR-015**: El formulario de anotar y corregir DEBE seguir el mock G1/G2:
  - etiquetas «Fecha», «Peso», «Talla» y «Nota (opcional)», con los sufijos «kg»/«cm» dentro del campo;
  - «Puedes anotar solo el peso o solo la talla.»;
  - errores bajo su campo con ícono «!» y los textos del mock;
  - «Guardar medida» fijo abajo en el teléfono;
  - en la web, una tarjeta de 600 px con «Cancelar» y «Guardar medida».
  
  La confirmación al salir con datos escritos se mantiene.
- **FR-016**: Ningún texto ni color de la pantalla DEBE evaluar al hijo (Principio I). Una prueba de redacción revisa todas las frases.
- **FR-017**: Todo control DEBE tener un área táctil de 44 px y todo texto un contraste de al menos 4.5:1. Las pestañas y los botones de rango dicen su estado a los lectores de pantalla. La gráfica tiene un nombre que remite a «Medidas anotadas», y la lectura se anuncia al cambiar.
- **FR-018**: Toda diferencia con el mock que se mantenga DEBE quedar listada con su motivo en `referencia/desviaciones.md` para que el dueño decida.

### Entidades Clave

No hay entidades nuevas; se muestran las de la spec 063:

- **Medida**: fecha, peso y/o talla, nota, quién la anotó, corrección.
- **Medida del registro**: peso y talla sin fecha.
- **Tabla de referencia**: Niña / Niño, o sin elegir.
- **Gráfica**: los puntos por edad en meses y las curvas P3–P97.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Puestos lado a lado con el mock y a su mismo ancho (390 y 1280 px), los estados A–G coinciden sección por sección: mismo orden, textos y colores, y tamaños con una tolerancia de ±2 px. Lo que no coincide está en la lista de desviaciones.
- **SC-002**: En el rango corto por omisión, los puntos de un hijo de 2 años ocupan al menos dos tercios del ancho de datos de la gráfica.
- **SC-003**: Una persona puede leer el valor y la fecha de cualquier medida de la gráfica con un toque o con ‹ ›, sin pellizcar ni hacer zoom, en un teléfono de 390 px.
- **SC-004**: La prueba de redacción no encuentra ninguna palabra que evalúe en las frases de la pantalla y del formulario.
- **SC-005**: Las pruebas de extremo a extremo de «Crecimiento» pasan a 390 y 1280 px (dueña, plan gratuito, Cuidadora), y la cobertura de pruebas del frontend sigue arriba del 90 %.

## Supuestos

- **Solo frontend**: no hay migración ni endpoints nuevos.
- **El aviso del plan es el de la app.** El mock dibuja uno propio («La gráfica es parte del Plan completo» / «Conocer el Plan completo» / «Ahora no»), pero la app tiene una regla: un solo aviso de plan para todos los límites, el de la spec 034. Se usa ese con su motivo de la gráfica y queda como desviación.
- **La barra lateral es la de la app.** La web del mock la dibuja simplificada («Inicio», «Tus hijos», «Familia», «Mi día»); la pantalla vive dentro de la barra que ya existe, sin cambiarla. Queda como desviación.
- **«Ana»** en «La tabla la elige Ana» es el nombre de pila de la dueña de la familia, que la app ya conoce.
- **Formato de los valores**, como en el mock:
  - el peso siempre con un decimal («9.0 kg»);
  - la talla sin decimales si es entera («82 cm») y con uno si no («59.5 cm»).
- **El rango se reinicia.** El rango elegido y la medida seleccionada no se recuerdan al salir de la pantalla.
- **Colores nuevos.** Los grises del mock que no existen como token (curvas, bordes de tarjeta, rejilla, texto apagado y borde de campo) se agregan al sistema visual con nombre.
- La pantalla de la spec 063 y sus pruebas se reemplazan, no conviven.
