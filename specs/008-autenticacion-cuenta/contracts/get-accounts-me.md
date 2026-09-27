# Contrato: `GET /accounts/me` (nuevo)

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Resuelve la cuenta del tutor autenticado a partir de su sesión de Clerk — reemplaza la necesidad de que el
cliente conozca o envíe un `accountId` (research.md, punto 4). Es lo primero que el frontend llama después de
iniciar sesión, y lo que decide a dónde navegar: si hay cuenta, a `/home`; si no, a terminar el registro.

## Request

```http
GET /accounts/me
Authorization: Bearer <token de sesión de Clerk>
```

Sin cuerpo, sin parámetros.

## Responses

### 200 OK

Mismo cuerpo que `GET /accounts/{accountId}` (specs/003):

```json
{
  "id": "uuid",
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "countryCode": "string | null",
  "stateCode": "string | null",
  "plan": "free",
  "children": [ { "...": "..." } ]
}
```

Dos caminos llegan a este `200`:

1. Ya existe una `Account` con `clerk_user_id` = el id de usuario de la sesión.
2. No existe (1), pero sí existe una `Account` con el mismo correo verificado por Clerk y `clerk_user_id IS
   NULL` — se vincula en la misma petición (`UPDATE accounts SET clerk_user_id = ...`) y se devuelve ya
   vinculada. Este es el primer acceso de una cuenta creada antes de esta feature (Historia 5 de spec.md).

### 401 Unauthorized

Sin sesión de Clerk válida (token ausente, expirado o inválido) — lo maneja el middleware `authmw.
RequireSession` antes de llegar al handler.

```json
{ "error": "unauthorized", "message": "A valid session is required" }
```

### 404 Not Found

Sesión válida, pero no hay ninguna `Account` vinculada ni ninguna sin vincular con el mismo correo. Es el
estado esperado justo después de un alta nueva en Clerk (Historia 1), antes de que el formulario de registro
llame a `POST /accounts` — el frontend interpreta este `404` como "sigue al formulario de registro", no como
un error.

```json
{ "error": "account_not_found_for_session", "message": "No PediTrack account is linked to this session yet" }
```

## Notas de contrato

- Nunca recibe ni devuelve nada relacionado con la contraseña — la identidad ya viene verificada por el token.
- El correo usado para el paso (2) es el que Clerk marca como verificado (research.md, punto 2) — nunca uno
  que el cliente mande por su cuenta en esta petición (no hay cuerpo).
