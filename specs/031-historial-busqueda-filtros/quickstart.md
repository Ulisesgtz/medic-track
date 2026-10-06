# Guía de validación (Fase 1): Historial con búsqueda y filtros

Cómo comprobar de punta a punta que la función funciona. Detalles de datos y de API en `data-model.md` y
`contracts/history-search.md`.

## Prerrequisitos

- Base local con las 16 migraciones (esta función **no agrega ninguna**), backend y frontend corriendo
  (`go run ./cmd/api` con `CLERK_SECRET_KEY` y `DATABASE_URL`; `npm run dev`). Ver `backend/CLAUDE.md` y `frontend/CLAUDE.md`.
- Dos cuentas de prueba: una **de pago** y una **gratuita**. El plan se pone con SQL (spec 029):
  `UPDATE accounts SET plan = 'paid' WHERE lower(email) = lower('…');` Las E2E lo hacen solas (`setAccountPlan`).
- Un hijo de la cuenta de pago con varias consultas distintas: doctores («Dra. López», «Dr. Iván Robles»), medicamentos
  («Amoxicilina 250 mg», «Paracetamol»), síntomas («Fiebre», «Tos»), fechas en meses distintos, notas con acentos («niño»), y
  una consulta **solo registro**.

## 1. API (plan de pago)

```bash
# Todas las del hijo (cuerpo vacío)
curl -s -X POST "$API/children/$CHILD/consultations/search" -H "Authorization: Bearer $TOKEN" -d '{}'
# Texto sin acentos ni mayúsculas: encuentra «López» y «niño»
curl -s -X POST "$API/children/$CHILD/consultations/search" -H "Authorization: Bearer $TOKEN" -d '{"q":"lopez"}'
# Combinación: rango + síntomas + tipo
curl -s -X POST "$API/children/$CHILD/consultations/search" -H "Authorization: Bearer $TOKEN" \
  -d '{"from":"2026-01-01","to":"2026-06-30","symptomCodes":["fever","cough"],"kind":"treatment"}'
# Las listas de elección
curl -s "$API/children/$CHILD/history-options" -H "Authorization: Bearer $TOKEN"
```

Esperado: cada respuesta trae solo las consultas que cumplen **todo**; `{"from":"2026-07-01","to":"2026-06-01"}` →
`400 validation_error` con `field: "to"`; `{"kind":"x"}` → `400` con `field: "kind"`; `{"symptomCodes":["nope"]}` → `400`
`symptom_not_available`.

## 2. Plan gratuito

Con el token de la cuenta gratuita, las dos llamadas de arriba responden `422`
`{"error":"freemium_consultation_limit_exceeded","reason":"history_search",…}` **sin ninguna consulta**; la lista simple
(`GET /children/$CHILD/consultations`) sigue respondiendo todo.

## 3. Privacidad

Después de buscar `{"q":"diabetes"}`: el registro de operación del backend (consola) muestra solo
`POST …/consultations/search` (sin el texto) y `error_logs` no tiene ninguna fila con él.

## 4. Pantalla (plan de pago), a 390 px y a 1280 px

1. Lista de consultas del hijo → **«Buscar en el historial»** abre el Historial con todas las consultas y su conteo.
2. Escribir «amox»: tras una pausa corta quedan solo las que tienen Amoxicilina; sin parpadeo en blanco.
3. Elegir un doctor, un rango de fechas, marcar «Fiebre» y «Tos», elegir «Solo registro»: cada pastilla de criterio activo
   se puede quitar; «Limpiar todo» vuelve a la lista completa.
4. Abrir una consulta de los resultados y volver (flecha de la app y «atrás» del navegador): los mismos criterios y
   resultados. Recargar la página: también.
5. Una búsqueda sin coincidencias: «Ninguna consulta coincide con tu búsqueda» y «Limpiar filtros».

## 5. Pantalla (plan gratuito)

1. La lista del hijo se ve completa; **«Buscar en el historial»** lleva la marca «Plan completo» y abre el aviso del plan
   («Historial con búsqueda y filtros en el plan completo…»); «Ver planes» abre `/planes`; «Entendido» y Escape lo cierran.
2. Entrar a `/children/<id>/historial` a mano: el mismo aviso, y «Entendido» regresa al hijo.

## 6. Automatizado

```bash
cd backend && go test ./... -cover                 # >90 %, con DATABASE_URL
cd frontend && npx vitest run --coverage           # >90 %
cd frontend && npx playwright test historial-consultas   # 390 y 1280 px
```
