# Guía de validación: Recorrer el tratamiento

**Requisitos**: backend (con la migración `0014` aplicada a la BD local) y frontend corriendo; una consulta con fecha de
hace 2 días y un medicamento cada 8 h por 3 días, sin marcar ninguna toma (hay tomas sin registrar).

## 1. Automatizado
```bash
cd backend && set -a && . ./.env.local && set +a && psql "$DATABASE_URL" -f migrations/0014_create_medication_extensions.sql
go vet ./... && go test ./... -cover
cd ../frontend && npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage
npx playwright test e2e/recorrer-tratamiento.spec.ts e2e/calendario-tratamiento.spec.ts
```

## 2. A mano (390 y 1280 px)
1. En el detalle de la consulta, la tarjeta tiene «Recorrer tratamiento» (y «Finalizar tratamiento»), sin lenguaje que lo
   recomiende.
2. Tócalo: el diálogo propone el número de tomas sin registrar; «Cancelar» tiene el foco; Escape y el fondo lo cierran.
3. Cambia el número: aparece la nota de «ingresado manualmente» y «Quedaría hasta el…» se actualiza; con 0, 61 o texto,
   «Sí, recorrer» se deshabilita.
4. Confirma con el número propuesto: la tarjeta dice «Se recorrió el … · +N tomas»; el botón desaparece; «termina el…»
   y el calendario llevan el fin a la nueva fecha; las tomas sin registrar siguen sin registrar.
5. Repite en otra consulta con un número distinto: la tarjeta agrega «número ingresado manualmente».
6. En el calendario: cada medicamento marca solo los días con tomas; el primero y el último día son círculos rellenos del
   color y el nombre del día dice «inicio de» / «fin de».
7. Finaliza el medicamento: «Recorrer» desaparece y el fin del calendario es su último día con tomas no canceladas.
8. Dos pestañas: recorre en una, y en la otra confirma: recibe «ya estaba hecho» y refresca, sin duplicar tomas.

## 3. Registro
```sql
SELECT medication_id, account_id, proposed_doses, added_doses, created_at FROM medication_extensions ORDER BY created_at;
```
Una fila por recorrido, con `added_doses <> proposed_doses` cuando el número fue manual.

## 4. Diseño
Capturas del botón, el diálogo (con y sin la nota), la línea de la tarjeta y el calendario con inicio y fin en 390 y 1280
px; se muestran al usuario para aprobarlas.
