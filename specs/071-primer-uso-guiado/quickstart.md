# Quickstart: validar el primer uso guiado

## Requisitos

- Postgres local con todas las migraciones, incluida la `0038_first_use_guide.sql`.
- Backend (`cd backend && go run ./cmd/api`) y frontend (`cd frontend && npm run dev`), o el arnés de CI: `scripts/e2e-local.sh`.
- Llaves de la instancia de desarrollo de Clerk (ver «E2E con Clerk» en `frontend/CLAUDE.md`).

## Escenarios

1. **Ventana del aviso (A0)** — crear una cuenta nueva con un hijo. Al llegar al inicio: hoja desde abajo a 390 px y diálogo de 600 px a 1280 px; Escape y tocar fuera no la cierran; «Entendido» la cierra y al recargar no vuelve (contrato: `disclaimerAccepted: true`).
2. **Guía (A)** — tras «Entendido», «Primeros pasos» entre el saludo y «Tu día», «Tres pasos, en el orden que quieras.» en Chromium de Android emulado; en la web de escritorio sin instalación ofrecida, «Dos pasos…».
3. **Paso 1 (B)** — con un hijo, el botón lleva a «Nueva consulta» del hijo; guardar una consulta y volver: check verde, «Registraste la consulta con …» y «Ver consulta». Con dos hijos: primero «¿De quién es la consulta?».
4. **Ahora no (F)** — tocar «Ahora no»: aviso de 8 s, la fila «Primeros pasos · Ver guía» primera de la lista de abajo (web: franja de 6). Recargar y abrir otra sesión de la misma cuenta: sigue cerrada. Tocar la fila: vuelve la guía.
5. **Avisos (D)** — en Chromium con el permiso de notificaciones bloqueado: instrucciones y «Ya los activé». Concederlo y tocar «Ya los activé»: el paso queda hecho.
6. **iPhone (C)** — en un iPhone real con Safari sin instalar: instrucciones de Safari en el paso 2 y el paso 3 con candado e «Ir al paso 2». Instalar, abrir desde el ícono: paso 2 hecho y el 3 se puede activar.
7. **Todo hecho (E)** — con los pasos hechos: la línea verde 8 s; recargar: nada. En otro navegador con la misma cuenta: vuelve con el paso 1 hecho.
8. **Quién no la ve** — una persona invitada que solo ve hijos compartidos, una cuenta sin hijos y una cuenta en pausa: el inicio igual que antes.

## Pruebas

```bash
cd backend && go test ./... -cover
```

```bash
cd frontend && npx vitest run --coverage
```

```bash
scripts/e2e-local.sh e2e/primer-uso.spec.ts
```
