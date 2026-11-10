# Quickstart: Editar los datos del hijo (spec 064)

## Prerrequisitos

- Postgres local con las migraciones hasta la `0035` (`backend/migrations/0035_child_corrections.sql`).
- `DATABASE_URL=postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable`.
- Backend y frontend corriendo (`.claude/launch.json`). La E2E necesita las llaves de Clerk, así que la corre el CI.

## Pruebas

```bash
cd backend && go test ./... -cover
```

```bash
cd backend && DATABASE_URL="$DATABASE_URL&pool_max_conns=4" go test ./internal/childprofile/... ./internal/growth/... ./internal/vaccination/... -cover
```

```bash
cd frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4
```

```bash
cd frontend && npx playwright test e2e/editar-hijo.spec.ts --list
```

## Escenarios a validar (ver [contracts/api.md](contracts/api.md))

1. **Talla y peso, plan gratuito**:
   - Desde el detalle del hijo, «Lo demás» → «Editar datos». Corregir el peso, vaciar la talla y guardar.
   - El detalle muestra los valores y «Corregido el … por …».
2. **Casilla**: cambiar el peso, marcar «Anotarlo también como medida de hoy» y guardar. En «Crecimiento» aparece la medida de hoy.
   - Con 250 kg: error de la spec 063 y nada guardado.
3. **Identidad, plan gratuito**:
   - El nombre, el apellido y la fecha aparecen deshabilitados con «Plan completo», que abre el aviso del plan.
   - Un `PUT` directo con otro nombre responde 422 `child_identity` y no cambia nada (tampoco el peso).
4. **Identidad, plan completo**: corregir el nombre y la fecha. Se ven en el inicio, la barra lateral web y el detalle, y las edades de Crecimiento cambian.
5. **Conflicto**: con una medida del 2022-03-03, poner la fecha de nacimiento 2022-04-01. Responde 409 con la fecha de esa medida y el aviso la muestra.
6. **Sin cambios**: guardar sin tocar nada no cambia «Corregido el …».
7. **Acceso**: un Cuidador no ve la fila y un `PUT` responde 403. El teléfono del hijo no tiene la ruta.
8. **Concurrencia** (prueba de Go): editar la fecha y anotar una medida anterior a la vez. Nunca queda una medida antes del nacimiento.
