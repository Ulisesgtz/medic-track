# Contrato: `POST /accounts`

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Crea una cuenta de padre/tutor, opcionalmente junto con uno o más hijos.

## Request

```json
{
  "firstName": "string (requerido)",
  "lastName": "string (requerido)",
  "email": "string (requerido, formato email)",
  "countryCode": "string (opcional)",
  "stateCode": "string (opcional)",
  "children": [
    {
      "firstName": "string (requerido)",
      "lastName": "string (requerido)",
      "birthDate": "string ISO-8601 date (requerido, no futura)",
      "height": "number (opcional, positivo)",
      "weight": "number (opcional, positivo)"
    }
  ]
}
```

`children` puede ser un arreglo vacío o ausente (FR-003 permite crear cuenta sin hijos).

## Responses

### 201 Created

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

### 400 Bad Request — validación de campos

Cuando faltan campos obligatorios, el correo tiene formato inválido, o la fecha de nacimiento de un hijo es futura.

```json
{
  "error": "validation_error",
  "details": [
    { "field": "email", "message": "invalid email format" }
  ]
}
```

### 409 Conflict — correo duplicado

```json
{
  "error": "email_already_exists",
  "message": "Email is already in use"
}
```

### 422 Unprocessable Entity — límite freemium excedido

Cuando `children.length > 1` y la cuenta (nueva, por lo tanto sin plan de pago) intenta persistirse. La respuesta permite al frontend mostrar el banner descrito en FR-007 sin perder los datos ya enviados por el usuario (el frontend no limpia su estado local al recibir este error).

```json
{
  "error": "freemium_child_limit_exceeded",
  "message": "The free plan includes only one child per account",
  "limit": 1,
  "received": 2
}
```

## Notas de contrato

- Este endpoint NO acepta `password` ni ningún campo de autenticación (FR-009 — fuera de alcance).
- Este endpoint es la única forma de crear Children en esta fase; no existen `PATCH /accounts/{id}/children/{id}` ni `DELETE` en este alcance (FR-006a) — se agregarán en una tarea futura, limitados a `height`/`weight`.
- La validación del límite freemium (422) DEBE ejecutarse en el servidor independientemente de lo que el frontend ya haya validado (ver research.md — doble validación).
- Nombres de campo en `camelCase` en el JSON (convención estándar de API REST en inglés); en la base de datos (ver data-model.md) se usa `snake_case`, también en inglés.
