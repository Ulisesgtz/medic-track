# Contrato de pantallas (spec 070)

No hay un mock entregado: se hace con el sistema visual (`specs/005-identidad-visual-front-end/design-tokens.md`), encabezado común `PageHeader` y dos diseños con `useIsDesktop` (teléfono < 900 px, web ≥ 900 px), igual que las specs 063 y 064. **Los textos de abajo son propuesta y los aprueba el dueño.** Nunca rojo de alarma ni palabras de miedo: el tono es neutral, como «Finalizar tratamiento».

## Entrada: «Mi cuenta» (`/cuenta`)

- **Dónde aparece**:
  - en «Lo demás» del inicio (`MoreLinks`, ambos diseños), con «Mi cuenta» antes de «Cerrar sesión»;
  - en la barra lateral web, en el grupo de la cuenta.
- **Qué contiene**: el correo de la sesión, el plan, la familia (si la hay) y dos tarjetas:
  - **«Descargar todos mis datos»**: «Un archivo con todo lo que registraste: tus hijos, consultas, recetas, tomas, vacunas, medidas, botiquín, suplementos y actividades, con sus fotos. Se abre en tu computadora sin PediTrack.» Botón **«Descargar mis datos»**. Mientras se arma: «Preparando tu archivo…». Al terminar: «Compartir» o «Descargar», como el PDF. Si falla: «No se pudo descargar. Vuelve a intentarlo.»
  - **«Eliminar mi cuenta»**: «Borra tu cuenta y todo lo que registraste, también lo de tus hijos.» Botón de borde neutro **«Eliminar mi cuenta…»**.
- **Sin conexión**: dice «Esta pantalla necesita conexión.» (`RequireConnection`).

## Confirmar la eliminación (`/cuenta/eliminar`)

Es una página, no un diálogo, porque tiene mucho texto. Va en este orden:

1. **Qué se borra**: «Tu cuenta, tus hijos y todo lo que registraste de ellos: consultas, fotos de recetas, tomas, citas, vacunas, medidas, suplementos, actividades y botiquín. También tus consultas y rutinas personales.»
2. **Cuándo**: «Se borrará el 12 de diciembre de 2026, en 30 días. Hasta entonces puedes descargar tus datos y cancelar. Después no se puede recuperar.»
3. **Mientras tanto**: «Ya no podrás registrar ni marcar nada, y dejarás de recibir avisos.»
4. **Familia**:
   - si es dueña: «Las 2 personas de tu familia recibirán un aviso. Hasta esa fecha seguirán viendo y marcando a tus hijos y podrán descargar sus datos; después dejarán de verlos.»;
   - si es invitada: «Saldrás de la familia de Ana. Tus marcas en las tomas se quedan, sin tu nombre.»
5. **Suscripción** (si hay una vigente): «Tu suscripción se cancela ahora y no habrá más cobros. Los pagos ya hechos no se reembolsan desde la app.»
6. **Botón secundario**: «Descargar mis datos primero».
7. **Campo**: «Escribe ELIMINAR para confirmar» (sin distinguir mayúsculas al escribir; se manda en mayúsculas).
8. **Botones**: «Cancelar» (con el foco inicial) y **«Eliminar mi cuenta»**, deshabilitado hasta que la palabra coincida. Al tocarlo, Clerk puede pedir la contraseña o el código (`useReverification`).

## Durante el plazo: la cuenta en pausa

Mientras `/accounts/me` trae `deletion`, la app **solo** muestra esta pantalla (en cualquier ruta, como `RequireSession` muestra el login):

- Título: «Tu cuenta se borrará el 12 de diciembre de 2026».
- Texto: «Hasta entonces puedes descargar tus datos o cancelar la eliminación. No puedes registrar ni marcar nada.»
- Botones: «Descargar mis datos», **«Cancelar la eliminación»** y «Cerrar sesión».
- Al cancelar: «Listo, tu cuenta sigue igual.» y vuelve al inicio. Si la suscripción se había cancelado: «Tu suscripción quedó cancelada; puedes contratarla de nuevo en Planes.»

## Persona invitada en una familia cuya dueña pidió eliminarse

- **Aviso fijo** arriba del inicio y del detalle de cada hijo de esa familia: «Ana pidió eliminar su cuenta. Mateo y Sofía dejarán de aparecer el 12 de diciembre. Hasta entonces puedes verlos, marcar tomas y descargar sus datos.» Con el botón **«Descargar sus datos»** (`POST /family/children-export`).
  - Los nombres de los hijos sí van en la app, porque la persona ya los ve; nunca van en el correo.
- **Lo que no puede hacer**: crear ni editar en esos hijos; los botones se ven como en «Solo lectura».

## Marcas y registros sin autor

- **Donde hoy dice «por Ana»**: si `takenBy` es `null` no dice nada, igual que una marca anterior a la spec 032.
- **«Creada por»**: se oculta.
