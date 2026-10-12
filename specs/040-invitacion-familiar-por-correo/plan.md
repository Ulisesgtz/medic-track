# Plan de Implementación: Invitación a la familia por correo

**Rama**: `feature/040-invitacion-familiar-por-correo` | **Fecha**: 2026-10-12 | **Especificación**: [spec.md](./spec.md)

## Resumen

Al crear o reenviar una invitación (spec 032), el servicio manda además un correo con un **hipervínculo a la misma liga**, sin quitar «Copiar liga». Backend con frontend mínimo; sin endpoints nuevos. Seis piezas (research R1–R10):

1. **`internal/mailer` (nuevo)**: recibe lo genérico del digest —`Message` (+`HTML`), `Sender`, `SendError`, `ResendSender`, la limpieza de texto y el bucle de reintentos— y agrega la **cuota diaria compartida** (`Quota`: reservar con un solo `INSERT … ON CONFLICT … WHERE sent < tope`, devolver si falla, aviso a los 80 una sola vez por día vía `jobreport` `job:mailer`) y un `DiscardSender` para E2E/desarrollo (R1, R2, R9).
2. **Migración `0025`**: tabla `mail_daily_counts` (día en Ciudad de México, contador, ya-avisó) y cuatro columnas en `family_invitations` (`email_status`, `email_status_at`, y el conteo del día por invitación). Los límites por invitación y por familia se revisan dentro de la transacción que ya bloquea a la dueña (R3, [data-model.md](./data-model.md)).
3. **Despachador en segundo plano** (`family/emaildispatch.go`): cola en memoria de 64 con 2 trabajadores; cada intento comprueba que la invitación siga vigente (misma ficha, pendiente), reserva cupo, manda con 3 intentos (esperas 5 s y 20 s) y marca `sent`/`failed` solo si la fila conserva esa ficha; un barrido (al arrancar y cada minuto) resuelve a `failed` lo que lleve más de 3 minutos `sending`; al apagar, lo en cola se marca `failed` (R4).
4. **Contenido** (`family/emailcontent.go`): asunto, texto y HTML mínimo con solo nombre de pila, rol, vencimiento, liga y aviso de ignorar ([contracts/email.md](./contracts/email.md), R5).
5. **API**: `emailStatus`/`emailStatusAt` aditivos en las respuestas de crear, reenviar y `GET /family` ([contracts/api.md](./contracts/api.md), R7).
6. **Frontend** `features/family/`: «Liga lista» y la lista de pendientes muestran el estado; `useFamily` refresca cada 3 s mientras haya `sending` (R8).

El digest (`errordigest`) pasa a importar `mailer` y reserva un cupo de la clase *digest* (tope 100) antes de enviar; las invitaciones usan la clase *invitación* (tope 95), de modo que los últimos 5 correos del día son del digest.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.2; React 19 + TypeScript. **Dependencias**: ninguna nueva (`net/http`, `html`, `time/tzdata`; TanStack Query ya existe).

**Almacenamiento**: PostgreSQL; migración `0025_invitation_email_and_mail_quota.sql` (una tabla pequeña y cuatro columnas nulas/con valor por omisión; las filas existentes quedan en `none`).

**Pruebas**: `go test` con base real (cuota con goroutines y cambio de día, aviso una sola vez, límites por invitación y por familia, transiciones de estado, barrido de `sending` viejo, reenvío que invalida un envío en cola, reserva devuelta al fallar), un `Sender` falso (reintentos, 409 de idempotencia, éxito tras dos fallas), un `httptest` para el adaptador (cuerpo con `html`, sin campos de seguimiento, sin redirecciones) y una prueba de privacidad (el texto y el HTML no traen hijos, apellido ni correo de quien invita; ni correo, liga o ficha en logs ni `error_logs`). Las pruebas de `errordigest` y `jobreport` se mantienen verdes tras mudar el adaptador. Frontend: Vitest de `InviteLink`/`InvitationsList`/`useFamily` y E2E a 390 y 1280 px con `MAIL_DRIVER=discard`. Cobertura > 90 % (Principio VI).

**Plataforma Objetivo**: el mismo API en Railway (distroless) y la PWA en Cloudflare Pages. **Tipo de Proyecto**: web-service + frontend.

**Objetivos de Rendimiento**: la respuesta de crear/reenviar no espera al proveedor (SC-004); el correo sale en < 1 minuto en condiciones normales (SC-002).

**Restricciones**: la ficha no se guarda ni se registra (el mensaje vive solo en memoria); correo, liga y ficha nunca llegan a logs, `error_logs`, errores, contador ni reportes (FR-015); una falla de correo no bloquea ni revierte invitar/reenviar/cancelar (FR-007); sin acortador ni redirección ni seguimiento (FR-003, el seguimiento es del dominio en Resend y está apagado: paso del dueño); toda respuesta por `*httpx.Responder`; Swagger regenerado.

**Escala/Alcance**: decenas de invitaciones al mes; la cuota de 100 al día se vigila, no se espera alcanzar.

## Verificación de la Constitución

- **I**: el correo es neutro y habla solo de una invitación a la familia; sin diagnósticos ni consejos. ✅
- **II**: el proveedor, un tercero, recibe el correo de la persona invitada, el nombre de pila de quien invita, el rol, el vencimiento y la liga; nada de los hijos ni de salud. No hay acortador ni seguimiento para que la ficha no la vea un tercero; aceptar sigue exigiendo el correo verificado. El contador solo guarda cuántos salieron. ✅
- **III**: Go + PostgreSQL + React; Resend ya aprobado en la spec 039. ✅
- **IV**: invitar sigue siendo del plan de pago (spec 032); el servidor decide el plan; el correo no cambia ninguna regla de plan. ✅
- **V**: un paquete común (por extracción, no por duplicación), una tabla de una fila por día y cuatro columnas; sin dependencias ni pantallas nuevas. ✅
- **VI**: cobertura > 90 % con pruebas de cuota, concurrencia, límites, estados y privacidad. ✅
- **Reglas del repo**: sin endpoints nuevos (los existentes ya responden por `Responder`); fallas del proceso por `jobreport` (spec 018) como `job:mailer`; código en inglés, docs en español; se actualizan `CLAUDE.md` raíz, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `DEPLOY.md` y `BACKLOG.md`. ✅

*Re-verificación tras el diseño de la Fase 1*: sin cambios; el diseño no agregó dependencias, endpoints ni superficie nueva. El único riesgo de privacidad nuevo —el mensaje con la ficha en una cola en memoria— no se persiste ni se registra. ✅

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/040-invitacion-familiar-por-correo/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones R1–R10 y alternativas
├── data-model.md        # Fase 1: columnas, tabla de cuota, transiciones de estado
├── quickstart.md        # Fase 1: validación automática, manual y real
├── contracts/
│   ├── api.md           # campos nuevos de las respuestas existentes
│   ├── email.md         # asunto, texto, HTML y reglas del correo
│   └── configuration.md # variables y pasos del dueño
├── checklists/requirements.md
└── tasks.md             # lo crea /speckit-tasks
```

### Código Fuente

```text
backend/
├── migrations/0025_invitation_email_and_mail_quota.sql
├── cmd/api/main.go                      # arma mailer.Config, Quota, el despachador y se lo da a family y al digest
└── internal/
    ├── mailer/                          # NUEVO
    │   ├── message.go, sender.go        # Message(+HTML), Sender, SendError, IsRetryable, ResendSender (movidos de errordigest)
    │   ├── retry.go                     # SendWithRetries (movido de errordigest)
    │   ├── clean.go                     # Clean(s, maxRunes) (sanitize.go movido)
    │   ├── discard.go                   # DiscardSender
    │   ├── config.go                    # Config, ConfigFromEnv (topes, umbral, límites, MAIL_FROM, MAIL_DRIVER)
    │   ├── quota.go                     # Quota, Store, ErrQuotaExceeded, día en Ciudad de México, aviso una vez
    │   ├── repository.go                # Store sobre mail_daily_counts
    │   └── *_test.go
    ├── errordigest/                     # importa mailer; reserva cupo de la clase digest; sin sender.go ni sanitize.go
    └── family/
        ├── emailcontent.go              # asunto, texto, HTML, fecha y nombre limpio
        ├── emaildispatch.go             # cola, trabajadores, vigencia, reintentos, barrido, cierre
        ├── model.go, repository.go      # EmailStatus en Invitation; reserva de límites en Create/Resend; SetEmailStatus y barrido
        ├── service.go, handler.go       # Invite/Resend encolan; respuestas con emailStatus
        └── *_test.go
frontend/src/features/family/            # types.ts, useFamily.ts (refetchInterval), InviteLink.tsx, InvitationsList.tsx, emailStatus.ts (textos) + pruebas
frontend/e2e/                            # familia.spec.ts: estado del correo (390 y 1280 px)
CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md, DEPLOY.md, BACKLOG.md, .github/workflows/ci.yml (MAIL_DRIVER=discard en E2E)
```

**Decisión de Estructura**: lo genérico va en `mailer` (lo usan dos dominios) y lo propio de las invitaciones (contenido, cola, estados) se queda en `family`, que ya es dueño de las invitaciones y de su transacción. `mailer` no importa a `family` ni a `errordigest`.

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar. Compromisos asumidos y documentados: la cola en memoria pierde correos si el proceso muere (lo cubre el barrido y la salida «copia la liga», R4); la copia de las frases de rol entre Go y TypeScript (R5); y la comprobación «la invitación sigue vigente» antes de enviar no es atómica con el envío (ventana de milisegundos; el correo ya salido con una liga que después se reenvió sigue siendo inofensivo porque la liga vieja deja de servir).
