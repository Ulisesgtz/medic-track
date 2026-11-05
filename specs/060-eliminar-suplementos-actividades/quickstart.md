# Quickstart: Eliminar suplementos y actividades

## Pruebas automáticas

```bash
cd backend && DATABASE_URL="postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable" go test ./internal/supplement/ ./internal/server/ -cover
cd backend && DATABASE_URL="postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable&pool_max_conns=4" go test ./...
cd frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4
```

E2E `frontend/e2e/eliminar-suplementos.spec.ts` (Chromium, 390 y 1280 px) en el CI.

## A mano (DEV o local)

1. Crear un suplemento para un hijo sin marcar nada → en su detalle aparece «Eliminar suplemento».
2. Tocarlo → diálogo neutral → «Eliminar» → vuelve al hijo; el suplemento ya no está en la lista, en «Hoy» ni en el inicio.
3. Crear otro, marcar una toma → no aparece «Eliminar»; desmarcarla → vuelve a aparecer.
4. Con dos pestañas: abrir el diálogo en una, marcar en la otra, confirmar → «ya tiene tomas marcadas… Puedes finalizarlo.»
5. Entrar como Cuidador → no hay botón; `DELETE` directo → 403.
6. Una actividad personal en `/yo` → al eliminar vuelve a `/yo#actividades`.
7. Cuenta en plan gratuito con un suplemento sin marcas → se elimina igual.
