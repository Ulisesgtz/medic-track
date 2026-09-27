# Plan de Implementación: Recordatorios de tomas por notificaciones push

**Rama**: `feature/011-recordatorios-push` | **Fecha**: 2026-09-27 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/011-recordatorios-push/spec.md`

## Resumen

El padre activa los recordatorios por dispositivo (PWA del teléfono o navegador de la PC) y, a la hora de cada toma no
marcada, le llega un aviso del sistema aunque la app esté cerrada. Se usa **Web Push estándar**: el frontend registra
un service worker y la suscripción del navegador; el backend guarda los dispositivos por cuenta y un proceso interno
revisa cada 30 s qué tomas tocan, las **reclama** (para no avisar dos veces) y envía el aviso cifrado a cada dispositivo
activo. El aviso muestra el detalle o un texto genérico según lo que el padre eligió al activar la primera vez, abre la
consulta al tocarlo y, donde el sistema lo permite, trae un botón "Tomada" que marca esa toma con un token firmado de un
solo uso por toma, sin sesión. Detalle de cada decisión en [research.md](./research.md).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend); TypeScript + React 19 + Vite (frontend) — stack existente.

**Dependencias Principales**:
- Backend: **`github.com/SherClockHolmes/webpush-go`** (nueva: VAPID + cifrado RFC 8291, research R2). Resto sin
  cambios (chi, pgx, clerk-sdk-go).
- Frontend: **`vite-plugin-pwa`** (nueva, de desarrollo: compila el service worker en TypeScript, research R4). Resto sin
  cambios (`@clerk/react`, TanStack Query, React Router, Tailwind).

**Almacenamiento**: PostgreSQL, migración `0011`: tabla `reminder_devices`, columnas `accounts.reminder_detail` y
`doses.reminder_sent_at` con índice parcial ([data-model.md](./data-model.md)).

**Pruebas**: `go test` + `testify` (repositorio con BD real, servicio con un `Sender` falso, integración con un servidor
HTTP local como servicio de avisos, token de acción, handlers, `router_test.go`); Vitest + Testing Library (hook, tarjeta,
elección de texto, funciones del service worker); Playwright a 390 y 1280 px (research R12). Cobertura >90% (Principio VI).

**Plataforma Objetivo**: La PWA existente (Android, iPhone/iPad instalada, navegadores de escritorio) y el backend HTTP,
que ahora debe correr siempre (research R5).

**Tipo de Proyecto**: Aplicación web — extiende `backend/` y `frontend/`.

**Objetivos de Rendimiento**: 95% de los avisos en menos de 2 minutos tras la hora (SC-001): vuelta cada 30 s, consulta
por índice parcial, envío a los dispositivos de una cuenta en paralelo con límite.

**Restricciones**: como máximo un aviso por toma (reclamar antes de enviar); nada de datos de salud en modo genérico;
nunca el `endpoint`, las claves ni el token de acción en logs o `error_logs`; solo `POST`/`PATCH` (CORS actual); el
backend arranca aunque falten las claves VAPID (recordatorios "no disponibles").

**Escala/Alcance**: pocas familias en el MVP; decenas de tomas por día por cuenta; unos pocos dispositivos por cuenta.

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

- **Principio I (Registra, Nunca Interpreta)**: la constitución permite explícitamente "recordatorios de la dosis tal cual
  fue recetada". El aviso solo repite la hora, el medicamento y el hijo que el padre registró; texto fijo "Toma
  programada", sin imperativos ni dosis (FR-007). No se agregan avisos de "toma olvidada" ni repeticiones, que empezarían a
  opinar sobre la adherencia. ✅ Cumple. Como toca este principio, entra en la confirmación de abajo.
- **Principio II (Privacidad)** — **el más relevante**: los avisos viajan por el servicio de avisos de cada navegador
  (Google, Mozilla, Apple), que son terceros. Mitigaciones: contenido cifrado de extremo a extremo (no pueden leerlo);
  modo genérico sin ningún dato de salud ni siquiera cifrado; ni correo ni `accountId` en el aviso; el padre elige el
  texto de forma consciente al activar; nada de SDKs de terceros en el cliente. Lo que sí ven esos servicios es **que**
  un dispositivo recibió un mensaje y cuándo. La regla "cambios que toquen el Principio I o II requieren confirmación
  explícita del usuario antes de implementarse" aplica. ⚠️ **Requiere confirmación explícita antes de `/speckit-tasks`**.
- **Principio III (Stack Fijo)**: Go + React PWA + PostgreSQL sin cambios; la constitución ya pide el service worker
  "como parte del build". Una librería nueva en cada lado. ✅ Cumple.
- **Principio IV (Freemium)**: recordatorios en el plan gratuito, sin límite por volumen (FR-018). ✅ Cumple.
- **Principio V (Simplicidad y MVP)**: "recordatorios con 'dosis tomada'" es alcance MVP de la constitución. Sin cola ni
  cron externo: un ticker en el mismo proceso y una columna para no repetir (research R5/R6). Sin funcionamiento sin
  conexión, sin repetir avisos, sin anticipación. ✅ Cumple.
- **Principio VI (Pruebas)**: cobertura >90% en ambos lados y E2E del flujo de activación en Playwright; el envío real se
  cubre con una prueba de integración del backend (research R12), porque los navegadores de Playwright no reciben avisos
  reales. ✅ Cumple, con esa limitación documentada.
- **Convención del proyecto — mocks**: no hay mock para esta pantalla; la tarjeta y la elección de texto se diseñan con
  `specs/005-identidad-visual-front-end/design-tokens.md` (superficie `hint`, un solo botón sólido por pantalla: el de
  la tarjeta va con contorno) y ambos diseños (móvil y web). Se muestran capturas al usuario antes de cerrar.

**Re-verificación tras la Fase 1**: el diseño (tabla de dispositivos, reclamo por toma, token HMAC por toma, contenido
genérico sin datos) no agrega nada que cambie las conclusiones. Sin violaciones que justificar.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/011-recordatorios-push/
├── spec.md
├── plan.md              # este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/
│   └── reminders-api.md # Fase 1
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── migrations/0011_create_reminders.sql        # reminder_devices, accounts.reminder_detail, doses.reminder_sent_at
├── cmd/api/main.go                             # lee VAPID_* y REMINDER_ACTION_SECRET, arranca el ticker, cierra con el contexto
└── internal/
    ├── reminder/                               # paquete nuevo
    │   ├── model.go                            # Device, DueDose, Payload, DetailMode
    │   ├── repository.go                       # UpsertDevice, DeactivateDevice, ActiveDevicesFor, ClaimDueDoses, MarkTakenByAction
    │   ├── service.go                          # Tick (reclamar → armar contenido → enviar → desactivar 404/410), Activate, Deactivate
    │   ├── sender.go                           # interfaz Sender + WebPushSender (webpush-go, TTL 3600, urgencia high)
    │   ├── actiontoken.go                      # firmar/verificar HMAC (doseId, deviceId, vence 24 h)
    │   ├── scheduler.go                        # ticker de 30 s con context
    │   ├── handler.go                          # GET /reminders/config, POST devices, POST devices/remove, POST actions/taken
    │   └── *_test.go                           # incl. integración con httptest como servicio de avisos
    ├── account/                                # reminderDetail en el modelo, lectura y respuesta; PATCH reminder-settings
    └── server/router.go (+ router_test.go)     # rutas nuevas con RequireSession/RequireOwner; actions/taken pública

frontend/
├── vite.config.ts                              # + vite-plugin-pwa (injectManifest, sin precaché, manifest: false)
├── src/
│   ├── sw.ts                                   # service worker: solo conecta push / notificationclick
│   ├── main.tsx                                # registra el service worker
│   ├── features/reminders/                     # feature nueva
│   │   ├── notification.ts                     # funciones puras: aviso desde el contenido, a dónde abrir, acción "Tomada"
│   │   ├── deviceSupport.ts                    # unsupported / ios-needs-install / denied / off / on / unavailable
│   │   ├── useReminders.ts                     # estado del dispositivo, activar (permiso → suscribir → backend), desactivar
│   │   ├── RemindersCard.tsx                   # la opción en el home (móvil y web), con el aviso "es una ayuda"
│   │   ├── ReminderDetailDialog.tsx            # elección detalle / genérico con ejemplo (primera activación)
│   │   ├── api.ts                              # fetchReminderConfig, registerDevice, removeDevice, updateReminderDetail
│   │   └── *.test.ts(x)
│   ├── features/home/HomePage.tsx              # muestra RemindersCard en ambos diseños
│   ├── features/home/types.ts                  # Account.reminderDetail
│   └── features/auth/useLogout.ts              # quita la suscripción y avisa al backend antes de cerrar sesión (máx. 3 s)
└── e2e/recordatorios.spec.ts                   # flujo de activación a 390 y 1280 px (research R12)

.github/workflows/ci.yml                        # genera claves VAPID de prueba para el job de E2E
```

**Decisión de Estructura**: aplicación web (backend + frontend), como las specs anteriores. Paquete nuevo
`internal/reminder` en el backend y feature nueva `features/reminders/` en el frontend; los cambios a `account`, `home`
y `auth` son los puntos donde la cuenta, el home y el cierre de sesión se enteran de los recordatorios.

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar.
