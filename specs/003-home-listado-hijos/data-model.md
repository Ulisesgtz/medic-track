# Modelo de Datos: Home Page — Listado de Hijos

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), todos los nombres de
> campo/tabla/columna están en inglés. La prosa explicativa se mantiene en español.

## Entidades

Esta funcionalidad **no agrega ninguna entidad ni columna nueva** — reutiliza `Account` y `Child` tal como ya están definidas en `specs/001-registro-cuenta-usuario/data-model.md`. Solo agrega dos formas nuevas de leer/escribir esas mismas entidades (ver `contracts/`).

## Concepto: Sesión local (no es una entidad de base de datos)

| Campo | Tipo | Dónde vive | Notas |
|---|---|---|---|
| `accountId` | string (UUID) | `localStorage` del navegador | Guardado tras un registro exitoso (FR-003); único dato que identifica "qué cuenta ver" en esta home, sin ningún mecanismo de login real (ver Supuestos de spec.md y nota de Privacidad en plan.md) |

**Reglas**:
- Si `accountId` no existe en `localStorage`, o el backend responde `404` para ese id, el frontend lo trata como "sin cuenta" (FR-002) y limpia cualquier valor guardado.
- Nunca se guarda ningún otro dato de la cuenta en `localStorage` (ni nombre, ni correo, ni hijos) — solo el identificador; el resto se obtiene siempre del backend en cada visita.
