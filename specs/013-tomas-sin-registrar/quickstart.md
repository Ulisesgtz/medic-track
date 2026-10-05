# Quickstart: validar tomas "sin registrar"

Estado en [data-model.md](./data-model.md), contrato en [contracts/dose-status.md](./contracts/dose-status.md).

## Prerrequisitos

Backend (`go run ./cmd/api` con `backend/.env.local`) y frontend (`npm run dev`) corriendo; sin migraciones nuevas.

## 1. Estados en el detalle (390 y 1280 px)

1. Registrar una consulta con **fecha de ayer**, un medicamento cada 8 h por 2 días, primera toma 08:00.
2. Detalle: las tomas de ayer se ven con borde punteado y "sin registrar"; en hoy, las que ya pasaron y cuya siguiente
   no llega están en ámbar (por marcar) y las futuras en gris.
3. Tocar una "sin registrar": queda verde (tomada). Tocarla otra vez: vuelve a "sin registrar".

## 2. Cambio automático

Con la consulta abierta, esperar a que llegue la hora de la siguiente toma de una en ámbar: en menos de un minuto pasa
sola a "sin registrar", sin recargar.

## 3. Resúmenes del día

- Móvil, detalle del hijo: "N sin marcar · M sin registrar · …"; "Marcar tomas" no cambia las sin registrar. Si solo
  quedan sin registrar: "Sin tomas pendientes" con "M sin registrar" y sin botón.
- Web: la tarjeta "Tomas de hoy" dice "sin marcar · M sin registrar"; en el panel, las sin registrar dicen "Sin
  registrar".
- Home (móvil): "N tomas hoy" no cuenta las sin registrar.

## 4. Recordatorios

```sql
-- Ninguna toma con scheduled_at + frequency_hours <= now() se reclama:
SELECT count(*) FROM doses d JOIN medications m ON m.id = d.medication_id
WHERE d.reminder_sent_at >= now() - interval '1 hour'
  AND d.reminder_sent_at >= d.scheduled_at + make_interval(hours => m.frequency_hours);  -- esperado: 0
```

## 5. Pruebas

```bash
cd backend && go test ./internal/... -cover
cd frontend && npx vitest run --coverage
cd frontend && npx playwright test e2e/detalle-consulta-hijo.spec.ts e2e/detalle-consulta-movil.spec.ts e2e/detalle-consulta-web.spec.ts e2e/detalle-hijo-movil.spec.ts
```
