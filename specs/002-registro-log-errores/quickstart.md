# Guía de Validación Rápida: Registro de Log de Errores del Backend

## Prerrequisitos

- Backend corriendo localmente con `DATABASE_URL` apuntando a Postgres (ver `backend/CLAUDE.md`).
- Migración `0005_create_error_logs_table.sql` aplicada.

## Escenario 1 — Un error de validación queda registrado sin cuenta asociada

1. Sin ninguna cuenta creada aún, envía `POST /accounts` con el campo `email` vacío (dispara un 400 `validation_error`).
2. Verifica en `error_logs` (consulta SQL directa — no hay endpoint de lectura en este alcance) que se creó una fila nueva con:
   - `http_status = 400`
   - `endpoint = '/accounts'`
   - `account_id IS NULL`
   - `file` y `line` apuntando al punto real del código donde se construyó ese error de validación

## Escenario 2 — Un error del catálogo queda registrado con su propio archivo/línea

1. Envía `GET /catalog/countries/XX/states` con un código de país que no existe en el catálogo (dispara un 404 `country_not_found`).
2. Verifica en `error_logs` una fila nueva con `http_status = 404`, `endpoint = '/catalog/countries/{countryCode}/states'`, y `file`/`line` distintos de los del Escenario 1 (confirma que la captura de origen es específica a cada punto de error, no un valor fijo).

## Escenario 3 — Una falla al registrar el log no rompe la respuesta al cliente

1. (Prueba de robustez, no un flujo de usuario real) Con la base de datos de `error_logs` temporalmente inaccesible o el pool de conexiones agotado, provoca cualquier error del API (p. ej. el Escenario 1).
2. Verifica que el cliente sigue recibiendo la respuesta de error HTTP normal (mismo código y cuerpo de siempre) sin demora perceptible ni error adicional — el registro fallido no debe manifestarse hacia el cliente en absoluto (FR-005).

## Escenario 4 — El log nunca contiene el correo electrónico del usuario

1. Provoca un error de correo duplicado: crea una cuenta exitosamente, luego intenta crear otra con el mismo `email` (dispara un 409 `email_already_exists`).
2. Verifica en `error_logs` que la fila creada para ese evento tiene `account_id` con el UUID de la cuenta ya existente (o `NULL`, según el punto exacto donde se originó el error), y que ningún campo de la fila contiene el string del correo electrónico usado.
