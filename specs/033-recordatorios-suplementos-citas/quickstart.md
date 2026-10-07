# Guía de validación — Parte 1: rutinas de suplementos (spec 033)

Prerrequisitos: backend y frontend locales (ver `CLAUDE.md`), migración `0019` aplicada, claves VAPID en el backend, dos cuentas con correo `+clerk_test`.
Contratos: [contracts/routines.md](./contracts/routines.md). Modelo: [data-model.md](./data-model.md).

## 1. Crear y marcar (Historia 1)

1. Da plan de pago a la cuenta A: `UPDATE accounts SET plan = 'paid' WHERE lower(email) = lower('…');` y entra con un hijo.
2. En el detalle del hijo, «Suplementos» → «+ Nueva rutina» → nombre «Vitamina D», «Todos los días», 08:00, «Sin fin» → «Guardar rutina».
   **Esperado**: la rutina aparece «Activa» con la toma de hoy y las de los próximos días; «Tomas de hoy» la lista con la etiqueta «SUPLEMENTO».
3. Marca la toma: **Esperado** «✓ Tomada / por Ana, hh:mm» y el resumen cuenta una menos sin marcar.
4. «Cada N horas»: primera toma 06:00, cada 8 → el formulario muestra «06:00, 14:00 y 22:00»; guarda y comprueba tres tomas por día.

## 2. Avisos por persona (Historia 1 y 2)

1. Con la app instalada (o el dispositivo simulado de `e2e/familia-recordatorios.spec.ts`), activa recordatorios en dos cuentas de la misma familia.
2. Haz que una toma venza sin marcar. **Esperado**: un aviso por persona (consulta `supplement_dose_reminders`: una fila por persona y toma); ninguno si ya estaba marcada.
3. En el detalle de la rutina apaga «Tus avisos» con el Cuidador: **Esperado** que solo él deje de recibir el aviso de esa rutina; el Tutor sigue recibiéndolo.

## 3. Familia y plan (Historia 2)

1. El Cuidador ve la sección y marca tomas, pero no ve «+ Nueva rutina», «Editar», «Pausar» ni «Finalizar»; una llamada directa al API responde `403`.
2. Cuenta gratuita: la sección muestra la tarjeta «Plan completo» y no se puede crear (`422 … reason: supplements`); lo ya creado se sigue viendo y marcando y **sigue avisando**.
3. Crea 10 rutinas activas: la 11.ª muestra el aviso de tope; pausa una y ya se puede crear otra.
4. Quita al Cuidador de la familia: deja de ver la sección y de recibir avisos en el siguiente tick.

## 4. Pausar, editar y finalizar (Historia 3)

1. Marca dos tomas, cambia el horario → las marcadas y las pasadas no cambian; las futuras siguen el horario nuevo («Los cambios cuentan desde la siguiente toma»).
2. Pausa → desaparecen las futuras sin marcar y no hay avisos; «Reanudar» (única acción sólida) regenera desde ahora, sin tomas atrasadas.
3. Finaliza → diálogo de tres filas; después «Terminada el … · N de M tomas», sin «Reanudar» ni «Editar».

## 5. Privacidad y pruebas

- En la pestaña de red nada de lo escrito (nombre, nota) aparece en una dirección; `error_logs` no contiene esos textos (hay prueba).
- `cd backend && go test ./... -cover` (>90 %), `go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd` sin cambios pendientes,
  `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run --coverage`, `npx playwright test e2e/suplementos*.spec.ts` (390 y 1280 px, dos sesiones).
