# Quickstart: validar «Ver la app sin conexión» (spec 067)

## Requisitos

- Backend local corriendo (ver `backend/CLAUDE.md`) y `frontend/.env.local` con `VITE_CLERK_PUBLISHABLE_KEY` de la instancia de desarrollo.
- El precache **solo** existe en el build: el modo de desarrollo (`npm run dev`) no sirve para probar esto.

```bash
cd frontend && npm run build && npx vite preview --port 5173 --strictPort
```

## 1. Pruebas automáticas

```bash
cd frontend && npx vitest run src/shared/offline --coverage
```

```bash
cd frontend && npx playwright test e2e/sin-conexion.spec.ts
```

Esperado: todo en verde. La E2E simula la app instalada en un iPhone (research R12).

## 2. Teléfono (Chrome de escritorio, emulando)

1. DevTools → «Toggle device toolbar» con un iPhone, y en *Rendering* → «Emulate CSS media feature display-mode: standalone» (o instalar la app en Android).
2. Iniciar sesión, abrir el inicio, un hijo y una consulta.
3. DevTools → *Network* → «Offline». Recargar.
   - Abre la app (no el dinosaurio) con «Sin conexión · datos de las HH:MM».
   - El hijo y la consulta muestran sus datos; la foto de la receta dice «La foto necesita conexión.»
   - Un hijo o consulta que no se abrió dice «Esta pantalla necesita conexión.»
4. Tocar «Marcar»: la toma no cambia y aparece «Marcar necesita conexión. Tu marca no se guardó.»
5. Abrir «Nueva consulta», escribir el doctor y «Guardar»: aviso «Esto necesita conexión…» y lo escrito sigue.
6. Volver a «Online»: en menos de 5 s el aviso se va y los datos se actualizan solos.
7. *Application* → *IndexedDB* → `peditrack-offline`: hay entradas; ninguna con `photoBase64` lleno.
8. Cerrar sesión: `peditrack-offline` queda vacía. Volver a «Offline» y recargar: «Necesitas conexión para abrir PediTrack».

## 3. Computadora (FR-012)

1. Chrome de escritorio sin emular, iniciar sesión y navegar.
2. *Application* → *IndexedDB*: **no existe** `peditrack-offline`.
3. «Offline» y recargar: «Necesitas conexión para abrir PediTrack» (el cascarón sí abre).

## 4. Retención (FR-013)

En la consola, con datos guardados: cambiar el reloj del sistema 8 días adelante (o usar `vi.setSystemTime` en la prueba unitaria) y abrir sin conexión: «Necesitas conexión para abrir PediTrack» y la base vacía.

## 5. Teléfono del hijo (spec 047)

Canjear una liga de acceso en el teléfono emulado, abrir `/hijo/hoy` con conexión, pasar a «Offline» y recargar: sus tomas con el aviso; «Marcar» dice que necesita conexión. Quitar el acceso desde el Tutor, volver a «Online»: el teléfono pierde el acceso y `peditrack-offline` queda vacía.

## 6. Versión nueva y avisos (spec 017, spec 011)

- Con la app abierta, publicar otro build (`npm run build` de nuevo con otro contenido) y esperar el aviso «Hay una versión nueva · Actualizar»: al tocarlo carga lo nuevo.
- Con recordatorios activos, un aviso de toma llega y «Tomada» la marca (`e2e/recordatorios.spec.ts` sigue en verde).

## 7. iPhone real (dueño)

Con la app instalada desde DEV: usarla con señal, poner modo avión, cerrar la app del todo y abrirla: debe abrir con los datos y el aviso. Cerrar sesión, modo avión, abrir: «Necesitas conexión».
