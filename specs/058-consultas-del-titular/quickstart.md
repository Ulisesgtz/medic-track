# Quickstart: Consultas del titular

Guía para validar la spec 058 de punta a punta. Contratos en [contracts/api.md](contracts/api.md), modelo en
[data-model.md](data-model.md).

## Preparación

1. Aplicar la migración en la base local (y **en DEV antes del merge**):
   `psql "$DATABASE_URL" -f backend/migrations/0032_own_consultations.sql`
2. Comprobar el relleno: `SELECT count(*) FROM consultations WHERE account_id IS NULL;` → `0`.
3. Levantar el backend y el frontend (`.claude/launch.json`).
4. Cuentas de prueba: Ana (dueña de una familia de pago), Luis (Tutor de esa familia), Rosa (Cuidadora de esa familia), Pepe
   (cuenta gratuita sin familia).

## Escenarios

| # | Pasos | Resultado esperado |
|---|---|---|
| 1 | Ana abre `/mi-dia` | Llega a `/yo`: «Hoy», el índice Consultas · Suplementos · Actividades y «Nueva consulta»; sin cartilla ni «Acceso del hijo» |
| 2 | Ana crea una consulta propia con un medicamento cada 8 h que empieza en 2 min | Aparece en su lista y en «Hoy»; «Tu día» del inicio la cuenta; ningún hijo la muestra |
| 3 | Con un dispositivo activado, esperar la toma | Llega un aviso sin el nombre de Ana; «Tomada» la marca «por Ana» |
| 4 | Luis busca el perfil de Ana (interruptor apagado) | No aparece; `GET /consultations/{id}` de Ana → 403 (lo mismo que algo que no existe) |
| 5 | Ana enciende «Compartir mis consultas con los Tutores de mi familia» | Luis ve «Ana» en su inicio; entra, ve sus consultas y marca una toma («por Luis»); no ve «Nueva consulta», «Editar», «Finalizar», «Recorrer» ni «Exportar a PDF»; no ve sus suplementos ni actividades |
| 6 | Luis activa «Tus avisos» en la consulta de Ana | Recibe el aviso de la siguiente toma con el nombre «Ana» |
| 7 | Rosa (Cuidadora) busca las consultas de Ana | Nada; 403 |
| 8 | Ana apaga el interruptor | La siguiente petición de Luis es 403; no recibe más avisos; la toma marcada sigue «por Luis» |
| 9 | Ana busca «amoxicilina» en su historial y exporta un PDF con fotos | Solo consultas propias; el PDF sin cartilla ni datos de hijos |
| 10 | Pepe abre `/yo` y toca «Nueva consulta» | Ve el aviso del plan completo, sin formulario; `POST /accounts/{id}/consultations` → 422 `own_consultations` |
| 11 | Ana con el plan vencido (SQL `plan = 'free'`) | Ve, marca, edita y finaliza; «Nueva consulta» y «Recorrer» piden el plan; los avisos siguen |
| 12 | Con el teléfono de un hijo de Ana | `/hijo/hoy` no muestra nada de Ana |

## Pruebas automáticas

```bash
cd backend && go test ./... -cover
```

```bash
cd backend && DATABASE_URL="$DATABASE_URL&pool_max_conns=4" go test ./internal/consultation/... ./internal/access/... ./internal/reminder/...
```

```bash
cd frontend && npx vitest run --coverage
```

```bash
cd frontend && npx playwright test e2e/consultas-del-titular.spec.ts
```

(La E2E la corre el CI: este equipo no tiene las llaves de Clerk.)
