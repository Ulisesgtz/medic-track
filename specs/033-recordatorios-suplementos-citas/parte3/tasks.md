# Tareas: Rutinas personales (parte 3 de la spec 033)

**Entrada**: [plan.md](./plan.md), [../spec.md](../spec.md) (US6), [../referencia/rutinas-personales-decisiones.md](../referencia/rutinas-personales-decisiones.md).
Formato `[ID] Descripción`. Un solo PR; un commit por fase.

## Fase 1: Backend

- [x] T201 Migración `0021_create_personal_routines.sql`: `personal_routine_notices`, índice de activas personales y CHECK de que una rutina sin hijo es de su propia creadora
- [x] T202 `internal/access`: `onRoutineQuery` da `Full` a la dueña de una rutina sin hijo y `None` a los demás; pruebas
- [x] T203 `internal/supplement`: plan efectivo (propio o de familia de pago) en `routineSelect`, `CreatePersonal`, tope por persona (también al reanudar), `ListPersonal`, aviso visto; servicio y pruebas contra la base
- [x] T204 Handlers y rutas (`GET/POST /accounts/{accountId}/routines`, `POST …/routines/notice-seen`) con `ownsAccount`, filas en `router_test.go`, Swagger regenerado
- [x] T205 `internal/reminder`: avisos de tomas personales solo a su dueña y «Tomada» sobre una toma personal; pruebas
- [x] T206 Verificar: `cd backend && go vet ./... && go test ./... -cover`, commit

## Fase 2: Frontend

- [x] T211 API y hooks personales (`features/supplements/`), `MisSuplementosSeccion`, aviso de primera vez, vacío / plan / tope / plan caducado / invitada
- [x] T212 Páginas `/mis-suplementos`, `/mis-suplementos/nueva`; formulario, detalle y edición en modo personal; «Tus avisos» y finalizar
- [x] T213 Inicio: bloque «Personal · Mis suplementos» con «Tus tomas de hoy» (ambos diseños); barra lateral web («Inicio», «Hijos», «Personal»); «← Inicio» en móvil; `TomaChip` sin autor
- [x] T214 Pruebas unitarias (>90 %), tsc y eslint

## Fase 3: E2E y cierre

- [x] T221 `frontend/e2e/suplementos-personales.spec.ts` (390 y 1280 px; dueña, su pareja no la ve ni la alcanza por la API, plan gratuito, invitada)
- [x] T222 Documentación (`CLAUDE.md` ×3, `DEPLOY.md` con la `0021`, `README.md`, `BACKLOG.md`), Swagger, desviaciones, code review, PR a `develop`
