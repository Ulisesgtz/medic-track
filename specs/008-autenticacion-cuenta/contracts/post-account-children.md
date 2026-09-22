# Contrato: cambios a `POST /accounts/{accountId}/children` (specs/003-home-listado-hijos)

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Documenta solo lo que **cambia** respecto a `specs/003-home-listado-hijos/contracts/post-account-children.md`.
El cuerpo de la petición (`createChildRequest`) y de la respuesta no cambian.

## Qué cambia

Misma regla que `contracts/get-account.md`: requiere sesión de Clerk y que la sesión sea dueña de
`{accountId}`.

```http
POST /accounts/{accountId}/children
Authorization: Bearer <token de sesión de Clerk>
Content-Type: application/json
```

| Caso | Respuesta |
|---|---|
| Sin token / token inválido | `401` |
| Token válido, pero `{accountId}` no es la cuenta de la sesión | `403` — antes de validar ningún campo del hijo |
| Token válido, cuenta correcta, campos inválidos | `400` (igual que hoy) |
| Token válido, cuenta correcta, límite freemium ya alcanzado | `422` (igual que hoy) |
| Todo correcto | `201` (igual que hoy) |

La verificación de dueño (403) ocurre **antes** que la validación de campos (400) y el límite freemium (422) —
mismo orden de prioridad que ya usa `CreateAccount` entre freemium y validación (backend/CLAUDE.md), aplicado
ahora también a "esto es tuyo" como el primer filtro de todos.
