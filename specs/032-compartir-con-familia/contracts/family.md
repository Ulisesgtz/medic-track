# Contrato: familia, invitaciones y tomas con autor

Cambios **aditivos** sobre los contratos existentes más las rutas nuevas de `/family`. Todo detrás de `RequireSession`; todo
por el `*httpx.Responder`. **La ficha de la liga y el correo invitado nunca van en una dirección**: la ficha va en el cuerpo
(research R8). Niveles de acceso: `mark` (ver y marcar) y `full` (todo), ver research R3/R4.

## Cambios a lo existente

### `GET /accounts/me` (y la respuesta de cuenta)

Cada elemento de `children[]` gana:

```json
{ "accountId": "<cuenta dueña>", "role": "owner|tutor|caregiver|child", "plan": "free|paid", "readOnly": false }
```

- `plan` es el de la **familia** del hijo (la cuenta dueña); `readOnly` es verdadero cuando la persona es invitada y el plan de la
  familia ya no es de pago (solo ve y marca).
- Los hijos propios llevan `role: "owner"` y `plan` = el de la cuenta.
- La respuesta gana, **solo si la persona es miembro**: `family: { "role", "ownerAccountId", "ownerName", "plan", "readOnly" }`.

### Tomas (detalle de la consulta, resumen del hijo, `PATCH …/doses/{doseId}`)

Cada toma gana `takenBy`: `{ "name": "Ana", "at": "2026-10-06T14:05:00Z" }` o `null` (sin marcar, o marcada antes de esta función).
`name` es el **nombre de pila**, nunca el correo.

### `PATCH /consultations/{id}/doses/{doseId}` `{ "taken": true|false }`

- Nivel `mark`. **Marcar**: si ya estaba marcada, responde `200` con la toma **tal como estaba** (autor de la primera).
- **Desmarcar**: permitido si la sesión es `full` **o** es quien la marcó; si no, `403 forbidden`. Las marcadas antes (sin autor) solo las
  desmarca un `full`.

### `POST /accounts/{accountId}/children`

`accountId` puede ser la cuenta **dueña de una familia de la que la sesión es Tutor** (nivel `full`). El tope de hijos y el plan son
los de la cuenta dueña.

### `POST /children/{id}/consultations`, `…/end`, `…/extend`

Nivel `full`. Un Cuidador o un Hijo reciben `403`.

### `POST /reminders/actions/taken`

Sin cambio de forma. Marca a nombre de la **cuenta del dispositivo** del token y solo si esa cuenta **aún tiene acceso `mark`** al hijo
de la toma; si no, el mismo `400 invalid_action_token` de siempre.

## Rutas nuevas

### `GET /family`

El contexto de familia de la sesión.

```json
{
  "role": "owner|tutor|caregiver|child",
  "plan": "paid|free",
  "readOnly": false,
  "owner": { "id": "…", "name": "Ana" },
  "members": [ { "id": "…", "name": "Luis", "role": "tutor", "childId": null, "since": "2026-10-06T…", "canRemove": false } ],
  "invitations": [ { "id": "…", "email": "papa@ejemplo.com", "role": "tutor", "status": "pending", "expiresAt": "…", "childId": null } ],
  "capacity": { "max": 4, "used": 2 }
}
```

`canRemove` es verdadero solo para un Cuidador o un Hijo cuando la sesión es `full` (nunca para un Tutor). `invitations[]` solo lo
ve un `full`. Para una persona sin familia compartida: `role: "owner"` con listas vacías.

### `POST /family/invitations`  `{ "email", "role": "tutor|caregiver|child", "childId"?, "consent"? }`

Nivel `full` y cuenta dueña con plan de pago (si no: **422** `freemium_consultation_limit_exceeded` con `reason: "family"`).
Respuesta `201`: `{ "id", "email", "role", "status": "pending", "expiresAt", "token": "<ficha>" }` — la ficha **solo se devuelve aquí**
(y al reenviar); la app arma la liga `…/familia/invitacion#<ficha>`.

Errores: `400 validation_error` (`email` mal formado, `role` desconocido, `childId` ajeno o sin 10 años, falta `consent` para `child`);
`409 already_member` (ese correo ya tiene acceso), `409 invitation_pending`; `422 family_full` (4 personas).

### `POST /family/invitations/{id}/resend` y `POST /family/invitations/{id}/cancel`

Nivel `full`. `resend` devuelve una ficha nueva (la anterior deja de servir) y renueva el vencimiento; `cancel` pasa a `canceled`.
`404` si no es una pendiente de esa familia.

### `POST /family/invitations/preview`  `{ "token" }`

Cualquier sesión. Devuelve **solo lo necesario para decidir**: `{ "ownerName", "role", "childFirstName"?, "email", "expiresAt", "emailMatches" }`.
Una ficha desconocida, vencida, usada o cancelada responde un único `404 invitation_not_found` (no revela por qué ni datos de la familia).

### `POST /family/invitations/accept`  `{ "token" }` y `POST /family/invitations/decline`  `{ "token" }`

`accept`: exige que el **correo verificado** de la sesión sea el de la invitación (`403 email_mismatch`), que la persona **tenga cuenta**
(`409 account_required`: la app la crea primero), que **no tenga ya una familia activa** (`409 already_in_family`), que la cuenta dueña
siga con plan de pago (`422` `family`) y que haya lugar (`422 family_full`). Respuesta `200`: la membresía. Idempotente para la misma
persona. `decline` pasa a `declined`.

### `POST /family/members/{memberId}/remove`

Nivel `full`. Solo para un Cuidador o un Hijo (`403 cannot_remove_tutor` para un Tutor; la dueña no es miembro). Efecto inmediato.

### `POST /family/leave`

La persona **invitada** sale de su familia (inmediato, sin aprobación). La dueña recibe `403 owner_cannot_leave`.

## Códigos y mensajes

Los errores de este contrato usan el `error` en inglés y un `message`; los textos que ve la persona los pone la app en español, sin
opinar sobre la salud del niño (Principio I).

## Compatibilidad

- Una app anterior ignora los campos nuevos (`role`, `plan`, `readOnly`, `family`, `takenBy`).
- Para quien no comparte nada, las respuestas son las de siempre más esos campos con `role: "owner"`.
- Rutas de `/family` nuevas con su fila cada una en `routes()` de `router_test.go`, **por rol**.
