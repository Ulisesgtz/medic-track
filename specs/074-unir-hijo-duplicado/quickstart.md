# Quickstart — validar la spec 074

## Requisitos

Migración `0040_child_merge_and_hide.sql` aplicada (local y, antes del merge, DEV). API en `:8080`, frontend en `:5173`.

## 1. API

1. Ana (plan de pago) con «Mateo» y una consulta; Laura (gratuita) con «Mateo» (2 consultas con tomas marcadas, 9
   vacunas, 1 medida, ficha con 1 alergia) y «Sofía». Ana invita a Laura como Tutora; Laura acepta.
2. `GET /family/merge-options` → `canMerge: true`, `suggestedPairs` con los dos Mateo, ninguna para Sofía.
3. `POST /family/merges/preview` con la pareja → `differences` y `moves` correctos.
4. `POST /family/merges` sin una elección que difiere → `failed` `choices_missing`, nada cambió.
5. Con todas las elecciones → `merged`. Revisar: el Mateo de Laura ya no existe; el de Ana tiene 3 consultas, las
   marcas siguen «por Laura», 9 vacunas, la ficha con la alergia; `child_merges` tiene una fila con números.
6. Como Cuidador → `canMerge: false`; `POST /family/merges` → `merge_not_allowed`.
7. `PUT /accounts/{laura}/hidden-children` con Sofía → `GET /accounts/me` sin Sofía y con `hiddenChildren`; ninguna
   toma de Sofía avisa a Laura; Laura sale de la familia → Sofía visible otra vez.
8. `SELECT message, endpoint FROM error_logs ORDER BY created_at DESC LIMIT 20` sin nombres ni ids de hijo.

## 2. App

Aceptar la invitación → «¿Cómo quieres seguir?» → Unir → parejas → datos distintos → resumen (descargar) → Unir →
inicio con un solo Mateo y la línea «Se unió…» en su detalle. Otra cuenta: «Usar solo lo de la familia» → inicio sin
sus hijos → «Mi cuenta» → «Volver a mostrar».

## 3. Pruebas

```bash
cd backend && go test ./... -cover
```

```bash
cd frontend && npx vitest run --coverage
```

```bash
scripts/e2e-local.sh e2e/unir-hijos.spec.ts
```
