# Contrato: sesión y dueño en todo `internal/consultation` (specs/004/006)

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

spec.md FR-005 protege "cuenta, hijos, **consultas**" — este contrato cubre los 5 endpoints de
`internal/consultation` (specs/004-detalle-consulta-hijo, specs/006-resumen-detalle-hijo). Ninguno cambia su
cuerpo de petición/respuesta; todos ganan la misma regla de sesión + dueño.

## Endpoints cubiertos

| Endpoint | Cómo se resuelve la cuenta dueña |
|---|---|
| `GET /children/{childId}/consultations` | La cuenta dueña de `childId` (`children.account_id`) |
| `GET /children/{childId}/overview` | Igual que arriba |
| `POST /children/{childId}/consultations` | Igual que arriba |
| `GET /consultations/{consultationId}` | La cuenta dueña del hijo de esa consulta (`consultations.child_id → children.account_id`) |
| `PATCH /consultations/{consultationId}/doses/{doseId}` | La cuenta dueña del hijo de la consulta de esa toma |

## Regla, igual para los 5

```http
Authorization: Bearer <token de sesión de Clerk>
```

| Caso | Respuesta |
|---|---|
| Sin token / token inválido | `401 { "error": "unauthorized", "message": "A valid session is required" }` |
| Token válido, pero el `childId`/`consultationId` no pertenece a la cuenta de la sesión | `403 { "error": "forbidden", "message": "This resource does not belong to the current session" }` — sin importar si el recurso existe o no, para no filtrar por temporización/mensaje si un `childId` ajeno es real |
| Token válido, dueño correcto, pero el recurso no existe | `404` (igual que hoy — `ErrChildNotFound`/`ErrConsultationNotFound`/`ErrDoseNotFound`, sin cambio) |
| Todo correcto | Igual que hoy (200/201, mismo cuerpo) |

## Cómo se resuelve "dueño" desde `internal/consultation`

`internal/consultation` no gana ninguna columna nueva ni guarda `account_id` por su cuenta (research.md, punto
5) — antes de cada operación, el handler resuelve el `childId` en juego (directo, o vía `consultationId` →
`child_id`) y le pregunta a `internal/account` si ese hijo pertenece a la cuenta de la sesión. Es una
dependencia nueva de `consultation` hacia `account` (antes no existía ninguna) — aceptada porque `account` ya
es la única fuente de verdad de qué hijo es de quién (`children.account_id`, specs/001), y evita que dos
copias del mismo dato (aquí y en `consultation`) se desincronicen con el tiempo.

## Lo que NO cambia

- Ningún campo de petición o respuesta de estos 5 endpoints cambia.
- El orden interno de validaciones de cada endpoint (p. ej. `CreateConsultation` validando los campos del
  formulario) no cambia — la verificación de dueño se agrega **antes** de esas validaciones, mismo principio
  que `contracts/post-account-children.md`.
