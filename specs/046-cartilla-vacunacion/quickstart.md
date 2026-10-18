# Quickstart: validar la cartilla de vacunación

Guía de validación. Detalles en `data-model.md` y `contracts/api.md`.

## 1. En local

**Prerrequisitos**: base local con la migración `0028`; `backend/.env.local` con las llaves de Clerk de desarrollo.

```bash
cd backend && go run ./cmd/api
cd ../frontend && npm run dev
```

1. Con una cuenta (gratuita o de pago) y un hijo, abre la página del hijo: aparece la tarjeta **«Cartilla de vacunación»** (en móvil y en web) con «Sin vacunas registradas».
2. Entra a la cartilla → **Agregar vacuna** → elige «Hepatitis B», pon la fecha y guarda: aparece agrupada con su dosis y fecha. Agrega la misma otra vez: pide confirmar que ya existe; confirma y quedan dos.
3. Agrega una «otra» escrita por ti, corrige su fecha (dice «Corregida el … por Ana») y bórrala (la confirmación dice que no se puede deshacer).
4. Prueba una fecha futura y una anterior al nacimiento: dice cuál es el problema y no guarda.
5. **Foto**: «Guardar foto de la cartilla» → toma o elige una imagen (en el teléfono ofrece Fototeca / Tomar foto / Elegir archivo). Aparece como miniatura; ábrela en grande; sube hasta 10; la 11 explica el tope y deja borrar una.
6. **Ayuda de lectura**: con una foto de una cartilla legible aparecen filas propuestas; edita una, descarta otra y confirma el resto. Con una foto ilegible dice que no encontró nada y puedes seguir a mano. Comprueba en la pestaña de red que la imagen solo va a tu API.
7. **Familia**: invita a un Cuidador: ve la cartilla y las fotos pero no tiene botones de escribir; un Tutor puede todo; una cuenta ajena recibe acceso denegado.
8. Lo registrado sigue visible si el plan de pago termina.

## 2. Pruebas automáticas

```bash
cd backend && go test ./internal/vaccination ./internal/catalog ./internal/server -cover   # >90 %
cd ../frontend && npx vitest run --coverage && npm run build && npx eslint src e2e
npx playwright test e2e/cartilla.spec.ts      # Chromium, a 390 y 1280 px
```

## 3. En DEV (lo hace el dueño con el desarrollador)

1. Aplicar la migración `0028` en la base de DEV **antes** de desplegar el backend.
2. Validar la lista de vacunas sembrada con la Cartilla Nacional de Salud vigente; corregir con SQL si hace falta.
3. Revisar el texto del aviso «Antes de empezar» (versión nueva) y actualizar el aviso de privacidad.
4. Probar con un iPhone real tomar la foto de una cartilla física y abrirla.
