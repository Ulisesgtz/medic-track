# Contrato: cambios a `GET /accounts/{accountId}` (specs/003-home-listado-hijos)

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Documenta solo lo que **cambia** respecto a `specs/003-home-listado-hijos/contracts/get-account.md`. La forma
del cuerpo `200`/`404` no cambia.

## Qué cambia

Ahora requiere sesión de Clerk **y** que esa sesión sea dueña de la cuenta pedida:

```http
GET /accounts/{accountId}
Authorization: Bearer <token de sesión de Clerk>
```

| Caso | Respuesta |
|---|---|
| Sin token / token inválido | `401 { "error": "unauthorized", "message": "A valid session is required" }` |
| Token válido, pero la sesión no tiene ninguna cuenta vinculada, o su cuenta vinculada no es `{accountId}` | `403 { "error": "forbidden", "message": "This account does not belong to the current session" }` |
| Token válido, cuenta vinculada = `{accountId}`, pero `{accountId}` no existe (caso ya cubierto hoy) | Sigue siendo `404` — no debería ocurrir en la práctica (si la cuenta de la sesión no existe, `AuthorizeAccountAccess` ya habría fallado con 403 antes de llegar aquí), se deja documentado por completitud |
| Todo correcto | `200`, mismo cuerpo de siempre |

## Lo que NO cambia

- El propio frontend deja de necesitar este endpoint para "leer una cuenta ajena" en ningún flujo — ya usa
  `GET /accounts/me` para la suya (contracts/get-accounts-me.md). Este endpoint queda protegido igual por
  defensa en profundidad, no porque el frontend lo siga llamando con un `accountId` que no sea el propio.
