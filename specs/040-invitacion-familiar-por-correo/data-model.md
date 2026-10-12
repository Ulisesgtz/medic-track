# Modelo de datos: Invitación a la familia por correo

**Migración**: `backend/migrations/0025_invitation_email_and_mail_quota.sql`

## `family_invitations` (existente, spec 032) — columnas nuevas

| Columna | Tipo | Restricción | Para qué |
|---|---|---|---|
| `email_status` | `text` | `NOT NULL DEFAULT 'none'`, `CHECK (email_status IN ('none','sending','sent','failed'))` | Estado del correo de la invitación (`no pedido`, `enviándose`, `enviado`, `no enviado`). |
| `email_status_at` | `timestamptz` | `NULL` | Cuándo cambió por última vez (`NULL` mientras sea `none` y nunca se pidió). |
| `email_sends_day` | `date` | `NULL` | Día (Ciudad de México) al que corresponde `email_sends_count`. |
| `email_sends_count` | `integer` | `NOT NULL DEFAULT 0`, `CHECK (email_sends_count >= 0)` | Correos pedidos para esta invitación en `email_sends_day`. |

Las filas existentes quedan en `none` / `NULL` / `NULL` / `0`. **No se guarda** el correo del invitado otra vez (ya está en `email`), ni la liga, ni la ficha, ni el texto del mensaje.

Índice: `idx_family_invitations_email_sending ON family_invitations (email_status_at) WHERE email_status = 'sending'` (el barrido de envíos atorados; casi siempre vacío).

### Transiciones del estado del correo

```text
none ──(se pide correo y hay cupo)──▶ sending ──(el proveedor acepta)──▶ sent
  │                                      │
  └─(límite o sin cupo)──▶ failed ◀──────┴─(agota intentos / rechazo / barrido / cierre)
```

- **Crear** o **reenviar** vuelven a decidir el estado: `sending` (se pidió y está dentro de los límites por invitación y por familia), `failed` (se quiso mandar pero un límite lo impide, o la cola está llena), o `none` (no hay despachador: sin clave del proveedor o sin `FRONTEND_ORIGIN`). El cupo diario global se reserva en el trabajador; si ya no hay, el estado pasa a `failed`.
- Pasar a `sent`/`failed` desde el trabajador es **condicional**: `WHERE id = $1 AND token_hash = $2 AND email_status = 'sending'`. Un reenvío cambia `token_hash`, así que un envío viejo no toca la fila.
- Cancelar, aceptar o vencer no cambian `email_status` (el correo ya salió o no): la lista solo muestra pendientes.
- Barrido: `sending` con `email_status_at` de hace más de 3 minutos → `failed`.

### Límites por día (hora de Ciudad de México)

Al crear/reenviar, dentro de la transacción que bloquea la cuenta dueña:

1. Si `email_sends_day` ≠ hoy, el conteo de esta invitación vale 0.
2. Familia hoy = `sum(email_sends_count) WHERE family_account_id = $1 AND email_sends_day = hoy`.
3. Si conteo de la invitación < `INVITATION_EMAIL_PER_INVITATION_PER_DAY` **y** familia hoy < `INVITATION_EMAIL_PER_FAMILY_PER_DAY`: `email_sends_day = hoy`, `email_sends_count = conteo + 1`, `email_status = 'sending'`. Si no: `email_status = 'failed'` sin tocar el conteo.

## `mail_daily_counts` (nueva)

| Columna | Tipo | Restricción | Para qué |
|---|---|---|---|
| `day` | `date` | `PRIMARY KEY` | Día en hora de Ciudad de México. |
| `sent` | `integer` | `NOT NULL DEFAULT 0`, `CHECK (sent >= 0)` | Correos reservados/mandados ese día (digest + invitaciones). |
| `warned` | `boolean` | `NOT NULL DEFAULT false` | Ya se avisó del umbral (80) ese día. |

Sin más columnas: **nunca** direcciones, ligas ni textos (FR-015). Es una fila por día; se puede borrar lo viejo con SQL (≈ 365 filas al año, no necesita purga automática).

Operaciones (todas atómicas, una sentencia cada una):

- **Reservar** `(day, cap)`: `INSERT … (day, sent) VALUES ($1, 1) ON CONFLICT (day) DO UPDATE SET sent = mail_daily_counts.sent + 1 WHERE mail_daily_counts.sent < $2 RETURNING sent` → sin fila = tope.
- **Devolver** `(day)`: `UPDATE … SET sent = sent - 1 WHERE day = $1 AND sent > 0`.
- **Avisar** `(day, umbral)`: `UPDATE … SET warned = true WHERE day = $1 AND NOT warned AND sent >= $2 RETURNING true` → una fila = «tú avisas».

## Entidades en el código (no se guardan)

- **`mailer.Message`**: `From`, `To`, `Subject`, `Text`, `HTML` (nuevo), `IdempotencyKey`.
- **`family.emailJob`** (solo en memoria): `InvitationID`, `TokenHash`, `Message`, `SendNumber`. Contiene la ficha dentro del texto: nunca se registra ni se serializa.
