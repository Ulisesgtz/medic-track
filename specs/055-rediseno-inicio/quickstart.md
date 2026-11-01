# Quickstart: validar el rediseño del inicio (spec 055)

## Requisitos

- Postgres local y el backend corriendo (`cd backend && go run ./cmd/api`, con `CLERK_SECRET_KEY`), ver `backend/CLAUDE.md`.
- `frontend/.env.local` con `VITE_CLERK_PUBLISHABLE_KEY` (si no está en el equipo, las E2E las corre el CI).
- Sin migraciones nuevas.

## Pruebas automáticas

```bash
cd frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4
cd frontend && npx tsc --noEmit && npx eslint .
cd frontend && npx playwright test e2e/inicio.spec.ts e2e/hijo.spec.ts --project=chromium
```

Esperado: todo verde, cobertura > 90 %.

## Revisión contra el diseño (390 y 1280 px)

Abrir `referencia/Inicio PediTrack.dc.html` junto a la app al mismo ancho y comparar sección por sección:

1. **Estado 1**: cuenta de pago con dos hijos (uno con medicamento, suplemento y actividad hoy; otro con una toma sin
   registrar) y un suplemento y una actividad personales. «Tu día» primero; Mateo con tres filas y «Marcar»; Sofía con borde
   punteado. «Marcar» → «✓ HH:MM»; el detalle del hijo la muestra «por …».
2. **Estado 2**: todo lo que ya llegó marcado → «✓ Todo marcado hasta ahora» en tarjetas y en «Tu día».
3. **Estado 3**: cuenta nueva → «Antes de empezar», «Aún no registras a tus hijos» y «Agregar hijo» sólido.
4. **Estado 4**: plan gratuito con un hijo → «Tu día» como línea con «Plan completo», «Tu plan incluye un hijo».
5. **Estado 5**: un Cuidador → «Hijos compartidos contigo», sin «+ Agregar hijo», «Lo demás» sin Planes, «Marcar» funciona.
6. **Estado 6**: red lenta → esqueletos; al llegar los datos nada se mueve.
7. **Estado 7**: un teléfono de hijo (`/hijo#<ficha>`) → «Hola, Mateo», Mañana / Tarde / Noche, «Realizado», «Avisos».
8. **Solo lectura**: Tutor de una familia que dejó de pagar → la nota arriba, sin «+ Agregar hijo», «Marcar» funciona.

Lo que no coincida va a `referencia/desviaciones.md` con su motivo.
