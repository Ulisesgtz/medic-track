# Contrato: Catálogo de País/Estado (solo lectura)

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Usado para poblar los selectores de País y Estado del formulario (decisión de la sesión de aclaración: catálogo, no texto libre).

## `GET /catalog/countries`

### 200 OK

```json
[
  { "code": "MX", "name": "México" },
  { "code": "US", "name": "Estados Unidos" }
]
```

## `GET /catalog/countries/{countryCode}/states`

Devuelve los estados/provincias del país indicado. Si el país no tiene subdivisiones en el catálogo, devuelve un arreglo vacío (el campo Estado queda deshabilitado u oculto en el frontend en ese caso).

### 200 OK

```json
[
  { "code": "MX-JAL", "name": "Jalisco" },
  { "code": "MX-CMX", "name": "Ciudad de México" }
]
```

### 404 Not Found

Si `countryCode` no existe en el catálogo.
