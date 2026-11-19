# Quickstart — validar la spec 075

## Requisitos

Migración `0041_activity_types.sql` aplicada (local y, antes del merge, DEV). API en `:8080`, frontend en `:5173`.

## 1. API

1. `GET /catalog/activity-types` → seis tipos en orden, todos `active: true`.
2. Antes de la migración, una actividad «Tomar agua»; después: `GET /routines/{id}` → `activityType: "habits"`; un
   suplemento → `activityType: null`.
3. `POST /children/{id}/routines` con `kind: "activity"` sin `activityType` → 400 campo `activityType`; con `"sports"` →
   201. Con `kind: "supplement"` y `activityType` → 400.
4. `PATCH /routines/{id}` sin `activityType` → conserva el tipo.
5. Cuenta con plan vencido: `PUT /routines/{id}/activity-type` `{ "activityType": "arts" }` → 200; las tomas y marcas
   de la rutina son las mismas antes y después. En una actividad finalizada → 200. Como Cuidador → sin permiso.
6. `UPDATE activity_types SET active = false WHERE code = 'arts'` → el catálogo lo trae `active: false`; crear con
   `"arts"` → 400; la actividad que ya lo tenía lo conserva.

## 2. App

Detalle del hijo con actividades de tres tipos → tres segmentos en orden, sin vacíos (390 y 1280 px). Crear una
actividad sin tipo → no guarda. Detalle de una actividad → «Tipo · Cambiar» → otro tipo → la actividad aparece en el
otro segmento. `/yo` igual. «Hoy» del hijo, el inicio y el teléfono del hijo sin cambios.

## 3. Pruebas

```bash
cd backend && go test ./... -cover
```

```bash
cd frontend && npx vitest run --coverage
```

```bash
scripts/e2e-local.sh e2e/tipos-de-actividad.spec.ts
```
