# Contrato: `POST /accounts/{accountId}/children`

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Agrega un hijo a una cuenta ya existente, desde el modal "Agregar hijo" de la home page (FR-004).
Aplica exactamente las mismas reglas que agregar un hijo durante el registro de cuenta
(contracts/post-accounts.md de feature 001): validación de campos y límite freemium.

## Request

```json
{
  "firstName": "string (requerido)",
  "lastName": "string (requerido)",
  "birthDate": "string ISO-8601 date (requerido, no futura)",
  "height": "number (opcional, positivo)",
  "weight": "number (opcional, positivo)"
}
```

## Responses

### 201 Created

Devuelve la cuenta completa ya actualizada (mismo cuerpo que `GET /accounts/{accountId}`), para que el frontend reemplace su estado local con la respuesta sin tener que hacer una segunda petición.

### 400 Bad Request — validación de campos

Mismo formato que `POST /accounts` (`validation_error`, con `details` por campo — sin prefijo de índice, ya que es un solo hijo).

### 404 Not Found

Si `accountId` no corresponde a ninguna cuenta existente.

```json
{
  "error": "account_not_found",
  "message": "Account not found"
}
```

### 422 Unprocessable Entity — límite freemium excedido

Mismo formato que `POST /accounts` (`freemium_child_limit_exceeded`, con `limit`/`received`) — se dispara si la cuenta activa (plan gratuito) ya tiene 1 hijo y se intenta agregar otro.

```json
{
  "error": "freemium_child_limit_exceeded",
  "message": "The free plan includes only one child per account",
  "limit": 1,
  "received": 2
}
```

## Notas de contrato

- Reutiliza el mismo error `freemium_child_limit_exceeded` que el frontend ya sabe interpretar y mostrar como el pop-up de feature 001 — el modal de esta feature reacciona exactamente igual.
- FR-006a (inmutabilidad de hijos ya persistidos, feature 001) sigue aplicando sin cambios: este endpoint solo permite **crear**, nunca editar ni eliminar un hijo existente.
