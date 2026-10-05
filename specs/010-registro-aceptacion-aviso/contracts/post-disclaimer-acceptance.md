# Contrato: `POST /accounts/{accountId}/disclaimer-acceptance`

Requiere `Authorization: Bearer <token de sesión de Clerk>` y que la sesión sea dueña de `accountId`.

**Petición**

```json
{ "version": "2026-09-26" }
```

**200** — registrado (o ya estaba registrado: se devuelve el registro original)

```json
{ "version": "2026-09-26", "acceptedAt": "2026-09-26T18:04:05Z" }
```

**400** — falta `version`, JSON mal formado, o la versión no es la vigente (`error: validation_error`, `details[].field = "version"`)
**401** — sin sesión válida · **403** — la sesión no es dueña de la cuenta · **404** — `accountId` mal formado o inexistente

**Respuestas de cuenta** (`GET /accounts/me`, `GET /accounts/{id}`, `POST /accounts`, `POST /accounts/{id}/children`) agregan:

```json
{ "disclaimerVersion": "2026-09-26", "disclaimerAccepted": false }
```
