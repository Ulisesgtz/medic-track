# Quickstart — validar la spec 073

## Requisitos

Migración `0039_child_records.sql` aplicada (local y, antes del merge, DEV). API en `:8080`, frontend en `:5173`.

## 1. API (con una sesión de prueba)

1. `GET /children/{id}/record` de un hijo sin ficha → `exists: false`, `version: 0`.
2. `PUT` con `expectedVersion: 0`, dos alergias, `O+`, un padecimiento y el pediatra → 200, `version: 1`,
   `updated.by` = nombre de pila.
3. El mismo `PUT` otra vez con `expectedVersion: 1` y sin cambios → 200, sigue `version: 1`.
4. `PUT` con `expectedVersion: 0` → 409 `record_conflict` con `current`.
5. 31 alergias → 400 con `allergies` en `details`, sin el texto.
6. Un Cuidador: `GET` 200 con `canEdit: false`; `PUT` 403. El teléfono del hijo: no hay ruta.
7. `SELECT message FROM error_logs ORDER BY created_at DESC LIMIT 20` no contiene ningún texto de la ficha.

## 2. App

Detalle del hijo → «Ficha» vacía → «Editar ficha» → llenar → Guardar → se ve tal cual con «Actualizada el … por Ana»;
«Llamar» abre `tel:`. Con otra sesión (Tutor) editar en paralelo → aviso de conflicto. Exportar a PDF → la portada
trae la ficha. «Mi cuenta» → descargar datos → `ficha*.csv` en el ZIP.

## 3. Pruebas

```bash
cd backend && go test ./... -cover
```

```bash
cd frontend && npx vitest run --coverage
```

```bash
scripts/e2e-local.sh e2e/ficha-del-hijo.spec.ts
```
