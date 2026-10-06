# Guía de validación (Fase 1): Compartir con la familia

Cómo comprobar de punta a punta la **Entrega 1** (Tutores). Datos en `data-model.md`; API en `contracts/family.md`.

## Prerrequisitos

- Base local con las migraciones **0001–0018** (esta función agrega 0017 y 0018), backend y frontend corriendo
  (`backend/CLAUDE.md`, `frontend/CLAUDE.md`).
- **Dos cuentas de prueba distintas** (dos correos de Clerk de desarrollo): **A** con el plan de pago
  (`UPDATE accounts SET plan = 'paid' WHERE lower(email) = lower('…');`) y un hijo con una consulta en curso; **B**, la pareja,
  con cualquier plan y **sin** familia. Las E2E lo hacen solas (`setAccountPlan`, dos contextos de Playwright).

## 1. Invitar y aceptar (US1)

1. Con A: «Familia» → invitar al correo de B como **Tutor** → aparece **Pendiente** con su liga (se copia).
2. Con B (sesión con **ese** correo): abrir la liga → ve el texto de que verá **datos médicos del menor**, el rol y los hijos →
   **Aceptar**. B ve ahora el hijo y las consultas de A en su home, junto a los suyos si los tenía.
3. A ve la invitación como **Aceptada** y a B en la lista con su rol.
4. Con una **tercera** cuenta C (otro correo) la misma liga **no** se puede aceptar (`email_mismatch`); la liga ya usada, vencida o
   cancelada responde «invitación no encontrada» sin datos.
5. Con la familia en 4 personas, invitar a otra → «ya no hay lugar».
6. Con una cuenta **gratuita** «Familia» muestra el aviso del plan y el servidor rechaza invitar (422 `family`).

## 2. Quién marcó (US2)

1. Con A marcar la toma de las 8:00 → B (app abierta) la ve **marcada «por Ana, 08:05»** en **menos de 1 minuto**.
2. B desmarca la de A → permitido (Tutor). Con una marca hecha por B, A también puede desmarcarla.
3. Dos marcas casi simultáneas (A y B) → queda **una**, con el autor de la primera; la otra ve que ya estaba.
4. Una toma marcada **antes** de esta función se ve «tomada» sin «por …».

## 3. Recordatorios por persona (US3)

1. A y B activan recordatorios cada uno en su dispositivo (cada uno elige detalle o genérico).
2. Vence una toma: **a cada uno** le llega **un** aviso (con **su** elección de detalle); nunca dos.
3. Si A la marca antes de su hora, **a nadie** le llega.
4. «Tomada» en el aviso de B marca a nombre de **B**; A la ve «por …» con el nombre de B.

## 4. Salir y quitar (US4)

1. B pide **desvincularse** → aviso de lo que pierde → confirma: B deja de ver a los hijos de A y de recibir sus avisos **al instante**;
   conserva su cuenta; lo que B registró sigue en la familia de A (con «por B» en sus marcas).
2. A **no** tiene forma de quitar a B (Tutor): ni botón ni llamada directa (`403 cannot_remove_tutor`).
3. A no puede salirse de su propia familia (`403 owner_cannot_leave`).
4. A puede invitar de nuevo a B (invitación nueva).

## 5. Plan cancelado (US5)

1. Con B como Tutor, pasar a A a `free` (`UPDATE accounts SET plan = 'free' …`).
2. B **sigue viendo todo** pero «Nueva consulta», «Agregar hijo» e invitar desaparecen (y el servidor responde 403/422 si se
   intenta por otro camino); B **sí puede marcar** tomas. Aparece el aviso neutral de solo lectura.
3. Devolver A a `paid`: B recupera su rol sin nueva invitación.
4. Con A en `free`, B se desvincula e intenta unirse a **otra** familia sin plan de pago → rechazo con el aviso del plan.

## 6. Automatizado

```bash
cd backend && go test ./... -cover                              # >90 %, con DATABASE_URL; incluye la matriz rol × ruta
cd frontend && npx vitest run --coverage                        # >90 %
cd frontend && npx playwright test familia                      # dos sesiones, 390 y 1280 px
```
