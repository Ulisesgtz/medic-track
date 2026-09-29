# Quickstart: validar la barra de progreso

Sin migraciones ni endpoints nuevos.

1. Registrar una consulta con un medicamento cada 8 h por 3 días (9 tomas), primera toma 08:00.
2. Detalle (390 y 1280 px): sobre las tomas, "0 / 9 tomas" y la barra vacía.
3. Marcar 3 tomas: "3 / 9 tomas" y la barra a un tercio, sin recargar. Desmarcar una: baja a "2 / 9".
4. Con una consulta de ayer (tomas sin registrar): "N / 9 tomas · M sin registrar"; la barra no cuenta las sin registrar.
5. Lector de pantalla: la barra anuncia "3 de 9 tomas registradas".

```bash
cd frontend && npx vitest run --coverage
cd frontend && npx playwright test e2e/detalle-consulta-movil.spec.ts e2e/detalle-consulta-web.spec.ts e2e/detalle-consulta-hijo.spec.ts
```
