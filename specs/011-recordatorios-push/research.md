# Investigación: Recordatorios de tomas por notificaciones push

Decisiones técnicas de la spec 011, con lo que se consideró y descartó. Todas respetan el stack fijo (Go + React PWA +
PostgreSQL, Principio III) y el aislamiento por cuenta de la spec 008.

## R1. Cómo llega un aviso con la app cerrada

- **Decisión**: Web Push estándar (Push API + Notifications API + service worker), con el backend enviando cada aviso
  firmado con VAPID y cifrado según RFC 8291 (`aes128gcm`).
- **Justificación**: Es lo único que despierta al dispositivo a una hora concreta sin la app abierta, y funciona igual en
  Android, en la PWA instalada de iPhone/iPad (iOS/iPadOS 16.4+) y en Chrome, Edge y Firefox de escritorio. El contenido
  va cifrado hasta el dispositivo: el servicio de avisos del navegador (Google, Mozilla, Apple) lo transporta pero no
  puede leerlo (FR-016).
- **Alternativas descartadas**:
  - *Temporizadores en la página* (`setTimeout`): solo avisan con la pestaña abierta.
  - *Notification Triggers* (avisos programados en el propio dispositivo): Chrome abandonó la API; no hay soporte real.
  - *Periodic Background Sync*: solo Chromium, solo instalada, y el navegador decide la frecuencia (horas), no sirve para
    una hora exacta.
  - *Firebase Cloud Messaging como SDK*: añade un tercero con cuenta propia y su SDK en el cliente; Web Push estándar ya
    usa el servicio de avisos de cada navegador sin integrar a nadie más.
  - *Archivo `.ics` al calendario*: útil como complemento, pero fuera de alcance (spec, Supuestos).

## R2. Librería de envío en Go

- **Decisión**: `github.com/SherClockHolmes/webpush-go` (dependencia nueva del backend).
- **Justificación**: Implementa VAPID y el cifrado RFC 8291, es la librería de referencia en Go y deja controlar TTL,
  urgencia y tema del mensaje. Escribir el cifrado a mano sería un riesgo innecesario.
- **Uso**: detrás de una interfaz `Sender` propia (`Send(ctx, device, payload) (Result, error)`) para probar el servicio
  con un falso y aislar la librería en un solo archivo.

## R3. Claves VAPID y configuración

- **Decisión**: variables de entorno del backend `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`
  (`mailto:` de contacto), más `REMINDER_ACTION_SECRET` (R7). La clave pública se entrega al frontend por un endpoint
  (`GET /reminders/config`), no por una variable del frontend, para que haya una sola fuente y nunca se suscriba un
  dispositivo con una clave que el backend no puede usar.
- **Si faltan**: el backend arranca igual (no es un requisito para el resto de la app), no corre el envío y
  `GET /reminders/config` responde que los recordatorios no están disponibles; el frontend lo dice en vez de mostrar el
  botón. Así el entorno local y los PR sin claves no se rompen.
- **Generarlas**: `npx web-push generate-vapid-keys` (solo para crearlas; no es una dependencia del proyecto). En CI se
  generan al inicio del job de E2E.

## R4. Service worker en TypeScript

- **Decisión**: `vite-plugin-pwa` con la estrategia `injectManifest`, service worker escrito en `src/sw.ts`, **sin
  precaché** (sin punto de inyección) y con `manifest: false` para conservar el `manifest.webmanifest` actual.
- **Justificación**: La constitución exige TypeScript (sin archivos `.js` nuevos) y que el service worker sea parte del
  build. El plugin compila el TS del service worker y lo sirve también en desarrollo (`devOptions`). No se agrega
  funcionamiento sin conexión: queda fuera de alcance (spec, Supuestos).
- **Pruebas**: `sw.ts` solo conecta eventos (`push`, `notificationclick`); la lógica vive en funciones puras
  (`features/reminders/notification.ts`: construir el aviso, decidir a dónde abrir, resolver la acción "Tomada") que se
  prueban con Vitest. La hora se formatea con `formatTime` de `shared/date.ts`, la misma que usa la app.
- **Alternativa descartada**: `public/sw.js` a mano (JavaScript, fuera de TypeScript y del build).

## R5. Quién decide cuándo avisar

- **Decisión**: un proceso dentro del mismo backend (goroutine con un ticker cada **30 s**) que en cada vuelta:
  1. **Reclama** las tomas a avisar con un solo `UPDATE … SET reminder_sent_at = now() … RETURNING`, sobre las filas
     elegidas con `FOR UPDATE SKIP LOCKED`: tomas no marcadas, sin aviso, con `scheduled_at` entre `now() - 60 min` y
     `now()`, de cuentas con al menos un dispositivo activo registrado **antes** de la hora de la toma.
  2. Envía el aviso a cada dispositivo activo de esa cuenta registrado antes de la hora de la toma.
- **Justificación**:
  - Reclamar antes de enviar garantiza **como máximo un aviso por toma** (FR-005, SC-002), incluso si el proceso se
    reinicia o si algún día corren dos instancias: una toma reclamada no vuelve a salir. El costo es que si el proceso
    muere entre reclamar y enviar, ese aviso se pierde; se prefiere eso a un duplicado (SC-002 exige 0 duplicados, y un
    recordatorio perdido no cambia ningún dato: la toma sigue en la app).
  - 30 s de intervalo dan margen para SC-001 (95% en menos de 2 minutos).
  - La ventana de 60 minutos cumple el caso límite "el sistema estuvo apagado" y FR-006.
  - "Dispositivo registrado antes de la hora" cumple el caso límite de tomas que ya pasaron antes de activar.
- **Alternativas descartadas**: cron externo o cola (Redis, SQS): infraestructura nueva sin necesidad a esta escala
  (Principio V); programar un temporizador por toma en memoria: se pierde al reiniciar.
- **Consecuencia de despliegue**: el backend debe correr siempre (spec, Supuestos). Railway u otro proceso persistente
  lo cumplen; una plataforma que duerme sin tráfico no.

## R6. Dónde se registra que una toma ya se avisó

- **Decisión**: columna nueva `doses.reminder_sent_at TIMESTAMPTZ NULL` con un índice parcial para la búsqueda de R5.
- **Justificación**: Es por toma (no por dispositivo) y basta para "como máximo uno por dispositivo" porque todos los
  dispositivos reciben su aviso en la misma vuelta. No es un dato que el padre edite: la inmutabilidad de la spec 004
  (consultas y horarios no cambian) no se afecta.
- **Alternativa descartada**: tabla `(dose_id, device_id)` de envíos: permitiría reintentar por dispositivo, pero añade
  una tabla que crece por cada toma × dispositivo sin que la spec lo pida.

## R7. La acción "Tomada" sin abrir la app

- **Problema**: el service worker no tiene la sesión de Clerk (el token vive en la página) y el backend usa tokens
  `Bearer`, no cookies de su dominio.
- **Decisión**: cada aviso lleva un **token de acción** firmado por el backend con HMAC-SHA256
  (`REMINDER_ACTION_SECRET`) sobre `(doseId, deviceId, vence)`, válido 24 h. El service worker lo manda a
  `POST /reminders/actions/taken`, que es público (sin sesión) pero solo acepta un token válido, no vencido, cuyo
  dispositivo siga activo y pertenezca a la cuenta dueña de la toma. Marca **esa** toma igual que la app
  (`taken = true`, idempotente) y responde 204 sin cuerpo.
- **Justificación**: Cumple FR-010 y SC-007: el token sirve para una sola toma, no lee nada y deja de servir si el
  dispositivo se desactiva o se cierra sesión (caso límite "cuenta que ya no es la del dispositivo"). Viaja dentro del
  aviso cifrado.
- **Alternativas descartadas**: guardar el token de sesión de Clerk en el service worker (caduca en minutos y daría
  acceso a toda la cuenta); abrir la app para marcar (anula el valor de la acción).
- **Soporte**: los botones de acción existen en Chrome, Edge, Firefox de escritorio y Android; en iPhone/iPad no. Donde
  no hay botón, tocar el aviso abre la consulta (Historia 3, escenario 2).

## R8. Contenido del aviso y privacidad

- **Decisión**: el backend arma el contenido según la preferencia de la cuenta:
  - *Detalle*: `{ kind: "detailed", medication, child, scheduledAt, consultationId, doseId, actionToken }`.
  - *Genérico*: `{ kind: "generic", scheduledAt, consultationId, doseId, actionToken }` — **sin** medicamento ni hijo,
    ni siquiera cifrados (SC-005).
  El service worker lo convierte en el aviso: título "Toma programada"; cuerpo "Amoxicilina · 8:00 · Mateo" o "Hay una
  toma programada · 8:00"; `tag: dose-<id>` para que un reenvío reemplace y no duplique; la hora en la zona del
  dispositivo.
- **Envío**: `TTL` de 3600 s (el servicio de avisos descarta lo que no pudo entregar en una hora, igual que la ventana
  de R5) y urgencia `high`.
- **Nunca** va el correo del padre ni su `accountId` (FR-016). El texto es fijo y descriptivo, sin imperativos
  (Principio I, FR-007).
- **Terceros**: el servicio de avisos de cada navegador ve cuándo se entrega un mensaje a un dispositivo, pero no su
  contenido. Esto toca el Principio II: se pide confirmación explícita al usuario antes de implementar (ver plan.md).

## R9. Preferencia de texto (detalle o genérico)

- **Decisión**: columna `accounts.reminder_detail TEXT NULL CHECK (reminder_detail IN ('detailed','generic'))`.
  `NULL` = aún no elegida: la primera activación de la cuenta muestra la elección antes de terminar (FR-008,
  Aclaraciones). Se expone en la respuesta de cuenta como `reminderDetail` y se cambia con
  `PATCH /accounts/{accountId}/reminder-settings`.

## R10. Dispositivos: alta, baja y dispositivos compartidos

- **Decisión**: tabla `reminder_devices` con el `endpoint` del navegador **único**:
  - Activar en un dispositivo ya registrado (misma o **otra** cuenta) actualiza la fila y la asigna a la cuenta de la
    sesión: un navegador solo avisa a una cuenta a la vez (caso límite "dispositivo compartido").
  - Desactivar o cerrar sesión: el frontend quita la suscripción del navegador y avisa al backend
    (`POST /accounts/{accountId}/reminder-devices/remove`), que la marca inactiva. Si el aviso al backend falla (sin
    red), la suscripción del navegador ya no existe y el siguiente envío recibe 404/410 del servicio de avisos, que
    también la desactiva (FR-013). Cerrar sesión no espera a esa llamada más de 3 s.
  - Respuestas del servicio de avisos: 404/410 → desactivar el dispositivo; 429/5xx/error de red → dejarlo activo y no
    reintentar ese aviso (ya reclamado, R5).
- **Métodos HTTP**: solo `POST` y `PATCH`, que ya permite el CORS del backend; se evita `DELETE` con cuerpo y mandar el
  `endpoint` en la URL (quedaría en el log de peticiones).
- **Registro de errores**: las respuestas pasan por `Responder` (spec 002); los mensajes son fijos y nunca incluyen el
  `endpoint` ni las claves del dispositivo (FR-019).

## R11. Qué ve el padre según el dispositivo

- **Decisión**: el frontend clasifica el dispositivo antes de mostrar el botón:
  `unsupported` (sin Service Worker/PushManager/Notification), `ios-needs-install` (iPhone/iPad fuera de modo
  instalado: `navigator.standalone !== true` y sin `display-mode: standalone`), `denied` (permiso negado), `off`,
  `on` (hay suscripción del navegador y permiso concedido), `unavailable` (el backend no tiene claves, R3).
- **Justificación**: FR-015 y la Historia 5: nunca un botón que no puede funcionar.

## R12. Pruebas E2E

- **Problema**: los navegadores de Playwright no pueden recibir avisos reales en CI (requiere el servicio de avisos del
  navegador y conexión a él), y WebKit de Playwright no tiene `PushManager`.
- **Decisión**:
  - E2E del flujo del padre en Chromium y Firefox, a 390 y 1280 px: activar (permiso concedido por Playwright y
    `pushManager.subscribe` sustituido en la página por uno que devuelve una suscripción de prueba), elegir el texto la
    primera vez, verlo activo, segundo dispositivo sin preguntar, desactivar, cerrar sesión; y comprobar en el backend
    que el dispositivo quedó registrado o inactivo.
  - En WebKit, la prueba verifica el mensaje de "este navegador no puede recibir recordatorios".
  - El envío real se prueba en el backend: prueba de integración con un servidor HTTP local como `endpoint` del
    dispositivo, que comprueba que llega un mensaje cifrado (`Content-Encoding: aes128gcm`, `TTL`, `Urgency`), una sola
    vez por toma, y que 410 desactiva el dispositivo.
- La prueba manual con un teléfono real queda en `quickstart.md`.
