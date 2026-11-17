# Investigación (Fase 0): Primer uso guiado

Cada decisión se tomó leyendo el código de `develop` al 2026-11-16 (rutas y líneas en el reporte de exploración del plan).

## R1. Dónde se guarda «Ahora no» (por cuenta)

- **Decisión**: una columna nueva `accounts.first_use_guide_dismissed_at timestamptz NULL` (migración `0038`). `NULL` = la guía no está cerrada; con fecha = la cerró con «Ahora no». Reabrir la vuelve a `NULL`.
- **Justificación**: es un solo dato por cuenta que va y viene (cerrar y reabrir), no un historial. Una columna de `accounts` no necesita paso propio en el borrado de la cuenta (`accountdeletion/purge.go` borra la fila completa) ni tabla nueva que registrar en `TestPurge_KnowsEveryTable`. Principio V.
- **Alternativas**: una tabla al estilo `personal_routine_notices` (0021) — sirve para «visto una vez», no para algo que se reabre; habría que borrar filas para reabrir y sumarla a `purge.go`. `localStorage` — no cumpliría la decisión del dueño (por cuenta, en todos los dispositivos).
- **Pendiente para las tareas**: revisar si la descarga de datos (spec 070, `dataexport/collect.go`) exporta las columnas de `accounts`; si lo hace con una lista explícita, agregar la nueva.

## R2. Cómo sabe la app que el paso 1 está hecho

- **Decisión**: la respuesta de la cuenta (`GET /accounts/me` y `GET /accounts/{accountId}`) suma un bloque `firstUseGuide` con `dismissed` y `firstConsultation` (`id`, `doctorName`, `childId` o `null` si es propia), o `null` si la cuenta aún no tiene consultas. Se calcula con una sola consulta sobre `consultations.account_id` (NOT NULL desde la `0032`, cubre las de los hijos y las propias, «solo registro» incluidas), la más antigua por `created_at, id`.
- **Justificación**: el inicio ya pide la cuenta (`['accounts','me']`); evita otra petición y que la guía «parpadee». La migración `0038` agrega el índice `consultations (account_id, created_at, id)`: hoy solo hay índice por `child_id` y el parcial de las propias, y `/accounts/me` se pide en cada pantalla.
- **Alternativas**: un `GET` aparte para la guía (otra petición en el inicio); contar las consultas de cada hijo en el frontend (N peticiones y no ve las propias).

## R3. Endpoint para cerrar y reabrir

- **Decisión**: `PUT /accounts/{accountId}/first-use-guide` con `{ "dismissed": true|false }`, solo la dueña (`ownsAccount`), idempotente, responde `200` con el bloque `firstUseGuide` actualizado. Escribe a través de `*httpx.Responder`. **No** entra en `AllowedWhilePending` (una cuenta en pausa no ve la guía; recibe el 409 de siempre).
- **Justificación**: un `PUT` con el estado deseado es idempotente y sirve para los dos sentidos; dos dispositivos que cierran a la vez no chocan.
- **Alternativas**: `POST …/dismiss` + `DELETE …/dismiss` (dos rutas para un bool).

## R4. Quién ve la guía

- **Decisión**: la ve la cuenta con **al menos un hijo propio**: en la respuesta de la cuenta, los hijos propios vienen con `role` `owner` (o sin `role`), los de otra familia con `tutor`/`caregiver`/`child`. Regla en el frontend: `account.children.some(c => !c.role || c.role === 'owner')`, además de `account.deletion == null` y `disclaimerAccepted === true`.
- **Justificación**: es el supuesto de la spec (FR-024): registrar la primera consulta y el sentido de la guía son de la dueña. El teléfono del hijo (`/hijo/hoy`) no pasa por el inicio, así que nunca la ve.
- **Pendiente de confirmar con el dueño**: si una persona invitada que solo ve hijos compartidos debería ver al menos los pasos 2 y 3 (instalar y avisos). El plan sigue la spec (no la ve).

## R5. «Antes de empezar» como ventana

- **Decisión**: `WelcomeDisclaimer` pasa a ser una ventana con el mismo patrón hecho a mano que ya usan `FreemiumLimitModal` y `shared/ui/ConfirmDialog` (portal a `body`, hoja desde abajo en el teléfono y centrada en la web con `useIsDesktop`, `useBodyScrollLock`, ciclo de Tab dentro). Diferencias: **Escape y el fondo no cierran** (FR-003), el foco empieza en el título (`tabIndex=-1`) y el único botón es «Entendido», sólido. Ancho 600 px en la web (el mock), no los 560 de `ConfirmDialog`. La mutación, la API (`acceptDisclaimer`) y el `setQueryData` de hoy no cambian; el error sigue con `role="alert"`, ahora dentro de la ventana.
- **Justificación**: no hay librería de diálogos en el proyecto y los cuatro diálogos existentes son a mano; seguir el mismo patrón (Principio V). Se monta en el mismo lugar del inicio, así que se ve donde hoy se ve la tarjeta.
- **Alternativas**: `<dialog>` nativo con `showModal()` (no se usa en el proyecto, y su Escape habría que anularlo); extender `ConfirmDialog` con una prop «no se puede cancelar» (lo complica para todos sus usos).

## R6. Detectar instalación y ofrecer «Instalar»

- **Decisión**: un módulo `shared/install/` con:
  - `isRunningInstalled()` = `matchMedia('(display-mode: standalone)')` o `navigator.standalone` (lo que ya hacen `reminders/deviceSupport.ts:isInstalled` y `ChildTodayPage`; se unifican aquí).
  - `platform()` = `ios-safari` / `ios-other` / `android` / `desktop`, reutilizando `isIOS()` de `deviceSupport.ts` y el agente de usuario para Safari vs otro navegador en iOS (CriOS/FxiOS/EdgiOS).
  - `installPrompt`: escucha `beforeinstallprompt` **desde el arranque** (`main.tsx`, el evento llega antes de que se monte el inicio), guarda el evento, expone `canInstall()` y `promptInstall()`, y escucha `appinstalled`. Un hook `useInstallPrompt()` lo hace reactivo.
- **Justificación**: hoy hay tres detecciones de «instalada» y ninguna escucha `beforeinstallprompt`; el botón «Instalar» de Android y de Chrome en la computadora depende de ese evento. Si el navegador no lo ofrece, en la computadora el paso 2 no aparece (FR-013) y en Android se muestran las instrucciones del menú del navegador en lugar del botón.
- **Alternativas**: solo instrucciones escritas en todos los dispositivos (el mock pide el botón en Android).

## R7. Estado de los recordatorios en el dispositivo

- **Decisión**: reutilizar el hook que ya usa `MoreLinks` (`features/reminders/`, estados `on`/`off`/`loading`/`unsupported`/`ios-needs-install`/`denied`/`unavailable`) y su función de activación (con la elección de aviso con detalle o genérico la primera vez). Paso 3: `on` → hecho; `off` → «Activar recordatorios»; `ios-needs-install` → bloqueado; `denied` → instrucciones y «Ya los activé»; `unsupported`/`unavailable` → el paso no se muestra (FR-017). «Ya los activé» vuelve a leer `Notification.permission` y, si ya es `granted`, llama la misma activación; nunca vuelve a pedir el permiso.
- **Justificación**: FR-015 pide un solo mecanismo; la fila «Recordatorios» y la guía dicen lo mismo.

## R8. «Completa en este dispositivo»

- **Decisión**: `localStorage` con la llave `peditrack.firstUse.done.<accountId>` (envuelto en `try/catch`, como `reminders/deviceChoice.ts`). Se escribe cuando todos los pasos que se muestran en ese dispositivo quedan hechos; desde entonces el dispositivo muestra la línea de despedida una sola vez (8 s o al salir del inicio) y después nada.
- **Justificación**: decisión del dueño (por dispositivo). Si se borran los datos del navegador, la guía puede volver con sus pasos hechos marcados (supuesto aceptado en la spec). Se borra al cerrar sesión con el resto de las llaves de la cuenta solo si ya existe esa limpieza; no hace falta borrarla (no es un dato de salud).

## R9. Elegir el hijo del paso 1

- **Decisión**: con un hijo propio, el botón es un enlace directo a `/children/:childId/consultations/new`. Con varios, abre una ventana «¿De quién es la consulta?» con un botón por hijo propio (patrón de `ConfirmDialog`: hoja / centrada, Escape y fondo cancelan) que navega a la consulta de ese hijo. No existe un selector de hijo en la app; este es el primero y vive en `features/firstUse/`.
- **Justificación**: decisión del dueño (con varios, pregunta). Respeta las reglas del plan gratuito de la spec 030: «Nueva consulta» ya abre el aviso del plan si el servidor la rechazaría (`NewConsultationEntry`), así que el botón del paso 1 usa esa misma entrada en lugar de un enlace propio, y la guía no habla del plan.

## R10. Aviso al cerrar y fila para reabrir

- **Decisión**: «Ahora no» manda el `PUT`, oculta la tarjeta al instante (escribe el bloque en `['accounts','me']`) y muestra un aviso `role="status"` que se quita solo a los 8 s. `MoreLinks` recibe una fila opcional «Primeros pasos · Ver guía» al principio (en la web la franja pasa a `grid-cols-6` solo cuando está). Reabrir manda `PUT {dismissed:false}`.
- **Sin conexión** (spec 067): las dos acciones pasan por `guardMutation`; sin red se muestra el aviso de «necesita conexión» de siempre y no cambia nada.

## R11. Pruebas de redacción

- **Decisión**: los textos van en `features/firstUse/firstUseText.ts` y se prueban con la misma lista prohibida de `features/home/homeText.test.ts` (sin «debes», «falta», «pendiente», «urgente», felicitaciones, «%»…) más palabras de plan y precio («plan», «gratis», «pago», «precio», «MX$», «premium») y de salud («recomend», «diagnóst», «tratamiento ideal»).
- **Nota**: la lista prohibida del inicio incluye «toca» y «pendiente»; el mock dice «Toca Compartir…» en las instrucciones de Safari. Las instrucciones de instalación se prueban con su propia lista (sin «toca» prohibido) y la desviación queda anotada en `referencia/desviaciones.md` si hubiera que cambiar un texto del mock.

## R12. Pruebas E2E

- **Decisión**: `frontend/e2e/primer-uso.spec.ts`, en 390 y 1280 px: cuenta nueva → ventana «Antes de empezar» (Escape no la cierra) → «Entendido» → guía con los pasos pendientes → «Ahora no» → aviso y fila → recargar (sigue cerrada) → reabrir → registrar una consulta → paso 1 hecho. Los pasos 2 y 3 dependen del dispositivo real (instalación, permisos de iOS): se cubren con pruebas unitarias de la lógica de pasos (`guideSteps`) con cada combinación de plataforma y estado, y en Chromium con el permiso de notificaciones concedido por Playwright para el paso 3. Se corre con `scripts/e2e-local.sh e2e/primer-uso.spec.ts` antes de subir.
- **Cuentas de las E2E existentes**: hoy muchas E2E esperan el inicio sin ventana tras crear la cuenta; la ventana nueva tapa el inicio hasta «Entendido». Las tareas deben revisar los helpers de las E2E (la mayoría siembra cuentas por API) y, donde una prueba entra al inicio de una cuenta que no confirmó el aviso, confirmar el aviso en el helper.
