# Guía de validación: Actualizar datos y versión

**Requisitos**: backend y frontend corriendo; para el iPhone, el túnel de `DEPLOY.md` (`npm run preview:tunnel` genera
`dist/version.json` de verdad).

## 1. Jalar para actualizar (móvil, 390 px)
1. Abre el detalle de un hijo con una toma pendiente; desde otro navegador márcala como tomada.
2. En el teléfono, con la página arriba, jala hacia abajo y suelta: sale el indicador «Actualizando…» y la toma aparece
   marcada, sin recargar (la URL y el scroll no cambian).
3. Jala menos de 72 px y suelta: no pasa nada. Desplázate hacia abajo con la página a media altura: no hay indicador.
4. En «Nueva consulta» elige una foto y escribe el doctor; jala y suelta: todo sigue ahí.
5. Corta la red y jala: «No pudimos actualizar. Revisa tu conexión.» y los datos previos siguen visibles.
6. A 1280 px el gesto no existe.

## 2. Aviso de versión nueva (390 y 1280 px)
1. Con la app abierta (build de túnel), cambia el código, vuelve a correr `npm run preview:tunnel` y regresa a la app:
   aparece «Hay una versión nueva · Actualizar».
2. Toca «Actualizar»: recarga y el aviso ya no está.
3. En «Nueva consulta» con datos escritos, repite: pide confirmación; «Cancelar» conserva todo.
4. Sin versión nueva o sin conexión: no hay aviso ni error.

## 3. Automatizado
```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage
npx playwright test e2e/actualizar.spec.ts
```
