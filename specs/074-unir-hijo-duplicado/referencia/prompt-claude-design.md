# Prompt para Claude Design — spec 074

Pegar en Claude Design, en el mismo canvas de PediTrack (sistema visual existente).

---

Diseña para **PediTrack** (bitácora médica infantil, español de México, sistema visual ya existente: tinta `#04252b`,
acción `#0e7490`, Figtree, tarjetas blancas con borde fino, botón sólido único por pantalla, chips neutros) el flujo
**«Un hijo registrado dos veces al unirse a una familia»**. Cada estado en **teléfono (390 px)** y **web (1280 px, con
la barra lateral de la app)**, como diseños separados. Tono neutral: nada de rojo ni ámbar de alarma, sin
felicitaciones, sin juicios de salud; la app nunca dice cuál registro «es el bueno».

Contexto: Laura acaba de aceptar la invitación de Ana para ser **Tutora** de su familia. Laura ya tenía en su cuenta a
«Mateo López» (2 consultas, 9 vacunas, 1 medida) y a «Sofía López»; la familia de Ana tiene «Mateo López» y «Emilia
López».

Estados:

- **A. «¿Cómo quieres seguir?»** (justo después de aceptar). Breve explicación: «Ya eres parte de la familia de Ana.
  Tú ya tenías hijos registrados; si alguno es el mismo niño, puede aparecer dos veces». Tres opciones de tarjeta
  seleccionable: **Unir** («Junta lo que anotaste con el hijo de la familia»), **Usar solo lo de la familia** («Tus
  hijos se ocultan; no se borra nada y puedes volver a mostrarlos») y **Conservar ambas** («Verás los dos registros;
  puedes unirlos después desde Familia»). Botón «Continuar». Variante A2 para un **Cuidador**: sin «Unir».
- **B. Parejas**. Lista de mis hijos, cada uno con un selector «Es el mismo que…» con los hijos de la familia o «No es
  ninguno». Mateo ya viene sugerido con la etiqueta neutra «Se llaman igual» (se puede cambiar); Sofía en «No es
  ninguno». Un hijo de la familia no se puede elegir dos veces.
- **C. Datos distintos** de la pareja Mateo: solo los que difieren, cada uno con dos opciones (el tuyo / el de la
  familia), p. ej. fecha de nacimiento «3 mar 2022» / «4 mar 2022», peso, y de la ficha el tipo de sangre y el
  pediatra. Ninguno elegido de inicio; «Continuar» deshabilitado hasta elegir todos. Nota: alergias y padecimientos se
  juntan.
- **D. Resumen** antes de unir: por pareja «Mateo (tuyo) → Mateo (familia)» con conteos («2 consultas · 9 vacunas ·
  1 medida · ficha»), una caja neutra con: «Todo pasa a la familia de Ana. Si después sales de la familia, no te llevas
  copia. Esto no se puede deshacer.» y la línea del teléfono del hijo que pierde su acceso si aplica. Acciones:
  «Descargar mis datos» (contorno) y «Unir» (sólido). Variante D2 con el aviso de que un tope se pasará (p. ej.
  «Mateo tendrá 12 suplementos activos; no podrás agregar más hasta tener 10 o menos»).
- **E. Uniendo / listo / error**: progreso breve; listo: «Se unió Mateo» y botón «Ir al inicio»; error neutral «No se
  pudo unir. No cambió nada.» con «Intentar de nuevo».
- **F. Aviso de «Conservar ambas»**: confirmación corta de que un niño puede aparecer dos veces y dónde unir después.
- **G. Detalle del hijo de la familia tras unir**: la línea neutral «Se unió el 3 dic con el registro de Laura» (donde
  mejor quepa sin protagonismo).
- **H. «Hijos ocultos»** en «Mi cuenta»: lista con «Volver a mostrar» por hijo y la nota de que se incluyen en
  «Descargar todos mis datos». Y en **«Familia»** la sección para la persona invitada con «Unir con un hijo de la
  familia» y «Ocultar mis hijos» / «Volver a mostrar».

Al final, una lista de decisiones de diseño numeradas.
