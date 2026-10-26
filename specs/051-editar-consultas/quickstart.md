# Guía de validación: Editar consultas (spec 051)

## Requisitos previos

- Postgres local con todas las migraciones, **incluida la `0030_consultation_edits.sql`** (en DEV: aplicarla antes de hacer
  merge a `develop`, ver R9).
- `DATABASE_URL=postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable`.
- Backend (`go run ./cmd/api`) y frontend (`npm run dev`) para la prueba manual; las E2E corren en el CI (Clerk).

## Pruebas automáticas

```bash
cd backend && go test ./internal/consultation/... ./internal/server/... -cover
```

```bash
cd backend && DATABASE_URL="$DATABASE_URL&pool_max_conns=4" go test ./internal/consultation/...
```

```bash
cd frontend && npx vitest run src/features/consultations --testTimeout=30000 --maxWorkers=4
```

```bash
cd frontend && npx playwright test e2e/editar-consulta.spec.ts --project=chromium
```

## Escenarios a comprobar

1. **Datos (US1)**: editar doctor, síntomas, notas y nombre de un medicamento de una consulta con tomas marcadas → el detalle
   muestra lo nuevo y «Editada el … por …»; todas las tomas y sus «por Ana» iguales.
2. **Horario (US2)**: medicamento de 3 días cada 6 h con tomas pasadas (una marcada, una sin marcar) y una futura marcada por
   adelantado → cambiar a cada 8 h, confirmar el aviso → lo pasado y lo marcado quedan, las futuras sin marcar van cada 8 h, sin
   dos tomas a la misma hora ni tomas nuevas en el pasado. Un cambio solo de nombre no pide confirmación.
3. **Fecha**: mover la fecha de la consulta un día antes → se trata como cambio de horario de todos los medicamentos.
4. **Finalizado**: de un tratamiento finalizado no se pueden cambiar frecuencia, duración ni primera toma (el campo está
   bloqueado; por API → 400 `treatment_ended`).
5. **Agregar y quitar (US3)**: agregar un medicamento → sus tomas futuras aparecen en el detalle y en «Tomas de hoy»; quitar uno
   sin marcas → desaparece; uno con marcas no ofrece «Quitar» (por API → 409 `medication_has_marks`).
6. **Plan gratuito**: con un tratamiento activo en otra consulta, agregar un medicamento con tomas por delante → aviso del plan,
   nada guardado; editar la consulta que ya es el tratamiento activo → se guarda.
7. **Conflicto**: abrir el formulario en dos pestañas, guardar en una y luego en la otra → la segunda ve el aviso y recarga.
8. **Acceso**: un Cuidador y un Tutor de familia vencida no ven «Editar consulta» y reciben 403 por API; el teléfono del hijo no
   tiene la ruta.
9. **Privacidad**: después de errores provocados con un doctor «Dra. Secreta», `error_logs` no contiene ese texto.
