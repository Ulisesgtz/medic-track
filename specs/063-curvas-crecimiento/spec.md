# Especificación de Funcionalidad: Curvas de crecimiento

**Rama**: `feature/063-curvas-crecimiento`
**Creada**: 2026-11-08
**Estado**: Borrador
**Entrada**: `BACKLOG.md` («Otras ideas del plan de pago»: curvas de crecimiento OMS, informativas) y las decisiones del dueño del 2026-11-08: peso y talla con fecha; la gráfica pone los puntos del hijo sobre las curvas de la OMS en gris, sin decir nunca en qué percentil está; anotar es de cualquier plan y la gráfica, del plan completo; sin mock (sistema visual).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Anotar el peso y la talla de cada consulta (Prioridad: P1)

En cada revisión el pediatra pesa y mide a Mateo y Ana lo escribe en una libreta que se pierde. Desde el detalle de Mateo abre «Crecimiento», toca «Anotar medida» y escribe la fecha de la revisión, el peso (12.4 kg), la talla (86 cm) y, si quiere, una nota («en ayunas»). La medida aparece en la lista, de la más reciente a la más antigua. Luis, Tutor de la misma familia, ve la misma lista y también anota.

**Por qué esta prioridad**: sin un historial de medidas con fecha no hay curva que dibujar; la lista por sí sola ya sirve (sustituye la libreta) y es de todos los planes.

**Prueba Independiente**: con una cuenta del plan gratuito, anotar tres medidas en fechas distintas de un hijo y verlas en la lista en orden, con su fecha, su peso, su talla y su nota.

**Escenarios de Aceptación**:

1. **Dado** el detalle de un hijo, **Cuando** la dueña abre «Crecimiento», **Entonces** ve la lista de medidas (o el estado vacío con «Anotar medida») y la marca de la edad del hijo en cada fila («1 año 5 meses»).
2. **Dado** el formulario «Anotar medida», **Cuando** escribe la fecha y solo el peso, **Entonces** se guarda (peso y talla son opcionales cada uno, pero al menos uno es obligatorio).
3. **Dado** una fecha futura o anterior al nacimiento, **Cuando** intenta guardar, **Entonces** ve el error en ese campo y no se guarda nada.
4. **Dado** un peso o una talla fuera de lo que se puede escribir (p. ej. 0 kg o 900 cm), **Cuando** intenta guardar, **Entonces** ve un error de formato neutral («Escribe el peso en kilogramos, entre 0.3 y 200»), nunca un juicio sobre el niño.
5. **Dado** una cuenta del plan gratuito, **Cuando** anota, corrige o borra una medida, **Entonces** puede hacerlo igual que una de pago.

---

### Historia de Usuario 2 - Ver la curva sobre la referencia de la OMS (Prioridad: P2)

Ana, con el plan completo, quiere llevar la gráfica a la consulta. En «Crecimiento» elige «Peso» o «Talla» y ve los puntos de Mateo (unidos por una línea) sobre las cinco curvas de referencia de la OMS dibujadas en gris y rotuladas solo con su nombre técnico (P3, P15, P50, P85, P97), con la edad en el eje horizontal. La app no dice dónde está Mateo, no colorea nada ni escribe ningún juicio.

**Por qué esta prioridad**: es el valor del plan completo, pero depende de que existan medidas (US1) y del sexo del hijo (US3).

**Prueba Independiente**: con una cuenta de pago, un hijo con sexo y tres medidas, abrir la gráfica de peso y la de talla y comprobar que los puntos están en su edad y su valor, las cinco curvas grises están rotuladas y no aparece ninguna palabra, color o número que evalúe.

**Escenarios de Aceptación**:

1. **Dado** un hijo con sexo y medidas, **Cuando** la dueña con plan completo abre la gráfica de peso, **Entonces** ve cada medida de peso como un punto en su edad (con la fecha y el valor al tocarlo) y las curvas P3–P97 de la OMS para su sexo en gris.
2. **Dado** la gráfica, **Cuando** cambia a «Talla», **Entonces** ve lo mismo con las medidas de talla.
3. **Dado** una cuenta del plan gratuito, **Cuando** toca «Ver la curva» (con la marca «Plan completo»), **Entonces** se abre el aviso del plan y no recibe datos de la gráfica; su lista de medidas sigue igual.
4. **Dado** una medida a una edad donde la OMS no publica curva (peso después de los 10 años, talla después de los 19), **Cuando** se ve la gráfica, **Entonces** el punto se dibuja sin curvas detrás y una nota neutral dice «La referencia de la OMS de peso para la edad llega a los 10 años».
5. **Dado** el texto de la pantalla y de la gráfica, **Cuando** se revisa, **Entonces** no contiene «normal», «bajo», «alto», «riesgo», «sobrepeso», «desnutrición», «percentil de tu hijo», «por debajo», «por encima», «debería» ni flechas o colores de alerta.

---

### Historia de Usuario 3 - Indicar el sexo para elegir la referencia (Prioridad: P2)

Las curvas de la OMS son distintas para niñas y niños, y la app no guarda el sexo del hijo. La primera vez que Ana abre la gráfica sin ese dato, ve «Para dibujar la referencia de la OMS, elige qué tabla usar: Niña · Niño» y su elección queda guardada para ese hijo; la puede cambiar después.

**Por qué esta prioridad**: sin el sexo no se puede elegir la curva; preguntarlo solo cuando hace falta evita tocar el registro del hijo.

**Prueba Independiente**: con un hijo sin sexo guardado, abrir la gráfica, elegir «Niño», volver a entrar y ver las curvas de niño sin que lo pregunte otra vez; cambiarlo y ver las de niña.

**Escenarios de Aceptación**:

1. **Dado** un hijo sin sexo guardado, **Cuando** la dueña con plan completo abre la gráfica, **Entonces** ve la elección «Niña · Niño» antes de las curvas, con la frase de por qué se pide.
2. **Dado** la elección hecha, **Cuando** vuelve a abrir la gráfica en otro dispositivo, **Entonces** ya no se le pregunta.
3. **Dado** un Cuidador (solo ve), **Cuando** abre la gráfica de un hijo sin sexo guardado, **Entonces** ve las medidas sin curvas y «Una persona adulta de la familia puede elegir la tabla de la OMS», sin poder elegirla.

---

### Historia de Usuario 4 - Corregir y quitar una medida (Prioridad: P3)

Luis anotó 124 kg en lugar de 12.4. Abre la medida, la corrige y la fila dice «Corregida el 8 nov por Luis». Otra la anotó dos veces y la borra (con confirmación neutral; borrar es real).

**Por qué esta prioridad**: los errores de captura pasan, pero no bloquean el uso diario.

**Prueba Independiente**: corregir el peso de una medida y ver el cambio en la lista y en la gráfica; borrar otra y verla desaparecer de ambas.

**Escenarios de Aceptación**:

1. **Dado** una medida, **Cuando** un Tutor de la familia de pago la corrige, **Entonces** se guarda y la fila muestra quién y cuándo la corrigió (solo el nombre de pila).
2. **Dado** una medida, **Cuando** la dueña toca «Quitar» y confirma, **Entonces** desaparece de la lista y de la gráfica y no se puede deshacer.
3. **Dado** un Cuidador o un Tutor de una familia que dejó de pagar, **Cuando** ve la lista, **Entonces** no tiene «Anotar», «Corregir» ni «Quitar» (el servidor también los rechaza).

---

### Casos Límite

- **Medidas del registro sin fecha**: algunos hijos tienen un peso y una talla anotados al crearlos, sin fecha. No se inventa una fecha: se muestran aparte («Anotado al registrar a Mateo, sin fecha: 85 cm · 12 kg») con un atajo «Anotarla con fecha» que abre el formulario con esos valores; no aparecen en la gráfica.
- **Varias medidas el mismo día**: se permiten (p. ej. dos básculas); la lista las muestra todas y la gráfica dibuja cada punto.
- **Bebé prematuro**: las curvas se dibujan por edad desde el nacimiento, sin corregir la edad gestacional (corregirla sería interpretar); un texto fijo de la gráfica dice que la referencia de la OMS es para niños nacidos a término y que el pediatra es quien la interpreta.
- **Longitud acostada y talla de pie**: la OMS mide acostado hasta los 2 años y de pie después; la app guarda «talla» tal como la dio el médico y no la ajusta.
- **Hijo mayor de 19 años**: la lista funciona; la gráfica de talla se dibuja sin referencia pasado ese límite.
- **Sexo cambiado después**: la gráfica se vuelve a dibujar con la otra tabla; las medidas no cambian.
- **Bajar de plan**: lo anotado se conserva, se ve, se corrige y se borra; solo la gráfica pide el plan.
- **Teléfono del hijo**: no ve «Crecimiento» (ni la lista ni la gráfica).
- **Dos personas anotan a la vez**: ambas medidas se guardan (no hay conflicto: cada una es una fila).
- **Tope**: un máximo generoso de medidas por hijo (500) para que un error de un programa no llene la base; pasarlo responde un aviso neutral.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE guardar, por hijo, un historial de medidas; cada medida tiene fecha (no futura, no anterior al nacimiento), peso en kilogramos (0.3–200, hasta 2 decimales) y/o talla en centímetros (30–220, hasta 1 decimal) —al menos uno de los dos—, una nota opcional (hasta 300 caracteres), quién la anotó y cuándo, y quién la corrigió por última vez y cuándo.
- **FR-002**: La lista de medidas DEBE mostrarse de la más reciente a la más antigua, con la fecha, la edad del hijo en esa fecha (años y meses; semanas o meses en el primer año), el peso, la talla, la nota y «Corregida el … por …» si aplica.
- **FR-003**: Anotar, corregir y borrar DEBEN estar disponibles en cualquier plan para quien tiene nivel completo sobre el hijo (la dueña y un Tutor de una familia de pago); ver la lista, para quien tiene nivel de ver y marcar (Cuidador, Tutor de una familia que dejó de pagar). Un integrante Hijo y el teléfono del hijo NO DEBEN verlas.
- **FR-004**: Borrar una medida DEBE pedir confirmación neutral y ser definitivo.
- **FR-005**: La gráfica DEBE ser del plan completo: el servidor decide el plan de la cuenta dueña y, sin plan completo, responde con el aviso del plan (motivo propio) sin entregar datos de la gráfica. La pantalla del plan gratuito DEBE mostrar «Ver la curva» con la marca «Plan completo» que abre el aviso del plan.
- **FR-006**: La gráfica DEBE tener dos vistas, «Peso» y «Talla», con la edad en el eje horizontal; cada medida DEBE dibujarse como un punto en su edad y su valor, unidos en orden de fecha, y tocar un punto DEBE mostrar su fecha y su valor.
- **FR-007**: Detrás de los puntos, la gráfica DEBE dibujar las curvas de referencia de la OMS P3, P15, P50, P85 y P97 del sexo elegido, en gris y rotuladas solo con esos nombres: Patrones de Crecimiento Infantil (0–5 años) y Referencia de Crecimiento 2007 (5–19 años; el peso para la edad, hasta 10 años). Fuera de esos rangos se dibujan solo los puntos, con una nota neutral del límite.
- **FR-008**: El sistema NUNCA DEBE calcular, mostrar ni guardar el percentil o la puntuación z del hijo, ni escribir juicios («normal», «bajo», «alto», «riesgo», «sobrepeso», «desnutrición», «por debajo», «por encima», «debería»), ni usar colores de alerta, flechas, tendencias o comparaciones entre hermanos. Una prueba de redacción DEBE vigilar los textos.
- **FR-009**: La gráfica DEBE llevar siempre un texto fijo: la referencia es de la OMS, para niños nacidos a término, y quien interpreta la gráfica es el pediatra.
- **FR-010**: El sistema DEBE guardar, por hijo, qué tabla de la OMS usar (niña o niño), opcional. Si falta, quien tiene nivel completo la elige desde la gráfica (y la puede cambiar); quien solo ve, ve los puntos sin curvas y una frase de que una persona adulta de la familia puede elegirla.
- **FR-011**: El peso y la talla del registro del hijo (sin fecha) DEBEN conservarse y mostrarse aparte, sin fecha inventada y fuera de la gráfica, con un atajo para anotarlos con fecha.
- **FR-012**: El sistema DEBE limitar a 500 las medidas por hijo; pasarse responde un aviso neutral.
- **FR-013**: La nota y los valores NUNCA DEBEN viajar en la dirección de una petición ni quedar en el registro de errores.
- **FR-014**: El detalle del hijo DEBE tener una entrada «Crecimiento» (teléfono y web, diseños separados) que lleve a la pantalla de medidas, con la última medida como resumen («Última: 12.4 kg · 86 cm, 3 nov») sin evaluarla.

### Entidades Clave

- **Medida de crecimiento**: pertenece a un hijo (y a la cuenta dueña del hijo); fecha, peso opcional, talla opcional (al menos uno), nota, quién y cuándo la anotó, quién y cuándo la corrigió.
- **Tabla de referencia del hijo**: un dato opcional del hijo (niña / niño) que solo sirve para elegir las curvas de la OMS.
- **Referencia de la OMS**: las curvas P3, P15, P50, P85 y P97 de peso y de talla para la edad, por sexo, tal como las publica la OMS; datos fijos de la app, no del usuario.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un padre anota una medida (fecha, peso y talla) en menos de 30 segundos desde el detalle del hijo.
- **SC-002**: El 100 % de los textos de la pantalla y la gráfica pasan la prueba de redacción contra palabras que evalúan.
- **SC-003**: Una cuenta del plan gratuito nunca recibe los datos de la gráfica y nunca pierde, ni deja de ver, una medida anotada.
- **SC-004**: Cada punto de la gráfica coincide con su medida (edad y valor) y cada curva de referencia coincide con la tabla publicada por la OMS en los puntos de prueba.
- **SC-005**: Un Cuidador, un integrante Hijo, el teléfono del hijo y una persona de otra familia no pueden anotar, corregir ni borrar (ni los dos últimos, ver) en el 100 % de las pruebas de acceso.
- **SC-006**: La pantalla funciona a 390 px y a 1280 px con diseños separados y la gráfica se lee completa en el teléfono sin desplazarse de lado.

## Supuestos

- **Licencia de las tablas de la OMS (riesgo)**: las tablas de los Patrones de Crecimiento Infantil y la Referencia 2007 son públicas; el plan debe verificar sus términos de uso para una app con plan de pago y citar la fuente en la gráfica. Si no se pueden usar así, la entrega se queda con la lista y una gráfica solo de los puntos del hijo (sin curvas), y se decide con el dueño.
- La edad en la gráfica se cuenta desde la fecha de nacimiento ya guardada; no se corrige por prematurez.
- Los valores se escriben con punto o coma decimal; se guardan en kg y cm (sin libras ni pulgadas).
- La tabla de referencia del hijo se pide solo para la gráfica; no se agrega al registro del hijo ni se muestra en otras pantallas.
- Sin mock: se construye con el sistema visual (`design-tokens.md`); si el dueño lo pide después, se homologa con un diseño de Claude Design.
- Fuera de esta entrega: perímetro cefálico, IMC, unidades imperiales, comparar hermanos, avisos, la gráfica en el PDF de la spec 050 (se puede agregar después) y la gráfica de la persona titular (spec 058).
- Las medidas no cuentan para ningún tope del plan gratuito (spec 030); son registro.
