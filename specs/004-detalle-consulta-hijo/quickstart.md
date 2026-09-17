# Guía de Validación: Detalle de Hijo — Consultas y Recetas

Prerrequisito: backend corriendo (`cd backend && go run ./cmd/api`) con `DATABASE_URL` apuntando a Postgres con las migraciones de features 001-003 y 004 aplicadas; frontend corriendo (`cd frontend && npm run dev`); una cuenta con al menos un hijo ya creada (ver quickstart.md de specs/003).

## Escenario 1 — Hijo sin consultas (FR-002)

1. Desde `/home`, haz click en el nombre de un hijo que no tiene ninguna consulta registrada.
2. **Esperado**: `GET /children/{childId}/consultations` (contracts/get-consultations.md) devuelve `consultations: []`; la pantalla muestra un estado que invita a registrar la primera consulta, con un botón "Registrar consulta".

## Escenario 2 — Registrar una consulta con un medicamento (FR-003 a FR-009)

1. Desde la pantalla de detalle del hijo, presiona "Registrar consulta".
2. Llena doctor, fecha, adjunta una foto de receta (desde archivo en desktop), agrega un medicamento con nombre, frecuencia (p. ej. cada 8 horas), duración (p. ej. 3 días) y horario de inicio (p. ej. 08:00), y escribe algo en síntomas.
3. Guarda.
4. **Esperado**: `POST /children/{childId}/consultations` (contracts/post-consultations.md) responde `201` con el detalle completo; la consulta aparece de inmediato en el listado del Escenario 1.

## Escenario 3 — OCR no bloquea el llenado manual (FR-007)

1. Repite el Escenario 2 pero adjunta una foto sin texto legible (p. ej. una imagen en blanco).
2. **Esperado**: el formulario sigue permitiendo llenar todos los campos manualmente; guardar funciona igual que en el Escenario 2.

## Escenario 4 — Consulta sin medicamentos es rechazada (FR-015)

1. Intenta guardar una consulta sin agregar ningún medicamento.
2. **Esperado**: `400 validation_error`; la consulta no se crea.

## Escenario 5 — Ver el detalle y las tomas generadas de una sola vez (FR-009, FR-013)

1. Abre el detalle de la consulta creada en el Escenario 2 (medicamento cada 8h, 3 días, inicio 08:00).
2. **Esperado**: `GET /consultations/{consultationId}` (contracts/get-consultation-detail.md) devuelve 9 tomas (3 al día × 3 días) ya generadas para ese medicamento, todas con `taken: false`.

## Escenario 6 — Marcar una toma como tomada, en cualquier momento (FR-011, FR-016)

1. En el detalle de la consulta, marca una de las tomas como "tomada".
2. **Esperado**: `PATCH /consultations/{consultationId}/doses/{doseId}` (contracts/patch-dose.md) responde `200` con `taken: true`; el cambio se refleja en pantalla sin recargar.
3. Repite marcando una toma cuya fecha ya pasó (o simula avanzar el reloj del sistema).
4. **Esperado**: el marcado funciona igual, sin ningún bloqueo por "tratamiento terminado" (Aclaraciones de spec.md).

## Escenario 7 — Medicamento sin horario de inicio no genera tomas (FR-010)

1. Registra una consulta con un medicamento sin definir horario de inicio.
2. **Esperado**: en el detalle de esa consulta, ese medicamento muestra su frecuencia y duración, pero `doses: []` — ningún registro marcable.

## Escenario 8 — Consulta e hijo inexistentes (Casos Límite)

1. Navega a `/children/{uuid-inexistente}`.
2. **Esperado**: `404 child_not_found`; la pantalla lo trata igual que "sin consultas" más un mensaje de error, no una pantalla en blanco.
3. Navega a `/consultations/{uuid-inexistente}`.
4. **Esperado**: `404 consultation_not_found`.

## Cobertura relacionada

- Playwright E2E: Escenarios 2, 5 y 6 encadenados (registrar consulta → ver detalle con tomas generadas → marcar una toma), por ser uno de los 4 flujos críticos nombrados explícitamente en la constitución (Principio VI).
- Unit/integration Go: generación de tomas (`frequencyHours` × `durationDays` → N filas `doses`) con casos límite (duración de 1 día, frecuencia de 24h → exactamente 1 toma); validación de campos; inmutabilidad (sin endpoint de edición/borrado expuesto).
- Unit frontend: `useOcrSuggestion` (mockeando `tesseract.js`), `ConsultationForm` (validación, autollenado editable), `DoseCheckbox` (marcar/desmarcar).
