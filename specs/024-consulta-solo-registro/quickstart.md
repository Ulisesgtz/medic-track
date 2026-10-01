# Quickstart: validar la consulta solo-registro

## 1. Automatizado
```bash
cd backend && set -a && . ./.env.local && set +a && go vet ./... && go test ./... -cover
cd backend && go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd && git diff --exit-code internal/docs
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx eslint src && npx vitest run --coverage
cd frontend && npx playwright test e2e/consulta-solo-registro.spec.ts e2e/detalle-consulta-hijo.spec.ts
```
Paquetes y frontend con >90 %. El E2E corre a 390 y 1280 px (necesita el backend con la migración `0016`).

## 2. A mano (túnel o `npm run dev`)
1. En un hijo, «Nueva consulta»: pon doctor, una fecha de hace tres meses, la foto y un medicamento («Amoxicilina», 8 h,
   7 días). Marca **«Consulta anterior: guardar solo como registro»**: «Primera toma» desaparece y hay un texto que dice
   que no se crearán horarios ni avisos.
2. Desmarca y vuelve a marcar: lo que habías escrito en «Primera toma» sigue ahí al desmarcar.
3. Guarda marcada: llegas al detalle con la etiqueta **«Solo registro»**, la lista de medicamentos con «Cada 8 horas ·
   7 días», y **sin** calendario, chips, barra de progreso, «Finalizar» ni «Recorrer»; en la web, sin «Tratamiento activo».
4. En el listado del hijo la consulta lleva «Solo registro»; en el home y en el hijo, «Tomas de hoy» no incluye nada de ella.
5. Crea otra consulta **sin** marcar: pide «Primera toma», genera tomas, calendario y recordatorios como siempre.
6. Con un dispositivo con recordatorios activos, la consulta solo-registro no manda ningún aviso.
7. Las consultas anteriores a esta funcionalidad se ven igual y sin etiqueta.
