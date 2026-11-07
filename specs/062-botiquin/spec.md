# Especificación de Funcionalidad: Botiquín de la casa

**Rama**: `feature/062-botiquin`
**Creada**: 2026-11-06
**Estado**: Borrador
**Entrada**: pedido y decisiones del dueño del 2026-11-06 (`BACKLOG.md`, «Botiquín de la casa») y el diseño entregado de Claude Design, `referencia/Botiquín PediTrack.dc.html` (5 pantallas en teléfono y web, con medidas).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Anotar las medicinas que hay en casa (Prioridad: P1)

Ana quiere saber qué medicinas tiene la familia en casa sin abrir el cajón. Desde el inicio toca «Checa tus medicamentos», ve el botiquín de la familia ordenado por nombre y agrega uno: nombre, concentración, cantidad, caducidad y una nota. Luis, su pareja y Tutor de la misma familia, ve la misma lista.

**Por qué esta prioridad**: es la funcionalidad completa en su forma mínima: un registro compartido que se consulta y se llena.

**Prueba Independiente**: agregar un medicamento a mano y verlo en la lista, en su detalle y desde la sesión de otro Tutor de la familia.

**Escenarios de Aceptación**:

1. **Dado** una familia de plan completo sin medicamentos, **Cuando** Ana abre el botiquín, **Entonces** ve «Aún no hay medicamentos en el botiquín» y «+ Agregar al botiquín».
2. **Dado** el formulario, **Cuando** Ana escribe «Paracetamol infantil», «160 mg/5 ml», «2 frascos», caducidad «mar 2027» y guarda, **Entonces** la lista lo muestra con «160 mg/5 ml · 2 frascos» y «Caduca: mar 2027», y el detalle dice «Agregado por Ana · 6 nov».
3. **Dado** siete medicamentos, **Cuando** se abre la lista, **Entonces** van en orden alfabético por nombre, con el conteo «7 medicamentos».
4. **Dado** la lista, **Cuando** Ana escribe «paracet» en el buscador, **Entonces** quedan solo los que contienen ese texto sin distinguir mayúsculas ni acentos, con «2 de 7 medicamentos»; si ninguno coincide, «Ningún medicamento del botiquín se llama «x».».
5. **Dado** un Tutor de la misma familia de pago, **Cuando** abre el botiquín, **Entonces** ve la misma lista y también puede agregar.
6. **Dado** la fecha de caducidad de un medicamento ya pasó, **Cuando** se ve la lista o el detalle, **Entonces** la fecha se muestra igual que cualquier otra, sin otra palabra, color ni ícono.

---

### Historia de Usuario 2 - Que la foto de la caja proponga los datos (Prioridad: P2)

Ana toma una foto de la caja; la app lee el texto en su teléfono y propone el nombre, la concentración y la caducidad. Ana revisa, corrige y guarda. La foto queda con el medicamento.

**Por qué esta prioridad**: ahorra escribir, pero el botiquín ya sirve sin ella.

**Prueba Independiente**: elegir una foto con texto y ver los tres campos propuestos y marcados como «Leído de tu foto»; elegir una sin texto y capturar a mano.

**Escenarios de Aceptación**:

1. **Dado** el formulario, **Cuando** Ana elige una foto, **Entonces** ve «Leyendo la foto…» y puede escribir mientras tanto.
2. **Dado** la lectura terminó con texto, **Cuando** aparece el resultado, **Entonces** el nombre, la concentración y la caducidad que se encontraron se proponen marcados «Leído de tu foto · revísalo», sin reemplazar lo que Ana ya escribió, y la cantidad nunca se propone.
3. **Dado** la lectura no encontró texto, **Cuando** termina, **Entonces** dice «No encontramos texto» y la foto se guarda igual con lo capturado a mano.
4. **Dado** cualquier estado, **Cuando** Ana no toca «Guardar en el botiquín», **Entonces** nada se guarda.
5. **Dado** un medicamento con foto, **Cuando** se toca la foto en el detalle, **Entonces** se abre en un visor.

---

### Historia de Usuario 3 - Corregir y quitar (Prioridad: P3)

Ana usó un frasco y corrige la cantidad; tiró una caja y la quita del botiquín.

**Prueba Independiente**: editar la cantidad y quitar un medicamento con su confirmación.

**Escenarios de Aceptación**:

1. **Dado** el detalle, **Cuando** Ana toca «Editar», cambia la cantidad y guarda, **Entonces** el detalle y la lista muestran la cantidad nueva.
2. **Dado** el detalle, **Cuando** Ana toca «Quitar del botiquín», **Entonces** se le pide confirmar con «Se quita del botiquín de la familia. No se puede deshacer.»; al confirmar desaparece para toda la familia y vuelve a la lista.

---

### Historia de Usuario 4 - Agregar desde una consulta (Prioridad: P3)

En el detalle de la consulta de Mateo, junto a «Amoxicilina», Ana toca «Agregar al botiquín» y el formulario llega con el nombre de la receta, que puede cambiar.

**Prueba Independiente**: desde una consulta, abrir el atajo y guardar con el nombre ya puesto.

**Escenarios de Aceptación**:

1. **Dado** el detalle de una consulta con medicamentos y una familia de plan completo, **Cuando** Ana toca «Agregar al botiquín» en un medicamento, **Entonces** el formulario dice «Desde la consulta del 18 oct · Dra. Laura Cázares. El nombre viene de la receta; puedes cambiarlo.» con el nombre puesto y marcado «De la receta», y «← Consulta» vuelve a la consulta.
2. **Dado** una consulta propia del titular (spec 058), **Cuando** su dueño toca el atajo, **Entonces** funciona igual.
3. **Dado** que la sesión no puede agregar al botiquín (Cuidador, plan gratuito), **Cuando** se ve la consulta, **Entonces** el atajo no aparece.

---

### Historia de Usuario 5 - Quién puede y con qué plan (Prioridad: P2)

El botiquín es del plan completo. Un Cuidador lo ve pero no lo cambia. En el plan gratuito la entrada del inicio lleva la marca «Plan completo» y abre el aviso del plan.

**Escenarios de Aceptación**:

1. **Dado** una cuenta en el plan gratuito sin medicamentos, **Cuando** toca «Checa tus medicamentos», **Entonces** se abre el aviso del plan completo que ya existe.
2. **Dado** un Cuidador de una familia de pago, **Cuando** abre el botiquín, **Entonces** ve la lista y el detalle con «Vista de Cuidadora. Puedes ver el botiquín. Agregar y editar lo hace la familia.» y sin botones de agregar, editar ni quitar; el servidor rechaza cualquier cambio suyo.
3. **Dado** una familia cuyo plan venció con medicamentos ya guardados, **Cuando** la dueña abre el botiquín, **Entonces** los sigue viendo, puede editarlos y quitarlos, y para agregar uno nuevo se le muestra el aviso del plan.
4. **Dado** un Tutor de una familia que dejó de pagar, **Cuando** abre el botiquín, **Entonces** solo lo ve (como cualquier dato de la familia en solo lectura).

### Casos Límite

- Dos personas editan el mismo medicamento a la vez: gana la última que guarda (sin historial de versiones).
- Alguien abre el detalle de un medicamento que otra persona quitó: «No se encontró este medicamento.» con un regreso a la lista.
- Fecha de caducidad sin día: se guarda mes y año y se muestra «mar 2027»; con día, «12 mar 2027».
- Cantidad cero se permite (se acabó pero se quiere recordar).
- Foto que el teléfono no puede reducir (HEIC): se guarda como está, igual que las recetas.
- Un nombre muy largo se acomoda sin salirse de la pantalla.
- Una persona que pertenece a una familia como invitada ve el botiquín de esa familia, no uno propio.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Cada familia DEBE tener un solo botiquín compartido: el de la cuenta dueña de la familia; una cuenta sin familia tiene el suyo; una persona invitada ve el de la familia a la que pertenece.
- **FR-002**: Un medicamento DEBE tener nombre (obligatorio, como lo escribe el padre), concentración (opcional), cantidad (número de 0 a 999 y unidad: cajas, tabletas, frascos o ml), caducidad (mes y año obligatorios, día opcional), nota (opcional), foto (opcional) y quién lo agregó y cuándo.
- **FR-003**: La lista DEBE ir en orden alfabético por nombre, sin distinguir mayúsculas ni acentos, y **nunca** ordenarse, agruparse, colorearse ni marcarse por la fecha de caducidad.
- **FR-004**: La caducidad DEBE mostrarse solo como «Caduca: mar 2027» / «Caduca: 12 mar 2027», con el mismo estilo que la cantidad; ningún texto de la app dice que algo caducó, venció o se puede o no usar (Principio I).
- **FR-005**: El buscador DEBE filtrar por nombre sin distinguir mayúsculas ni acentos, en el teléfono, sin pedir nada al servidor.
- **FR-006**: Agregar DEBE pedir el plan completo de la familia y nivel de dueña o Tutor; el servidor lo decide y rechaza lo demás.
- **FR-007**: Editar y quitar DEBEN poder hacerse en cualquier plan por la dueña y por un Tutor de una familia de pago (corregir lo propio no se cobra, Principio IV); un Cuidador y un Tutor de una familia vencida solo ven.
- **FR-008**: Ver el botiquín DEBE estar abierto a toda persona de la familia con acceso (dueña, Tutor, Cuidador) en cualquier plan; el teléfono del hijo no lo ve.
- **FR-009**: Con foto, la app DEBE leer el texto **en el teléfono** y solo proponer nombre, concentración y caducidad, marcados como propuestos, sin reemplazar lo ya escrito; la cantidad nunca se propone; nada se guarda sin tocar «Guardar».
- **FR-010**: La foto DEBE elegirse sin forzar la cámara (cámara o galería), reducirse en el teléfono antes de enviarse y abrirse en un visor desde el detalle; el servidor valida que sea una imagen.
- **FR-011**: Quitar DEBE pedir confirmación neutral y borrar de verdad el medicamento y su foto.
- **FR-012**: El inicio DEBE mostrar «Checa tus medicamentos» con el conteo («7 medicamentos en el botiquín») y, en el plan gratuito sin acceso al botiquín, la marca «Plan completo» que abre el aviso del plan; la barra lateral web DEBE tener «Botiquín» en el grupo Familia.
- **FR-013**: El detalle de la consulta (de un hijo y propia) DEBE ofrecer «Agregar al botiquín» por medicamento a quien puede agregar, y abrir el formulario con el nombre de la receta y el origen («Desde la consulta del …»).
- **FR-014**: Los textos libres (nombre, concentración, nota) DEBEN viajar solo en cuerpos de petición y nunca quedar en direcciones ni en el registro de errores.
- **FR-015**: Todos los textos de la funcionalidad DEBEN vivir en un solo lugar con una prueba de redacción que prohíba palabras de evaluación sobre la fecha o el uso.
- **FR-016**: Cada pantalla DEBE tener su diseño de teléfono y de web tal como el mock entregado, con las desviaciones listadas.

### Entidades Clave

- **Botiquín**: el de la cuenta dueña de la familia; no es una fila aparte, es el conjunto de sus medicamentos.
- **Medicamento del botiquín**: nombre, concentración, cantidad y unidad, caducidad (año, mes, día opcional), nota, foto opcional, quién lo agregó y cuándo, y quién lo editó por última vez y cuándo.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un padre agrega un medicamento a mano en menos de un minuto.
- **SC-002**: Con una foto legible de la caja, al menos dos de los tres datos propuestos (nombre, concentración, caducidad) llegan correctos sin escribirlos.
- **SC-003**: Ninguna pantalla ni texto de la funcionalidad dice que un medicamento caducó o se puede usar (verificado por prueba de redacción).
- **SC-004**: El 100 % de los intentos de un Cuidador o de un plan gratuito de agregar se rechaza en el servidor.
- **SC-005**: Cobertura de pruebas > 90 % en backend y frontend; E2E a 390 y 1280 px.

## Supuestos

- Sin varios botiquines, sin que la cantidad baje al marcar tomas y sin avisos por caducidad (fuera de esta entrega, en `BACKLOG.md`).
- Tope de 200 medicamentos por familia y una foto por medicamento (5 MiB, como las fotos de la cartilla); se puede cambiar.
- La foto del botiquín no cuenta en el tope de 100 recetas con foto (spec 043).
- La lectura de la foto reutiliza la del teléfono que ya leen las recetas y la cartilla.
- Hay que aplicar una migración nueva en DEV antes del merge.
