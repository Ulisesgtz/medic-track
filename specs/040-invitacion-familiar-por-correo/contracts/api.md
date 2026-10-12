# Contrato de API: estado del correo en las invitaciones

No hay endpoints nuevos. Se amplían tres respuestas existentes de la spec 032 (`contracts/family.md`); todas se escriben con `*httpx.Responder` como hoy y Swagger se regenera (`FamilyInvitationResponse`, `CreatedFamilyInvitationResponse`).

## Campos nuevos

| Campo | Tipo | Valores | Notas |
|---|---|---|---|
| `emailStatus` | string | `none` \| `sending` \| `sent` \| `failed` | `none` = no se pidió correo (sin proveedor configurado): la pantalla funciona como antes. |
| `emailStatusAt` | string \| null | instante ISO 8601 | Cuándo cambió el estado; `null` si nunca se pidió. |

Son campos **aditivos**: un cliente que no los lee sigue funcionando.

## `POST /family/invitations` → 201 (`CreatedFamilyInvitationResponse`)

```json
{
  "id": "a1b2c3d4-…", "email": "papa@ejemplo.com", "role": "caregiver", "status": "pending",
  "expiresAt": "2026-10-19T14:00:00Z", "token": "3hF9…",
  "emailStatus": "sending", "emailStatusAt": "2026-10-12T14:00:00Z"
}
```

- `emailStatus` es el **inicial**: `sending` (se encoló), `failed` (un límite por invitación/familia o la cola llena lo impiden; la invitación existe igual) o `none` (sin proveedor). Nunca `sent` en esta respuesta.
- La respuesta **no espera** al proveedor (SC-004). `token` se devuelve como hoy, solo aquí y al reenviar.

## `POST /family/invitations/{id}/resend` → 200 (`CreatedFamilyInvitationResponse`)

Igual que crear: liga nueva (la anterior deja de servir) y `emailStatus` decidido de nuevo (`sending`/`failed`/`none`). Un correo pendiente con la liga vieja **no sale**.

## `GET /family` → 200 (`invitations[]` es `FamilyInvitationResponse`)

Cada invitación pendiente trae `emailStatus` y `emailStatusAt` (solo quien puede hacerlo todo ve la lista, como hoy). Es lo que la pantalla consulta cada 3 s mientras alguna esté `sending`.

## Sin cambios

`DELETE /family/invitations/{id}` (cancelar: no manda correo), preview/accept/decline (la ficha sigue viajando en el cuerpo; aceptar exige el correo verificado de la sesión) y los códigos de error de la spec 032. **Pasarse de un límite o del tope diario nunca es un error de la API**: la invitación se crea o reenvía con `emailStatus: "failed"`.
