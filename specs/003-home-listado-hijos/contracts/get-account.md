# Contrato: `GET /accounts/{accountId}`

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Obtiene una cuenta y sus hijos, para poblar la home page (FR-001).

## Request

Sin cuerpo. `accountId` es un UUID en la ruta.

## Responses

### 200 OK

Mismo cuerpo que la respuesta `201` de `POST /accounts` (contracts/post-accounts.md de feature 001):

```json
{
  "id": "uuid",
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "countryCode": "string | null",
  "stateCode": "string | null",
  "plan": "free",
  "children": [
    {
      "id": "uuid",
      "firstName": "string",
      "lastName": "string",
      "birthDate": "string",
      "height": "number | null",
      "weight": "number | null"
    }
  ]
}
```

### 404 Not Found

Cuando `accountId` no corresponde a ninguna cuenta existente (Caso Límite de spec.md: id guardado localmente pero ya no válido del lado del servidor).

```json
{
  "error": "account_not_found",
  "message": "Account not found"
}
```

## Notas de contrato

- Sin autenticación — cualquiera con el UUID correcto puede leer esta cuenta (ver nota de Privacidad en plan.md). No expone ningún dato médico, solo lo mismo que ya devuelve `POST /accounts`.
- El frontend DEBE tratar un `404` exactamente igual que "no hay ninguna cuenta guardada localmente" (FR-002) — limpiando el `accountId` guardado.
