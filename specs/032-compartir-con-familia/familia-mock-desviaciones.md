# Familia — mock entregado y desviaciones

Mock: `referencia/Familia PediTrack.dc.html` (+ `InvitacionTarjeta.dc.html`, del proyecto de Claude Design del 2026-10-06) y sus
decisiones en `specs/005-identidad-visual-front-end/familia-decisiones.md`. Se construyó tal cual en `frontend/src/features/family/`
(`FamilyPage`, `MembersList`, `InvitationsList`, `InviteForm`, `InviteLink`, `FamilyCounter`, `RoleChip`, `ConfirmDialog`,
`InvitationPage`, `FamilyEntry`) y en la barra lateral. Se comparó en pantalla, móvil (390 px) y web (1280 px), sección por sección.

## Lo que cambió respecto a lo que ya estaba

Textos y estructura del mock: «Tu familia» / «Familia de Ana», contador «3 de 4 personas» con barras, «Personas», «Invitaciones
pendientes» (chip «Pendiente» punteado, no ámbar; «Vencida» en pizarra), formulario «Invitar a alguien» con el rol en dos tarjetas
y el botón **«Crear liga»** (antes «Crear invitación»), panel **«Liga lista»** que **reemplaza** al formulario hasta «Listo» (así
«Copiar liga» es el único botón sólido; después de copiar dice «Liga copiada ✓»), tarjeta «Plan completo · Comparte con tu familia»,
aviso de solo lectura «La familia está en el plan gratuito», «Tu lugar en esta familia», diálogos con filas «Dejas de ver / No te
llevas / Se conserva» (hoja inferior en móvil, centrado a 560 px en web; «Quitar a Rosa» en rojo, «Salir de la familia» en tinta) y la
pantalla de invitación con el logo sobre fondo `ink` y una tarjeta de 480 px.

## Desviaciones (pendientes de tu aprobación)

1. **Solo el nombre de pila de las personas** («Ana», «Luis»), no el nombre completo («Ana Morales») del mock: el servidor nunca manda
   apellidos de otras cuentas (privacidad). El «(tú)» sí está (`you` en cada persona de `GET /family`).
2. **La liga lleva la ficha en el fragmento** (`https://…/familia/invitacion#<ficha>`), no en `?t=<ficha>` como dibuja el mock: lo que va
   después de `?` llega al servidor y a sus registros; lo que va después de `#`, nunca.
3. **Barra lateral de 280 px**, la de todas las pantallas, no los 348 px del mock; y su enlace «Familia» no lleva el «3 de 4» (pediría
   `GET /family` en cada pantalla). Si quieres los 348 px es un cambio de `AppShell` para toda la app.
4. **Un Tutor en solo lectura no puede «Quitar» a un Cuidador** — **decidido el 2026-10-06**: el mock (supuesto C4) decía que sí; se queda
   como está en el servidor. Quien administra la familia es la cuenta creadora, la que paga el plan completo; sin plan de pago, un Tutor
   invitado solo ve y marca (y puede salir).
5. **La invitación sin cuenta muestra el correo invitado** (de la propia invitación) en «Tu correo», y «Esta invitación es para otro
   correo» muestra el correo de la cuenta con la que entró. Para eso `POST /family/invitations/preview` ahora trae los **nombres de pila
   de los hijos** (`childrenFirstNames`): quien tiene la ficha ve a quién se le pide cuidar, y nada más.
6. **La tarjeta «Familia» del home** muestra «Invita a tu pareja o a quien cuida a tus hijos» cuando la dueña está sola (el mock no
   dibuja ese caso) y, con cuatro personas, el texto «4 de 4 personas · 1 pendiente» se parte en dos renglones en móvil.
7. **En la web no hay enlace «← Tus hijos»** (el mock no lo trae; la barra lateral navega), en móvil sí.
8. Estados que el mock no dibuja y se resolvieron con el mismo lenguaje: «Cargando…» y error de cuenta en la pantalla de invitación, el
   aviso de error al crear/reenviar/cancelar y los errores del servidor al aceptar (mensajes en español, sin el texto del servidor).
