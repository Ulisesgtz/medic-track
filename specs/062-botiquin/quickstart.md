# Quickstart: Botiquín de la casa

## Antes

Aplicar `backend/migrations/0033_medicine_cabinet.sql` en la base local (y en DEV antes del merge).

## Pruebas automáticas

```bash
cd backend && DATABASE_URL="postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable" go test ./internal/cabinet/ ./internal/server/ -cover
cd backend && DATABASE_URL="postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable&pool_max_conns=4" go test ./...
cd frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4
```

E2E `frontend/e2e/botiquin.spec.ts` (Chromium, 390 y 1280 px) en el CI.

## A mano

1. Dueña de pago: Inicio → «Checa tus medicamentos» → vacío → «+ Agregar al botiquín» → capturar a mano → aparece en la lista, en orden alfabético, con «Caduca: mar 2027» sin colores.
2. Elegir una foto de una caja → «Leyendo la foto…» → campos propuestos «Leído de tu foto» → corregir → guardar → el detalle abre la foto en el visor.
3. Buscador «paracet» → «2 de 7 medicamentos»; «xyz» → «Ningún medicamento del botiquín se llama «xyz».».
4. Editar la cantidad; quitar con la confirmación neutral.
5. Detalle de una consulta → «Agregar al botiquín» en un medicamento → el formulario con el nombre y «Desde la consulta del …».
6. Un Tutor de la familia ve y agrega; un Cuidador ve con «Vista de Cuidadora» y sin botones (el API responde 403 a un `POST`).
7. Plan gratuito: la fila del inicio con «Plan completo» abre el aviso; con medicamentos de antes, se ven, se editan y se quitan.
