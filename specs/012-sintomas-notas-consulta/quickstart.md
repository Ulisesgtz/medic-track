# Quickstart: validar síntomas seleccionables y notas previas

Guía para comprobar la funcionalidad de punta a punta. Contratos en [contracts/symptoms-api.md](./contracts/symptoms-api.md),
tablas en [data-model.md](./data-model.md).

## Prerrequisitos

- Postgres local con las migraciones `0001`…`0012` aplicadas en orden (`backend/migrations/`).
- Backend: `cd backend && go run ./cmd/api` con `backend/.env.local` (`DATABASE_URL`, `CLERK_SECRET_KEY`, …).
- Frontend: `cd frontend && npm run dev`.

## 1. Catálogo

```bash
curl -s http://localhost:8080/catalog/symptoms
```

Esperado: 23 síntomas, empezando por `fever` / "Fiebre" / "General" y terminando en `sleeping_more`.

## 2. Registrar una consulta con síntomas (móvil 390 px y web 1280 px)

1. Iniciar sesión, abrir un hijo → "Nueva consulta".
2. Después del grupo "Leído de tu receta" aparece "¿Qué síntomas tuvo?" con las 6 categorías en orden y sus chips.
3. Tocar "Fiebre" y "Tos": quedan resaltados con palomita; tocar "Tos" otra vez: se apaga.
4. En "Notas previas a la consulta" se ve el ejemplo "Qué comió antes, cómo se sentía…"; escribir una nota.
5. Llenar foto, doctor, fecha y un medicamento; guardar.
6. Detalle: la sección de síntomas muestra "Fiebre"; debajo, la nota bajo "Notas previas a la consulta".
7. Volver al hijo: la tarjeta dice "Fiebre · 1 medicamento".

## 3. Consulta anterior

Una consulta creada antes de la migración muestra su texto viejo bajo "Notas previas a la consulta", sin síntomas, y en el
listado sigue mostrando el inicio de ese texto.

## 4. Retirar un síntoma sin publicar la app

```sql
UPDATE symptoms SET active = false WHERE code = 'chills';
```

Recargar "Nueva consulta": "Escalofríos" ya no aparece. Una consulta que lo tenía lo sigue mostrando. Enviar a mano un
`POST` con `"symptomCodes": ["chills"]` → `400` con `symptom_not_available` y la consulta no se crea.
Revertir con `UPDATE symptoms SET active = true WHERE code = 'chills';`.

## 5. La base protege la relación

```sql
-- Debe fallar por la llave (child_id, account_id) → children:
INSERT INTO consultation_symptoms (consultation_id, child_id, account_id, symptom_code)
SELECT c.id, c.child_id, gen_random_uuid(), 'fever' FROM consultations c LIMIT 1;
```

## 6. Pruebas

```bash
cd backend && go test ./... -cover
cd frontend && npx vitest run --coverage
cd frontend && npx playwright test e2e/detalle-consulta-hijo.spec.ts e2e/nueva-consulta-movil.spec.ts e2e/nueva-consulta-web.spec.ts
```
