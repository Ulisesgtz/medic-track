# Quickstart: validar finalizar tratamiento

Requiere aplicar la migración `0013`.

1. Consulta con un medicamento cada 8 h por 3 días (9 tomas). En el detalle: botón "Finalizar tratamiento".
2. Marcar 2 tomas y tocar el botón: diálogo con el texto neutral; "Cancelar" no cambia nada.
3. Confirmar: "Terminado el <fecha> · 2 de N tomas"; las tomas futuras quedan canceladas (no se pueden marcar); las que ya
   llegaron siguen pudiéndose marcar; el botón ya no aparece; la barra usa las no canceladas.
4. Detalle del hijo: el medicamento ya no cuenta como tratamiento activo; "Tomas de hoy" no incluye las canceladas.
5. Recordatorios: ninguna toma cancelada se avisa.
6. Otra cuenta que llame al endpoint recibe 403; llamarlo dos veces devuelve 200 con la misma `endedAt`.

```bash
cd backend && go test ./internal/... -cover
cd frontend && npx vitest run --coverage && npx playwright test e2e/finalizar-tratamiento.spec.ts
```
