# Especificación de Funcionalidad: La gráfica de crecimiento solo hasta la edad de la curva de la OMS

**Rama de la Funcionalidad**: `feature/076-curva-oms-por-edad`

**Creado**: 2026-11-19

**Estado**: Borrador

**Entrada**: Descripción del usuario (BACKLOG, «Crecimiento: dejar de ofrecer la comparación con la OMS al pasar la edad de
su curva», pedido del dueño del 2026-11-18): "que de los hijos, no muestre la curva de la OMS cuando tengas más años de los
que la OMS tiene la curva de crecimiento, creo que es hasta los 10 no? checa eso, si el hijo rebasa esa edad, ya no la
muestre para ingresar, si tuvo anteriormente medidas antes de cumplir los 10 que solo muestre los registros anteriores, una
vez cumpliendo la edad máxima de la curva no deje ingresar los datos para la comparación". Decisión del 2026-11-19: pasada
la edad, la medida **se sigue anotando** (lista y tabla) pero **no entra en la gráfica**.

## Contexto

La gráfica de «Crecimiento» (specs 063 y 065) dibuja las medidas del hijo sobre las curvas P3–P97 de la OMS. Esas curvas
tienen un final: **peso para la edad hasta los 10 años** (120 meses) y **talla para la edad hasta los 19 años** (228 meses).
Hoy, una medida anotada después de esa edad se dibuja igual, en un tramo de la gráfica sin curvas, con la nota «La
referencia de la OMS de peso para la edad llega a los 10 años.». Eso invita a comparar algo que la referencia no cubre.

Con este cambio la gráfica de cada indicador **termina en la edad de su curva**: muestra solo las medidas tomadas antes de
esa edad, como registro, y las posteriores quedan en «Medidas anotadas», donde siempre se pueden ver y corregir. Anotar no
cambia: el padre sigue registrando peso y talla a cualquier edad (Principio I: la app registra; solo deja de ofrecer una
comparación que la referencia no respalda).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - La gráfica de peso termina a los 10 años (Prioridad: P1)

Mateo tiene 11 años. Tiene medidas de peso de los 2, 5 y 9 años, y una de los 10 años y 6 meses. En la pestaña «Peso» de la
gráfica se ven solo las tres primeras sobre sus curvas; la de los 10 años y 6 meses no se dibuja. Una nota neutral dice que
la referencia de peso de la OMS llega a los 10 años y que las medidas posteriores están en «Medidas anotadas». En la lista o
la tabla siguen las cuatro.

**Por qué esta prioridad**: es el pedido: no comparar contra una curva que ya terminó.

**Prueba Independiente**: con un hijo de más de 10 años y medidas antes y después de los 10, abrir la gráfica: la pestaña
«Peso» solo dibuja las anteriores y lleva la nota; la lista tiene todas.

**Escenarios de Aceptación**:

1. **Dado** un hijo con medidas de peso antes y después de los 120 meses, **Cuando** el padre abre la pestaña «Peso",
   **Entonces** la gráfica dibuja solo las medidas tomadas antes de los 120 meses, el eje termina a los 10 años y se lee la
   nota fija de la referencia.
2. **Dado** lo mismo, **Cuando** usa ‹ › o toca la gráfica, **Entonces** la lectura solo recorre las medidas dibujadas.
3. **Dado** lo mismo, **Entonces** «Medidas anotadas» (lista en el teléfono, tabla en la web) sigue mostrando todas, también
   las posteriores, con «Corregir» y «Quitar».
4. **Dado** un hijo menor de 10 años, **Entonces** la gráfica se ve como hoy, sin la nota.

---

### Historia de Usuario 2 - Sin medidas antes de la edad, no hay gráfica de ese indicador (Prioridad: P1)

Sofía tiene 12 años y su familia empezó a usar PediTrack este año: todas sus medidas de peso son de después de los 10. En la
pestaña «Peso» no hay gráfica: una frase neutral dice que la referencia de peso de la OMS llega a los 10 años y que sus medidas
están en «Medidas anotadas». La pestaña «Talla» sí tiene gráfica, porque la de talla llega a los 19.

**Por qué esta prioridad**: sin esto, la pestaña quedaría vacía o rota justo para los niños más grandes.

**Prueba Independiente**: con un hijo de 12 años con medidas solo de este año: «Peso» muestra la frase sin gráfica; «Talla»
muestra la gráfica.

**Escenarios de Aceptación**:

1. **Dado** un indicador sin ninguna medida antes de su edad máxima pero con medidas después, **Entonces** esa pestaña muestra
   la frase neutral en lugar de la gráfica, sin ejes ni curvas vacías.
2. **Dado** un hijo de 19 años o más sin medidas de ningún indicador antes de su edad máxima, **Entonces** la tarjeta de la
   gráfica muestra la frase de los dos indicadores en lugar de la gráfica y de las pestañas.
3. **Dado** un hijo sin ninguna medida, **Entonces** se ve el vacío de hoy («Aún no hay medidas…»), no esta frase.

---

### Historia de Usuario 3 - Anotar sigue igual a cualquier edad (Prioridad: P2)

El papá de Mateo anota hoy 38 kg y 145 cm. Se guardan como siempre y aparecen en «Medidas anotadas» y como «última medida»
arriba; la talla entra en la gráfica (Mateo tiene menos de 19), el peso no (tiene más de 10). El formulario no cambia.

**Por qué esta prioridad**: confirma la decisión del dueño (se anota, sin gráfica) y que nada se pierde.

**Prueba Independiente**: anotar una medida a un hijo de 11 años: se guarda, aparece en la lista y en la última medida; el
peso no aparece en la gráfica y la talla sí.

**Escenarios de Aceptación**:

1. **Dado** un hijo de cualquier edad, **Cuando** el padre anota peso y/o talla, **Entonces** se guardan con las reglas de hoy
   (spec 063) y salen en la lista y en «última medida».
2. **Dado** «Anotarlo también como medida de hoy» al editar los datos del hijo (spec 064), **Entonces** funciona igual a
   cualquier edad.
3. **Dado** el formulario de una medida, **Entonces** no lleva avisos nuevos sobre la edad.

---

### Casos Límite

- **Medida justo en la edad máxima** (el día que cumple 10 años, 120 meses exactos): entra en la gráfica; las de después, no.
  Los meses se cuentan con la misma regla de edad que ya usa la gráfica.
- **Curvas de la OMS apagadas** (`WHO_GROWTH_REFERENCE_ENABLED` sin el permiso de la OMS, spec 063): la gráfica tampoco dibuja
  los puntos posteriores a la edad de la referencia; la frase habla de la referencia igual.
- **Plan gratuito**: la gráfica sigue siendo del plan completo; nada cambia en su tarjeta bloqueada.
- **Corregir la fecha de nacimiento** (spec 064): las medidas que caen antes o después de la edad máxima se recalculan solas.
- **Cambiar la tabla Niña/Niño**: no cambia qué medidas se dibujan (la edad máxima es la misma).
- **PDF del historial** (spec 050): no incluye la gráfica; no cambia.
- **Sin conexión** (spec 067): la gráfica no está disponible sin conexión hoy; no cambia.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: La gráfica de cada indicador DEBE dibujar solo las medidas tomadas **hasta la edad máxima de su referencia**
  (peso: 120 meses; talla: 228 meses, inclusive); las posteriores no se dibujan ni se pueden elegir en la lectura.
- **FR-002**: El eje de la edad de un indicador NO DEBE pasar de su edad máxima (el rango «Hasta 10 años» / «Hasta 19 años» es
  el más largo posible).
- **FR-003**: Cuando un indicador tiene medidas posteriores a su edad máxima, la gráfica DEBE mostrar una nota fija y neutral:
  la referencia de la OMS de ese indicador llega a esa edad y las medidas posteriores están en «Medidas anotadas».
- **FR-004**: Cuando un indicador no tiene ninguna medida hasta su edad máxima pero sí posteriores, su pestaña DEBE mostrar esa
  frase en lugar de la gráfica; si ninguno de los dos indicadores tiene medidas dibujables, la tarjeta muestra la frase sin
  pestañas.
- **FR-005**: El servidor DEBE decidir qué medidas entran en la gráfica (la respuesta de la gráfica no trae las posteriores a la
  edad máxima de cada indicador) y DEBE decir si hay medidas posteriores, para que la pantalla no tenga que adivinarlo.
- **FR-006**: Anotar, corregir, quitar y ver la lista de medidas, la «última medida» y «Anotarlo también como medida de hoy» NO
  cambian: funcionan a cualquier edad.
- **FR-007**: Los textos nuevos NO DEBEN evaluar al hijo ni sugerir que deje de medirse (Principio I): ni «ya no necesita», ni
  «demasiado grande», ni consejos.
- **FR-008**: Las pantallas conservan sus dos diseños (teléfono y web) de la spec 065.

### Entidades Clave

- **Referencia de crecimiento** (existente, spec 063): por indicador, su edad máxima en meses.
- **Medida** (existente): sin cambios; se decide si entra en la gráfica por la edad del hijo en su fecha.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Ninguna gráfica dibuja una medida posterior a la edad máxima de su referencia (verificado con medidas a 119, 120 y
  121 meses de peso, y a 227, 228 y 229 de talla).
- **SC-002**: El 100 % de las medidas sigue en «Medidas anotadas» con «Corregir» y «Quitar», a cualquier edad.
- **SC-003**: Un hijo con medidas solo posteriores a la edad máxima nunca ve una gráfica vacía ni ejes sin datos.
- **SC-004**: Ningún texto nuevo contiene juicios ni consejos (prueba de redacción).
- **SC-005**: Las pantallas se ven correctas a 390 y 1280 px (E2E).

## Supuestos

- Las edades máximas salen de las tablas de la OMS ya cargadas (`MaxMonths`: peso 120, talla 228); si las tablas cambian, la
  regla las sigue.
- Sin migración: no cambia ningún dato guardado.
- Diseño por mock de Claude Design (decisión del dueño, 2026-11-19); prompt en `referencia/prompt-claude-design.md`. Las
  pantallas se construyen tal cual el mock.
- La nota de hoy («La referencia de la OMS de peso para la edad llega a los 10 años.») se reemplaza por la nueva.

## Fuera de Alcance

- Otras referencias para mayores de 10 años (por ejemplo, índice de masa corporal para la edad).
- Bloquear el registro del peso o la talla a cualquier edad (decisión del dueño del 2026-11-19).
- Cambios en el formulario de la medida.
