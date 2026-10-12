# Contrato del correo de invitación

Un correo por invitación creada y por reenvío (dentro de los límites). Español de México, tono neutro, sin imperativos médicos (Principio I). Texto plano **y** HTML mínimo en el mismo mensaje.

## Datos que el proveedor recibe (Principio II)

| Dato | De dónde |
|---|---|
| Destinatario | el correo de la invitación (ya lo conoce la dueña; el proveedor lo necesita para entregar) |
| Nombre de pila de quien invita | cuenta que invita; limpiado y de máximo 40 caracteres |
| Rol (Tutor / Cuidador) y lo que podrá hacer | constantes fijas |
| Fecha de vencimiento | `expires_at` en hora de Ciudad de México |
| La liga | `FRONTEND_ORIGIN` + `/familia/invitacion#` + ficha |

**Nunca**: nombres, edades o datos de salud de los hijos; cuántos hijos hay; apellido o correo de quien invita; el plan; ids.

## Asunto

`<Nombre> te invitó a PediTrack`

## Texto plano

```text
<Nombre> te invita a PediTrack como <Tutor|Cuidador>.

Como <Tutor|Cuidador> podrás <ROLE_CAN>

Para aceptar, abre esta liga con la cuenta que usa este correo:
<liga>

La liga vence el <13 de octubre de 2026>.

Si no esperabas esta invitación, puedes ignorar este mensaje: no pasa nada y nadie tendrá acceso.

PediTrack
```

`ROLE_CAN` (mismas frases que `frontend/src/features/family/roles.ts`):

- Tutor: «ver consultas, medicamentos y tomas, marcar tomas, agregar consultas e invitar a otras personas.»
- Cuidador: «ver consultas, medicamentos y tomas, y marcar tomas.»

## HTML

Mismo contenido en `<p>`; el único enlace es `<a href="<liga>">Aceptar invitación</a>` (y la liga en texto debajo por si el cliente no muestra enlaces). Sin imágenes, hojas de estilo externas, píxeles ni `<script>`. El nombre va escapado (`html.EscapeString`).

## Reglas comprobables

1. El `href` es **exactamente** la liga; ninguna otra URL aparece en el mensaje.
2. La petición al proveedor no lleva campos de seguimiento (el seguimiento es del dominio y está apagado, [research R6](../research.md)).
3. Una prueba de privacidad recorre el texto y el HTML buscando nombres de hijos sembrados, el apellido y el correo de quien invita: ninguno aparece.
4. Un nombre con saltos de línea, `<script>`, o forma de correo/ficha sale limpio.
5. Clave de idempotencia: `family-invitation-<id>-<n.º de envío del día>`.

## Petición al proveedor

La de la spec 039 (`specs/039-digest-semanal-errores/contracts/resend-request.md`), con `html` además de `text` cuando el mensaje lo trae. Mismas reglas de respuesta: 2xx y 409 de idempotencia = éxito; red, 408, 429 y 5xx = reintentable; otro 4xx = definitivo.
