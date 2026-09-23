# Modelo de Datos: Autenticación real de cuenta (login)

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), todos los nombres de
> campo/tabla/columna están en inglés. La prosa explicativa se mantiene en español.

## Cambios a entidades existentes

### Account (tabla `accounts`, specs/001) — un campo nuevo

| Campo | Tipo | Notas |
|---|---|---|
| `clerk_user_id` | TEXT UNIQUE NULL | **Nuevo** (migración `0009`). El id de usuario que Clerk asigna a este tutor. `NULL` = cuenta creada antes de esta feature, todavía no vinculada (Historia 5 de spec.md); se llena la primera vez que ese tutor entra con el mismo correo con el que ya tenía cuenta. |

Todo lo demás de `Account`/`Child` (specs/001/003/004) se queda igual — esta feature no toca su forma, solo
agrega el vínculo con Clerk (research.md, punto 3).

**Reglas nuevas**:

- `clerk_user_id` es único cuando no es `NULL` (un usuario de Clerk vincula, como máximo, una sola cuenta de
  PediTrack). Se aplica con el propio `UNIQUE` de la columna.
- `email` sigue siendo `NOT NULL UNIQUE` como hoy (migración `0002`) — sigue siendo el respaldo que evita que
  dos cuentas de PediTrack terminen con el mismo correo, aunque ahora el valor se toma del perfil verificado de
  Clerk en vez del cuerpo de la petición (contracts/post-accounts.md).

## Concepto: "Sesión de tutor" e "Identidad externa" (spec.md) — sin tabla propia

Como decide research.md (punto 3), estas dos entidades de spec.md no tienen tabla propia: la sesión la emite y
guarda Clerk (el backend de PediTrack solo la **verifica** en cada petición, nunca la persiste), y la
"identidad externa" es exactamente el campo `Account.clerk_user_id` de arriba — vincular una cuenta es poner
ese valor, no crear una fila en otro lado.

## Relaciones (sin cambio respecto a specs/001/003/004)

```text
Account 1───N Child
Child 1───N Consultation (specs/004)
```

Lo único nuevo es que `Account` ahora también apunta, opcionalmente, a un usuario de Clerk:

```text
Clerk (usuario, fuera de PediTrack) 0..1───1 Account (vía accounts.clerk_user_id)
```

## Errores de dominio nuevos (`internal/account/errors.go`)

| Error | Cuándo | HTTP |
|---|---|---|
| `ErrAccountAccessDenied` | La sesión es válida (hay un `clerk_user_id`), pero la cuenta que resuelve no es la que pide la ruta (`accountId`, o el `accountId` dueño del `childId`/`consultationId` en `internal/consultation`) | 403 |
| `ErrNoAccountForSession` | La sesión es válida pero no hay ninguna `Account` vinculada a ese `clerk_user_id`, ni ninguna cuenta sin vincular con el mismo correo — el estado normal justo antes de terminar el registro (Historia 1) | 404, solo en `GET /accounts/me` |

`ErrAccountNotFound` (ya existente, specs/003) se sigue usando tal cual para un `accountId` en la ruta que no
corresponde a ninguna cuenta en absoluto (distinto de `ErrAccountAccessDenied`, que sí existe pero no es tuya).

## Migración `0009_add_clerk_user_id_to_accounts.sql`

```sql
ALTER TABLE accounts ADD COLUMN clerk_user_id TEXT UNIQUE;
```

Nullable a propósito (Historia 5) — sin `DEFAULT`, sin backfill: las cuentas existentes quedan con `NULL` hasta
su primer acceso post-feature.
