# Quickstart: Recordatorios de tomas por notificaciones push

Validación manual de extremo a extremo una vez implementada la feature. Requiere backend y frontend locales (ver
`backend/CLAUDE.md` y `frontend/CLAUDE.md`) y la sesión de Clerk de la spec 008.

## Antes de empezar

1. Generar las claves: `npx web-push generate-vapid-keys` (una sola vez; no se suben al repo).
2. En `backend/.env.local`: `VAPID_PUBLIC_KEY=…`, `VAPID_PRIVATE_KEY=…`, `VAPID_SUBJECT=mailto:tu@correo`,
   `REMINDER_ACTION_SECRET=<32+ caracteres aleatorios>`.
3. Aplicar la migración `0011_create_reminders.sql` a la base local.
4. Levantar backend y frontend. Los avisos solo salen mientras el backend corre.
5. Para el teléfono: el frontend local no sirve (el teléfono no llega a `localhost` y los avisos exigen HTTPS). Usar un
   túnel HTTPS al frontend o un despliegue de prueba; en iPhone, además, instalar la app en la pantalla de inicio.

## Historia 1 — Aviso a la hora de la toma

1. Con sesión, crear una consulta con un medicamento cuya primera toma sea en 3 minutos ("Desde").
2. En el home, "Activar recordatorios" → aceptar el permiso → elegir "Mostrar detalle".
   **Esperado**: la opción dice que los recordatorios están activos en este dispositivo.
3. Cerrar la pestaña (en PC, dejar el navegador abierto).
   **Esperado**: a la hora de la toma (hasta 2 minutos después) llega "Toma programada · Amoxicilina · 8:00 · Mateo".
4. Tocar el aviso. **Esperado**: se abre el detalle de esa consulta.
5. Crear otra toma y marcarla como tomada antes de su hora. **Esperado**: no llega aviso.

## Historia 2 — Detalle o genérico

1. Cambiar a "Texto genérico" y esperar la siguiente toma.
   **Esperado**: el aviso dice solo "Hay una toma programada · <hora>", sin medicamento ni hijo.
2. Activar en un segundo dispositivo. **Esperado**: no pregunta de nuevo; muestra "Texto genérico" como elegido.

## Historia 3 — "Tomada" desde el aviso

1. En Chrome o Edge de escritorio (o Android), cuando llegue un aviso, tocar "Tomada".
   **Esperado**: sin abrir la app, la toma aparece marcada al abrirla después, en todos los dispositivos.
2. En iPhone: el aviso no tiene botón; tocarlo abre la consulta.

## Historia 4 — Desactivar y dispositivos

1. "Desactivar recordatorios" en un dispositivo. **Esperado**: ese deja de recibir; el otro sigue.
2. Cerrar sesión en un dispositivo con recordatorios. **Esperado**: deja de recibir los avisos de esa cuenta.
3. Quitar el permiso de notificaciones desde el navegador y esperar una toma. **Esperado**: no llega nada ahí y en la
   base ese dispositivo queda `active = false` tras el intento.

## Historia 5 — Qué esperar

1. Abrir la opción en Safari de iPhone sin instalar. **Esperado**: explica cómo agregar a la pantalla de inicio.
2. Con el permiso negado. **Esperado**: explica cómo volver a permitirlo.
3. Siempre: el texto de "es una ayuda, no una alarma garantizada".

## Privacidad (Principio II)

- Revisar `error_logs` y el log del backend durante la prueba: ningún `endpoint`, clave `p256dh`/`auth`, token de acción
  ni texto de aviso.
- Con "Texto genérico", capturar un aviso en la pantalla de bloqueo: sin medicamento ni hijo.
