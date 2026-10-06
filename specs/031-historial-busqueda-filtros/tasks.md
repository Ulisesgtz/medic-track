---

description: "Lista de tareas de la spec 031: historial con búsqueda y filtros (plan de pago)"
---

# Tareas: Historial con búsqueda y filtros (plan de pago)

**Entrada**: `/specs/031-historial-busqueda-filtros/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en backend y frontend y Playwright a 390 y 1280 px.

**Organización**: US1 (encontrar una consulta del pasado: backend + pantalla), US2 (el plan gratuito conserva su lista y ve el
aviso: entrada, aviso y rechazo del servidor) y US3 (buscar sin perderse: el criterio se conserva, pastillas, estados). El
backend es la base de las tres; sin migración, sin dependencias nuevas.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin depender de una tarea sin terminar)
- Todas las rutas son desde la raíz del repositorio. Los textos van en español; el código, en inglés.

---

## Fase 1: Línea base

- [ ] T001 Desde la rama `feature/031-historial-busqueda-filtros`: `cd backend && set -a && . ./.env.local && set +a && go test ./internal/consultation/... ./internal/server/... -cover` y `cd frontend && npx tsc --noEmit && npx vitest run src/features/consultations` en verde

## Fase 2: Backend (base de US1, US2 y US3)

- [ ] T002 [US1] Crear `backend/internal/consultation/search.go` con los tipos `HistorySearch` (`Q`, `From`, `To` como `*time.Time` solo fecha, `Doctor`, `Medication`, `SymptomCodes`, `Kind`) y `HistoryOptions` (`Doctors`, `Medications`), las constantes de `Kind` (`all`, `treatment`, `record`), `foldSpanish` (`strings.ToLower` + sustitución de `áéíóúüñÁÉÍÓÚÜÑ` por `aeiouunaeiouun`, research R2) y `validateHistorySearch` (puro): recorta; `Q` ≤ 100 runas, `Doctor`/`Medication` ≤ 200, `Kind` vacío = `all` y otro valor es error, `From ≤ To`, `SymptomCodes` sin repetidos y ≤ 30 (research R5). Devuelve `ValidationErrors` con los `field` del contrato (`q`, `from`, `to`, `doctor`, `medication`, `symptomCodes`, `kind`). Pruebas en `search_test.go`: plegado con acentos, mayúsculas, `ü`/`ñ` y texto sin cambios; cada regla de validación; vacío no filtra; repetidos se ignoran
- [ ] T003 [US1] `backend/internal/consultation/errors.go`: `PlanLimitHistorySearch = "history_search"`; `handler.go`: `planLimitBody` dice «Searching and filtering the history is part of the paid plan» para ese motivo (los otros dos no cambian). Prueba en `plan_test.go`/`handler_test.go` del texto y del `reason`
- [ ] T004 [US1] `repository.go`: factorizar el escaneo de `GetByChild` en un auxiliar (`scanSummaries`) que usen la lista y la búsqueda, **sin cambiar el comportamiento ni el orden de la lista simple**; en `search.go`, `(*Repository).planOfChild` (una consulta de solo lectura: `accounts.plan` del dueño del hijo; `ErrChildNotFound` si no existe) y `requirePaid` que devuelve `&PlanLimitError{Reason: PlanLimitHistorySearch}` si no es `paid` (reutiliza `planPaid`)
- [ ] T005 [US1] `(*Repository).Search(ctx, childID, HistorySearch)` en `search.go`: primero el hijo y el plan (T004), luego verifica que cada código de síntoma exista en `symptoms` (activo o retirado; si falta alguno `ErrSymptomNotAvailable`), y arma la consulta con parámetros posicionales (nunca texto pegado): `c.child_id = $1`, `strpos(translate(lower(c.doctor_name || ' ' || c.notes), …), $q) > 0 OR EXISTS(medications …)` para el texto (research R3), `c.consult_date >= $from`/`<= $to`, `c.doctor_name = $doctor`, `EXISTS(medications m WHERE m.name = $medication)`, síntomas «todos» con `(SELECT count(DISTINCT symptom_code) FROM consultation_symptoms WHERE consultation_id = c.id AND symptom_code = ANY($codes)) = $n`, `kind` con `record_only`; orden `c.consult_date DESC, c.created_at DESC, c.id`. Misma forma de fila que la lista. Pruebas en `search_test.go` contra la base: cada criterio solo y la matriz de combinaciones (cero de más y cero de menos, SC-005); acentos y mayúsculas en doctor, notas y medicamento (SC-006); extremos de fecha incluidos y solo `from` o solo `to`; síntoma retirado sigue encontrando; consulta solo-registro se encuentra por su medicamento; `%` y `_` en el texto se tratan como texto; plegado SQL = plegado Go sobre los mismos textos; hijo sin consultas = lista vacía; cuenta gratuita → `ErrPlanLimit` `history_search` **sin filas**; hijo inexistente → `ErrChildNotFound`
- [ ] T006 [US1] `(*Repository).HistoryOptions(ctx, childID)` en `search.go`: mismo hijo y plan; `doctors` y `medications` distintos (recortados, sin vacíos), ordenados por el texto plegado y luego por el original; listas vacías (no `null`) sin consultas. Pruebas: distintos y ordenados sin distinguir acentos, no unifica «Dr.»/«Dra.», solo las del hijo, gratuita rechazada
- [ ] T007 [US1] `service.go`: `SearchConsultations(ctx, childID, HistorySearch)` (valida con T002 antes de tocar la base y llama a `Search`) y `HistoryOptions`. Pruebas en `service_test.go`: un criterio inválido ni llega a la base (no consulta plan), uno válido sí
- [ ] T008 [US1] `handler.go`: `SearchConsultations` (`POST /children/{childId}/consultations/search`, cuerpo con tope `maxRequestBodyBytes`, campos opcionales de `contracts/history-search.md`, fechas `YYYY-MM-DD` mal formadas = 400 en su campo) y `HistoryOptions` (`GET /children/{childId}/history-options`); todo por `*httpx.Responder`; errores: 400 `validation_error` (`symptom_not_available` para un código desconocido), 404 `child_not_found`, **422** `freemium_consultation_limit_exceeded` con `reason: "history_search"` (usa `planLimitBody`); Swagger completo (`@Summary`, `@Param`, `@Success`, `@Failure`, `@Router`, y `planLimitResponseDoc` para el 422). Pruebas en `handler_test.go`: forma de la respuesta, los 400, el 422 de una cuenta gratuita **sin consultas en la respuesta**, 404 por UUID mal formado, y que **el texto buscado no aparece en `error_logs`** tras una petición que falla (SC-004, FR-015)
- [ ] T009 [US1] `backend/internal/server/router.go`: las dos rutas con `ownsChild`; `router_test.go`: una fila en `routes()` por ruta (401 sin sesión, 403 hijo ajeno, dueño llega al handler)
- [ ] T010 [US1] Prueba de escala en `search_test.go`: 500 consultas de un hijo (con medicamentos y síntomas) y una búsqueda combinada responde en < 1 s (SC-002) y con el conteo exacto
- [ ] T011 Swagger: desde `backend/`, `go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd` y `git diff` solo con lo nuevo; luego `go vet ./... && go test ./... -cover` (>90 % de `./internal/...`)

## Fase 3: US1 — la pantalla Historial (plan de pago)

- [ ] T012 [P] [US1] `frontend/src/features/consultations/types.ts` y `api.ts`: tipos `HistoryCriteria`/`HistoryOptions`; `searchConsultations(childId, request, token)` (POST, cuerpo con solo los criterios no vacíos) y `fetchHistoryOptions(childId, token)`; `ConsultationApiError` gana el tipo `plan_limit_history_search` (422 con `reason: "history_search"`; un 422 de otro motivo sigue como antes). Pruebas en `api.test.ts` (cuerpo sin vacíos y **sin texto en la dirección**, 400 con `details`, 422, 403/404)
- [ ] T013 [P] [US1] `frontend/src/features/account-signup/FreemiumLimitModal.tsx`: motivo `'history_search'` (título «Historial con búsqueda y filtros», cuerpo «Buscar y filtrar el historial es parte del plan completo. Todo lo que ya registraste se mantiene y lo sigues viendo en tu lista.», neutral, Principio I) y su prueba en `FreemiumLimitModal.test.tsx`
- [ ] T014 [P] [US1] Crear `features/consultations/historyCriteria.ts` (+ `historyCriteria.test.ts`): `HistoryCriteria` (`q`, `from`, `to`, `doctor`, `medication`, `symptomCodes`, `kind`), `EMPTY_CRITERIA`, `activeCount`, `isEmpty`, `toRequest` (omite lo vacío y recorta el texto), `readStored(childId)` / `writeStored` / `clearStored` en `sessionStorage` con clave `historial:<childId>`, todo en `try/catch` y descartando lo inválido al leer (research R10). Pruebas: ida y vuelta, JSON roto, valores de tipo equivocado, `sessionStorage` bloqueado (sin lanzar), clave por hijo
- [ ] T015 [US1] Crear `features/consultations/useHistory.ts` (+ test): `useHistoryCriteria(childId)` (estado inicial desde `readStored`; cambios que se guardan; el **texto** se aplica a la búsqueda con *debounce* de 300 ms y lo demás de inmediato; `clear`, `remove(criterio)`), `useHistorySearch(childId, criteria)` (`useQuery`, clave con el criterio, `placeholderData: keepPreviousData`, sin reintentos) y `useHistoryOptions(childId)` (`staleTime` largo). Pruebas con fake timers del *debounce*
- [ ] T016 [P] [US1] Crear `features/consultations/HistoryFilters.tsx` (+ test): campo de búsqueda (`type="search"`, etiqueta visible), «Desde» y «Hasta» (`type="date"`; aviso en el campo si el rango está invertido, sin pedir nada al servidor), «Doctor» y «Medicamento» (`<select>` con «Todos» y lo de `useHistoryOptions`), «Tipo» (tres opciones: Todas / Con tratamiento / Solo registro) y los síntomas con `SymptomPicker` (si su etiqueta fija «¿Qué síntomas tuvo?» no sirve aquí, se le agrega una prop opcional `label`); estilos de `shared/ui/formStyles.ts`, áreas táctiles de 44 px; `variant` `'phone'`/`'desktop'`
- [ ] T017 [US1] Crear `features/consultations/HistoryPage.tsx` (+ test): `useIsDesktop` elige uno de dos árboles. **Móvil**: cabecera oscura (← Tus consultas, «Historial», el hijo), búsqueda, botón «Filtros (N)» que despliega `HistoryFilters`, resultados con `ConsultationCard variant="phone"`. **Web**: encabezado y dos columnas (filtros a la izquierda, fijos al desplazar; resultados a la derecha con `variant="desktop"`). Envuelta en `AppShell`; el conteo («12 consultas»); hijo sin consultas = el mensaje de la lista; sin diseño mezclado (sin clases `lg:` que sirvan a ambos). Pruebas en los dos diseños: carga completa, el texto filtra, tocar una tarjeta lleva al detalle
- [ ] T018 [US1] `frontend/src/App.tsx`: ruta `/children/:childId/historial` detrás de `RequireSession` (antes del comodín); prueba de la ruta si `App.test.tsx` las cubre

## Fase 4: US2 — el plan gratuito conserva su lista y ve el aviso

- [ ] T019 [US2] Crear `features/consultations/HistoryEntry.tsx` (+ test), mismo patrón que `NewConsultationEntry` (spec 030): con plan `free` es un botón con la marca «Plan completo» que abre `FreemiumLimitModal reason="history_search"` (foco de vuelta al botón, «Ver planes» → `/planes`); con `paid` o la cuenta sin cargar, un `Link` a `/children/:childId/historial`. `ChildDetailPage.tsx` la agrega junto al título «Consultas» en ambos diseños (móvil: junto a «+ Nueva»; web: junto al título de la lista), con el `useCurrentAccount` que ya usa. Pruebas en `HistoryEntry.test.tsx` y `ChildDetailPage.test.tsx` (los dos planes, los dos diseños; la lista de consultas sigue completa para el gratuito)
- [ ] T020 [US2] `HistoryPage.tsx`: si `account.plan === 'free'` **o** el servidor responde 422 `history_search`, no se dibuja la búsqueda: aparece el aviso del plan (el mismo pop-up), «Entendido» regresa al detalle del hijo y «Ver planes» abre `/planes`. Pruebas: plan gratuito por la dirección directa; 422 con la cuenta aún sin cargar; una cuenta de pago nunca lo ve

## Fase 5: US3 — buscar sin perderse

- [ ] T021 [P] [US3] Crear `features/consultations/ActiveCriteria.tsx` (+ test): una pastilla quitable por criterio activo («Texto: amox», «Desde 1 ene», «Dr. López», «Fiebre», «Solo registro»…, cada una con nombre accesible «Quitar …») y «Limpiar todo»; nada si no hay criterios; sin rojo ni ámbar (tokens del sistema visual)
- [ ] T022 [US3] `HistoryPage.tsx`: integra `ActiveCriteria`; estados: sin coincidencias → «Ninguna consulta coincide con tu búsqueda» + «Limpiar filtros»; falla de carga → aviso (`Notice`) con «Reintentar» que conserva lo escrito; la lista **no parpadea en blanco** entre un resultado y el siguiente (`keepPreviousData`); el criterio se guarda al cambiar y se lee al montar (volver del detalle, «atrás» y recargar lo recuperan). Pruebas: pastilla quita solo ese criterio; «Limpiar todo»; sin coincidencias; reintentar; desmontar y montar de nuevo conserva el criterio; la lista anterior sigue visible mientras carga la siguiente

## Fase 6: Extremo a extremo

- [ ] T023 [US1] [US2] [US3] `frontend/e2e/historial-consultas.spec.ts` (390 y 1280 px, `designs` de `helpers.ts`): cuenta de pago con un hijo y varias consultas sembradas por la API (doctores, medicamentos, síntomas y fechas distintos, una solo registro) → «Buscar en el historial» abre el Historial con todas y el conteo; el texto («lopez» encuentra «López»; «amox»), doctor, rango, síntomas «todos», tipo y una combinación dan exactamente lo esperado; pastilla quitable y «Limpiar todo»; sin coincidencias; abrir una consulta, volver (flecha y `page.goBack()`) y recargar conservan criterios y resultados; sin desplazamiento horizontal a 390 px. Cuenta **gratuita** (`plan: 'free'`): la lista completa, la entrada con «Plan completo» abre el aviso («Ver planes» → `/planes`, «Entendido» cierra) y entrar a `/children/<id>/historial` a mano muestra el aviso y regresa al hijo. Ajusta `e2e/helpers.ts` si hace falta un auxiliar para sembrar consultas
- [ ] T024 [US1] Ajustar los specs que ya recorren la lista del hijo si la entrada nueva los afecta (`detalle-hijo-movil.spec.ts`, `detalle-consulta-hijo.spec.ts`: selectores por rol y nombre, no por posición)

## Fase 7: Cierre

- [ ] T025 [P] Documentación: `CLAUDE.md` (línea de la feature 031), `backend/CLAUDE.md` (los dos endpoints, `foldSpanish`, el motivo `history_search`, que el texto no va en la dirección ni se registra, sin migración), `frontend/CLAUDE.md` (pantalla, `HistoryEntry`, criterio en `sessionStorage`, sin URL) y `BACKLOG.md` (el segundo paso del «Orden sugerido» pasa a hecho; «Historial de todos los hijos» queda como futuro)
- [ ] T026 Verificación completa: `cd backend && go vet ./... && go test ./... -cover` (>90 %), `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run --coverage` (>90 %) y `npx playwright test` (con el backend corriendo), sin tocar lo que pasa hoy
- [ ] T027 Abrir el PR a `develop` con el resumen, el aviso de que el texto no viaja en la dirección y el recordatorio de que **no hay mock** (se mostrará al usuario para ajustes), y revisar el CI

---

## Dependencias y orden

- **Fase 1** primero. **Fase 2** (backend) antes de la pantalla: T002 → T004 → T005/T006 → T007 → T008 → T009; T003 puede ir junto a T002; T010 y T011 al final de la fase.
- **Fase 3**: T012, T013 y T014 son independientes entre sí ([P]); T015 depende de T012 y T014; T016 de T012 y T013; T017 de T015 y T016; T018 de T017.
- **Fase 4** (US2) depende de T013 y T017; **Fase 5** (US3) de T017.
- **Fase 6** y **7** al final. T025 se puede escribir mientras corren las pruebas.

## Ejecución en paralelo

- Backend y frontend avanzan a la vez en cuanto el contrato (`contracts/history-search.md`) está fijo: T012–T014 no necesitan el servidor.
- T021 (pastillas) es independiente de T016/T017.

## Estrategia de implementación

1. **MVP = US1 completa** (Fases 2 y 3): el servidor y la pantalla de plan de pago. Ya se puede probar en DEV con una cuenta `paid`.
2. **US2** cierra el corte de producto (el gratuito ve el aviso y el servidor lo rechaza); sin ella la función estaría abierta a todos, así que **se entrega junto con US1**.
3. **US3** pule la experiencia (conservar, pastillas, estados). Se puede revisar con el usuario antes de las E2E.
