# Especificación: Registro de aceptación del aviso "Antes de empezar"

**Rama**: `feature/008-autenticacion-cuenta` (se entrega en el PR #8, junto con la 009)
**Estado**: Implementada
**Depende de**: `specs/009-aviso-informativo-cuenta-nueva/` (el aviso), `specs/008-autenticacion-cuenta/` (la sesión y el dueño de la cuenta)

## Objetivo

Que quede **evidencia auditable** de que cada cuenta vio y confirmó el aviso "Antes de empezar" (la app es informativa y de
seguimiento, no sustituye una consulta médica, cómo se lee la receta y qué pasa con la foto): qué cuenta, qué versión del
texto y cuándo. En la 009 «Entendido» solo cerraba el banner y no dejaba rastro.

## Requisitos funcionales

- **FR-001**: Al pulsar «Entendido», el frontend pide `POST /accounts/{accountId}/disclaimer-acceptance` con la versión del
  texto que la cuenta tiene delante; el backend guarda una fila `(cuenta, versión, fecha y hora)`.
- **FR-002**: El registro es **idempotente**: confirmar dos veces la misma versión no crea otra fila y conserva la fecha de la
  primera vez (lo que importa a una auditoría es cuándo se confirmó por primera vez).
- **FR-003**: La versión de servicio la fija el backend (`account.CurrentDisclaimerVersion`, una fecha). Toda respuesta de
  cuenta (`GET /accounts/me`, `GET /accounts/{id}`, `POST /accounts`, `POST /accounts/{id}/children`) incluye
  `disclaimerVersion` y `disclaimerAccepted` (si esa cuenta ya confirmó **esa** versión). Confirmar una versión que no es la
  vigente se rechaza con 400 y no se guarda nada: no se puede "aceptar" un texto viejo o inventado.
- **FR-004**: El banner se muestra mientras `disclaimerAccepted` sea `false`: a una cuenta recién creada, a una cuenta anterior
  a esta función (la primera vez que abre el home) y a cualquier cuenta cuando cambie el texto (se sube la versión).
  Sustituye la solución de la 009 (estado de navegación), que no servía para cuentas viejas ni dejaba rastro.
- **FR-005**: Si no se pudo guardar, el banner **no** se cierra y dice "No pudimos guardar tu confirmación…"; la persona puede
  reintentar.
- **FR-006**: El endpoint exige sesión y que la sesión sea dueña de la cuenta (`RequireOwner`); una sesión ajena recibe 403 y
  no puede registrar nada a nombre de otra cuenta. Sus errores 4xx/5xx quedan en `error_logs` como los de cualquier endpoint.

## Modelo de datos

`disclaimer_acceptances(id uuid pk, account_id → accounts, version text, accepted_at timestamptz default now(), UNIQUE(account_id, version))`
(migración `0010`). No hay borrado de cuentas ni de aceptaciones.

## Decisiones

- **Sin IP ni navegador.** Se guarda lo mínimo que hace auditable el hecho (cuenta, versión, fecha). La IP y el user agent son
  datos personales adicionales (Principio II) y no aportan a saber *quién* confirmó, porque la cuenta ya está autenticada
  con Clerk. Si un asesor legal los pide, se agregan columnas nulas en otra migración.
- **La versión es una fecha** (`2026-09-26`), la del último cambio del texto. Cambiar la redacción del banner obliga a subir
  la constante del backend; así el registro dice qué texto se confirmó.
- **No es un consentimiento legal.** Es un acuse de lectura auditable. Si hacen falta términos de uso y un aviso de privacidad
  con aceptación expresa (datos de salud de menores), lo debe definir quien conozca la ley de protección de datos; se
  construiría sobre esta misma tabla (otra "versión" y otro texto).

## Pruebas

- Backend: `disclaimer_test.go` (repositorio: idempotencia y fecha original, cuenta inexistente, error de conexión, versión
  vigente vs vieja; servicio: versión vieja rechazada; handler: ciclo completo, idempotencia, errores, 500) y `router_test.go`
  (401 sin sesión, 403 a otra sesión, el dueño llega al handler).
- Frontend: `WelcomeDisclaimer.test.tsx`, `api.test.ts` y `HomePage.test.tsx`.
- E2E (390 y 1280 px): la cuenta nueva ve el aviso, «Entendido» queda registrado en el backend, no vuelve al recargar ni al
  cerrar sesión y volver a entrar; una cuenta que nunca lo vio lo ve.
