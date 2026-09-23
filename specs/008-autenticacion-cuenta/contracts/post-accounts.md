# Contrato: cambios a `POST /accounts` (specs/001-registro-cuenta-usuario)

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Este contrato documenta solo lo que **cambia** respecto a `specs/001-registro-cuenta-usuario/contracts/
post-accounts.md` — todo lo que no se menciona aquí (validaciones de nombre, país/estado, límite freemium,
hijos) se queda exactamente igual.

## Qué cambia

1. **Requiere sesión de Clerk.** Antes de llamar a este endpoint, el cliente ya completó un alta en Clerk
   (correo+contraseña o Google — research.md, punto 1), que produce un token de sesión válido:

   ```http
   POST /accounts
   Authorization: Bearer <token de sesión de Clerk>
   Content-Type: application/json
   ```

   Sin este header (o con un token inválido/expirado), responde `401` antes de tocar el body — mismo caso que
   `get-accounts-me.md`.

2. **`email` desaparece del cuerpo de la petición.** El backend ya no lo lee del JSON — toma el correo
   verificado del perfil de Clerk asociado al token (research.md, punto 2/6). Si el cliente lo manda de todos
   modos, se ignora.

   ```json
   {
     "firstName": "Ana",
     "lastName": "Gómez",
     "countryCode": "MX",
     "stateCode": "MX-JAL",
     "children": [ { "...": "..." } ]
   }
   ```

3. **`clerk_user_id` se llena del token, nunca del body.** No es un campo que el cliente pueda mandar ni
   sobreescribir.

4. **Doble envío es idempotente.** Si la sesión ya tiene una `Account` vinculada (`clerk_user_id` ya usado),
   el endpoint responde `200` con esa cuenta existente en vez de crear una duplicada o fallar (research.md,
   punto 6) — útil para un reintento de red tras un `201` que no llegó al cliente.

   ```json
   // 200 OK — misma forma que el 201 original, cuenta ya existente
   ```

## Lo que NO cambia

- `password` sigue sin existir en este contrato — ya no se mandaba desde spec 007 y sigue sin mandarse (ahora
  Clerk sí la usa, pero en su propio flujo, nunca en este endpoint).
- La validación de campos (nombre, fecha de nacimiento de hijos, límite freemium de 1 hijo, `409
  email_already_exists` si el correo — ahora el de Clerk — ya tiene cuenta) se queda igual.
- El cuerpo de la respuesta `201`/`200` (`accountResponse`) no cambia de forma, solo de cuándo es `200` en vez
  de `201` (punto 4 arriba).
